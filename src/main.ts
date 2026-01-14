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

const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
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

    fn mandelbrotStep(pos: vec2f, x0: f32, y0: f32) -> vec2f {
      var tempX: f32 = pow(pos.x, 2) - pow(pos.y, 2) + x0;
      var y = 2 * pos.x * pos.y + y0;
      return vec2f(tempX, y);
    }

    fn mandelbrotCheck(pos: vec2f) -> bool {
      let n = pow(pos.x, 2) + pow(pos.y, 2);
      return n < 4;
    }

    @fragment
    fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {

      //mandelbrot implementation
      let x0: f32 = uv.x * 3.5 - 2.5;
      let y0: f32 = uv.y * 3 - 1.5;

      var pos = vec2f(0.0, 0.0);
      var iteration: u32 = 0;
      let max_iterations: u32 = 10000;

      while(mandelbrotCheck(pos) && iteration < max_iterations) {
        iteration++;

        pos = mandelbrotStep(pos, x0, y0);
      }

      if(iteration == max_iterations) {
        return vec4f(0, 0, 0, 1);
      }
      return vec4f(1, 0, 0, 1);
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
  pass.draw(3)

  // signifies that the render pass is now finished recording
  pass.end()

  // tell our gpu to start drawing our encoded sequence
  device.queue.submit([encoder.finish()])
}

setInterval(updateGrid, UPDATE_TIME)