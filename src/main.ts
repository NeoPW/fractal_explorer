import './style.css'

const GRID_SIZE = 1
const UPDATE_TIME = 200;
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

let uniformArray = new Float32Array(4);
uniformArray[0] = 0;
uniformArray[1] = 0;
uniformArray[2] = 1;
const uniformBuffer = device.createBuffer({
  label: "Zoom Buffer",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);


const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `
    struct VertexOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };

    struct Zoom {
      point: vec2f,
      factor: f32,
      pad: f32
    };

    @group(0) @binding(0) var<uniform> zoom: Zoom;

    @vertex
    fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
      var positions = array<vec2f, 3> (
        vec2f(-1.0, -1.0),
        vec2f(3.0, -1.0),
        vec2f(-1, 3.0),
      );
      
      let pos = positions[index];

      var output: VertexOutput;
      output.position = vec4f(pos, 0.0, 1.0);
      output.uv = pos * 0.5 + vec2f(0.5);
      return output;
    }

    fn paletteColor(t: f32) -> vec3f {
          let palette = array<vec3f, 4>(
      vec3f(0.05, 0.15, 0.18), // deep teal (background)
      vec3f(0.10, 0.60, 0.55), // teal-green
      vec3f(0.30, 0.80, 0.40), // green highlight
      vec3f(0.55, 0.25, 0.75)  // violet accent
    );
      let n = 3.0;
      let x = fract(t) * n;

      let i = u32(floor(x));
      let f = fract(x);

      return mix(palette[i], palette[i + 1], f);
    }


    @fragment
    fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
      let outerColor1: vec3f = vec3f(0.3, 0.0, 0.9);
      var outerColor2: vec3f = vec3f(0.8, 0.0, 0.5);
      
      let x0: f32 = uv.x * (3.5 / zoom.factor) - (2.5 / zoom.factor) + zoom.point.x;
      let y0: f32 = uv.y * (3 / zoom.factor) - (1.5 / zoom.factor) + zoom.point.y;

      let maxIterations: u32 = 1000;
      var z = vec2f(0.0);
      var i: u32 = 0u;

      loop {
        if (i >= maxIterations) { break; }

        let x = z.x;
        let y = z.y;

        if (x * x + y * y >= 4.0) { break; }

        z = vec2f(
          x * x - y * y + x0,
          2.0 * x * y + y0
        );

        i++;
      }

      if(i == maxIterations) {
        return vec4f(0, 0, 0, 1);
      }

      let r2 = z.x * z.x  + z.y * z.y;
      let logZn = log(r2) / 2.0;
      let nu = log(logZn / log(2.0)) / log(2.0);
      let smoothIter = f32(i) + 1.0 - nu;

      //magma
      // let t = f32(smoothIter) / f32(maxIterations);
      // // let color = mix(outerColor1, outerColor2, t);
      // let color = vec3f(t*t, t*0.3, pow(t, 4.0));




      //classic
      let t = smoothIter * 0.035;
      let color = paletteColor(t);
      return vec4f(color, 1);
    }
  `
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

const bindGroup = device.createBindGroup({
  layout: cellPipeline.getBindGroupLayout(0),
  entries: [{ 
      binding: 0,
      resource: {buffer: uniformBuffer}
    }],
})

function updateGrid() {
  if(!context) {
    return;
  }

  // we now get the encoder which allows us to tell the gpu what to do, commands are on the cpu now
  const encoder = device.createCommandEncoder();

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
  pass.setBindGroup(0, bindGroup)
  pass.draw(3)
  // signifies that the render pass is now finished recording
  pass.end()

  // tell our gpu to start drawing our encoded sequence
  device.queue.submit([encoder.finish()])
}

setInterval(updateGrid, UPDATE_TIME)