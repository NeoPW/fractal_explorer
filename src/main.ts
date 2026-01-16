import './style.css'

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

if(!navigator.gpu) {
  console.log("ERROR");
  throw new Error("WebGPU not supported in your browser");
}

const adapter = await navigator.gpu.requestAdapter();
if(!adapter) {
  console.log("ADAPTER ERROR");
  throw new Error("No GPU adaptor found");
}

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
if(!context) {
  throw new Error("No context")
}
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context?.configure({
  device: device,
  format: canvasFormat,
  alphaMode: "opaque",
});

let fractalZoom = new Float32Array(4);

const fractalZoomBuffer = device.createBuffer({
  label: "Zoom Buffer",
  size: fractalZoom.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const zoomData = {
  centerX: -0.5,
  centerY: 0.0,
  scale: 3.0,
  aspect: canvas.width / canvas.height
}

function updateFractalZoom() {
  fractalZoom[0] = zoomData.centerX;
  fractalZoom[1] = zoomData.centerY;
  fractalZoom[2] = zoomData.scale;
  fractalZoom[3] = zoomData.aspect;
  device.queue.writeBuffer(fractalZoomBuffer, 0, fractalZoom)
}

updateFractalZoom()

const mandelbrotShaderModule = device.createShaderModule({
  label: "Mandelbrot Shader",
  code: `
    struct VertexOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };

    struct Zoom {
      center: vec2f,
      scale: f32,
      aspect: f32,
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
      
      let x0: f32 = (uv.x - 0.5) * zoom.scale * zoom.aspect + zoom.center.x;
      let y0: f32 = (uv.y - 0.5) * zoom.scale + zoom.center.y;

      let maxIterations: u32 = 10000;
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

const fractalPipeline = device.createRenderPipeline({
  label: "Fractal pipeline",
  layout: "auto",
  vertex: {
    module: mandelbrotShaderModule,
    entryPoint: "vertexMain",
  },
  fragment: {
    module: mandelbrotShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

const bindGroup = device.createBindGroup({
  layout: fractalPipeline.getBindGroupLayout(0),
  entries: [{ 
      binding: 0,
      resource: {buffer: fractalZoomBuffer}
    }],
})

function updateFracal() {
  if(!context) {
    return;
  }

  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context?.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: {r: 0, g: 0, b: 0, a: 1.0},
      storeOp: "store",
    }]
  });

  pass.setPipeline(fractalPipeline);
  pass.setBindGroup(0, bindGroup)
  pass.draw(3)
  pass.end()

  device.queue.submit([encoder.finish()])
}

function frame() {
  updateFracal();
  requestAnimationFrame(frame);
}

frame()

let zoomWarningShown = false;

function zoom(e: WheelEvent) {
e.preventDefault();

  const zoomSpeed = 0.001;
  const anchorStrength = 0.75; 
  const zoom = Math.exp(e.deltaY * zoomSpeed);

  const rect = canvas.getBoundingClientRect();

  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top)  / rect.height;

  const beforeX =
    zoomData.centerX + (mx - 0.5) * zoomData.scale * zoomData.aspect;
  const beforeY =
    zoomData.centerY + (my - 0.5) * zoomData.scale;

  zoomData.scale *= zoom;

  const afterX =
    zoomData.centerX + (mx - 0.5) * zoomData.scale * zoomData.aspect;
  const afterY =
    zoomData.centerY + (my - 0.5) * zoomData.scale;

  zoomData.centerX += (beforeX - afterX) * anchorStrength;
  zoomData.centerY -= (beforeY - afterY) * anchorStrength;

  if(zoomData.scale < 1e-5 && !zoomWarningShown) {
    zoomWarningShown = true;
    alert("Hitting limits of 32 bit floats!");
  }

  updateFractalZoom();

}

let dragging = false;
let lastX = 0;
let lastY = 0;


function down(e: MouseEvent) {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
}

function drag(e: MouseEvent) {
  if (!dragging) return;

  const dx = (e.clientX - lastX) / canvas.width;
  const dy = (e.clientY - lastY) / canvas.height;

  zoomData.centerX -= dx * zoomData.scale * zoomData.aspect;
  zoomData.centerY += dy * zoomData.scale;

  lastX = e.clientX;
  lastY = e.clientY;

  updateFractalZoom();
}

function up(e: MouseEvent) {
  dragging = false;
}

function resize() {
  canvas.width  = canvas.clientWidth  * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;

  zoomData.aspect = canvas.width / canvas.height;

  updateFractalZoom();
}

canvas.onwheel = zoom;
canvas.onmousedown = down;
canvas.onmousemove = drag;
canvas.onmouseup = up;
canvas.onresize = resize;