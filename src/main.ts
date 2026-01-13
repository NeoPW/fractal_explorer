import './style.css'

const GRID_SIZE = 32
const UPDATE_TIME = 200;
const WORKGROUP_SIZE = 8;
let step = 0;

// request the "paint canvas" which is a html element so that the gpu knows where to apply its paint later
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

if(!navigator.gpu) {
  console.log("ERROR");
  throw new Error("WebGPU not supported in your browser");
}

// adapter is an abstraction for different gpu's (correct one is chosen by the browser) 
const adapter = await navigator.gpu.requestAdapter();
if(!adapter) {
  console.log("ADAPTER ERROR");
  throw new Error("No GPU adaptor found");
}

// now we get the actual primary interface to our gpu, used to send commands and so on
const device = await adapter.requestDevice();

// now we basically make it so that the canvas and our device understand each other -> we get a GPU texture for this frame
const context = canvas.getContext("webgpu");
if(!context) {
  throw new Error("No context")
}
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context?.configure({
  device: device,
  format: canvasFormat
});

const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

const vertices = new Float32Array([
  -0.8, -0.8,
  0.8, -0.8,
  0.8, 0.8,
  -0.8, -0.8,
  0.8, 0.8,
  -0.8, 0.8
]);
const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);

const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
const cellStateStorage = [
  device.createBuffer({
    label: "Cell state A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  }),
  device.createBuffer({
    label: "Cell state B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  })
  ];
for (let i = 0; i < cellStateArray.length; ++i) {
  cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

for (let i = 0; i < cellStateArray.length; i++) {
  cellStateArray[i] = 0;
}
device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);


const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0,
  }],
};

const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `
    struct VertexInput {
      @location(0) pos: vec2f,
      @builtin(instance_index) instance: u32,
    };

    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) cell: vec2f,
    };

    struct FragInput {
      @location(0) cell: vec2f,
    };

    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {

      let i = f32(input.instance);
      let cell = vec2f(i % grid.x, floor(i / grid.x));
      let state = f32(cellState[input.instance]);

      let cellOffset = cell / grid * 2;
      let gridPos =( input.pos * state + 1) / grid - 1 + cellOffset;

      var output: VertexOutput;
      output.pos = vec4f(gridPos, 0, 1);
      output.cell = cell;
      return output;
    }

    @fragment
    fn fragmentMain(input: FragInput) -> @location(0) vec4f {
      let c = input.cell / grid;
      return vec4f(c.x, c.y, 1-c.x, 1);
    }
  `
});

const simulationShaderModule = device.createShaderModule({
  label: "Life simulation shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;

    @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    fn cellIndex(cell: vec2u) -> u32 {
      return (cell.y % u32(grid.y)) * u32(grid.x) +
              (cell.x % u32(grid.x));
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return cellStateIn[cellIndex(vec2(x, y))];
    }

    @compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
    fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
      // Determine how many active neighbors this cell has.
      let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                            cellActive(cell.x+1, cell.y) +
                            cellActive(cell.x+1, cell.y-1) +
                            cellActive(cell.x, cell.y-1) +
                            cellActive(cell.x-1, cell.y-1) +
                            cellActive(cell.x-1, cell.y) +
                            cellActive(cell.x-1, cell.y+1) +
                            cellActive(cell.x, cell.y+1);

      let i = cellIndex(cell.xy);

      // Conway's game of life rules:
      switch activeNeighbors {
        case 2: {
          cellStateOut[i] = cellStateIn[i];
        }
        case 3: {
          cellStateOut[i] = 1;
        }
        default: {
          cellStateOut[i] = 0;
        }
      }
    }
  `
});

const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell bind group Layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: {}
  }, {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
    buffer: { type: "read-only-storage"}
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage"}
  }]
})

const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: {buffer: uniformBuffer}
    }, {
      binding: 1,
      resource: {buffer: cellStateStorage[0]}
    }, {
      binding: 2,
      resource: {buffer: cellStateStorage[1]}
    }
  ]
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: {buffer: uniformBuffer}
    },
    {
      binding: 1,
      resource: {buffer: cellStateStorage[1]}
    }, {
      binding: 2,
      resource: {buffer: cellStateStorage[0]}
    }]
  }),
];

const pipelineLayout = device.createPipelineLayout({
  label: "Cell pipeline Layout",
  bindGroupLayouts: [ bindGroupLayout ]
})

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain"
  }
});

function updateGrid() {
  if(!context) {
    return;
  }

  // we now get the encoder which allows us to tell the gpu what to do, commands are on the cpu now
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workGroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE)
  computePass.dispatchWorkgroups(workGroupCount, workGroupCount)

  computePass.end();

  step++;

  // creating a pass basically defines what our gpu should do now. getCurrentTexture() gives our current drawable texture
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context?.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: {r: 0, g: 0, b: 0, a: 1.0},
      storeOp: "store",
    }]
  });

  pass.setPipeline(cellPipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE)

  // signifies that the render pass is now finished recording
  pass.end()

  // tell our gpu to start drawing our encoded sequence
  device.queue.submit([encoder.finish()])
}

setInterval(updateGrid, UPDATE_TIME)