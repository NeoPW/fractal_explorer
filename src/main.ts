import './style.css'
import { RenderEngine } from "./RenderEngine.ts"
import { CanvasController } from "./CanvasController.ts"
// import shaderCode from "./shaders/mandelbrot.wgsl?raw"

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderEngine = new RenderEngine(canvas);
await renderEngine.setup();

const canvasController = new CanvasController(canvas, renderEngine);
renderEngine.startAnimation();
