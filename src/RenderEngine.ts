import shaderCode from "./shaders/mandelbrot.wgsl?raw"

export class RenderEngine {
    canvas: HTMLCanvasElement;
    adapter: GPUAdapter | null = null;
    device: GPUDevice | null = null;
    context: GPUCanvasContext | null = null;
    canvasFormat: GPUTextureFormat | null = null;

    fractalZoom: Float32Array<ArrayBuffer> = new Float32Array(4);
    fractalZoomBuffer: GPUBuffer | null = null;
    zoomData: { 
        centerX: number,
        centerY: number,
        scale: number,
        aspect: number
    } = {
        centerX: -0.5,
        centerY: 0.0,
        scale: 3.0,
        aspect: 1
    };

    mandelbrotShaderModule: GPUShaderModule | null = null;

    fractalPipeline: GPURenderPipeline | null = null;
    bindGroup: GPUBindGroup | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        
        if(!navigator.gpu) {
            console.log("ERROR");
            throw new Error("WebGPU not supported in your browser");
        }
    }

    async setup() {
        this.adapter = await navigator.gpu.requestAdapter();
        if(!this.adapter) {
            console.log("ADAPTER ERROR");
            throw new Error("No GPU adaptor found");
        }

        this.device = await this.adapter.requestDevice();
        this.context = this.canvas.getContext("webgpu");
        if(!this.context) {
            throw new Error("No context")
        }

        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context?.configure({
            device: this.device,
            format: this.canvasFormat,
            alphaMode: "opaque",
        });

        this.fractalZoomBuffer = this.device.createBuffer({
            label: "Zoom Buffer",
            size: this.fractalZoom.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.zoomData = {
            centerX: -0.5,
            centerY: 0.0,
            scale: 3.0,
            aspect: this.canvas.width / this.canvas.height
        }

        this.mandelbrotShaderModule = this.device.createShaderModule({
            label: "Mandelbrot Shader",
            code: shaderCode
        });

        this.fractalPipeline = this.device.createRenderPipeline({
            label: "Fractal pipeline",
            layout: "auto",
            vertex: {
                module: this.mandelbrotShaderModule,
                entryPoint: "vertexMain",
            },
            fragment: {
                module: this.mandelbrotShaderModule,
                entryPoint: "fragmentMain",
                targets: [{
                format: this.canvasFormat
                }]
            }
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.fractalPipeline.getBindGroupLayout(0),
            entries: [{ 
                binding: 0,
                resource: {buffer: this.fractalZoomBuffer}
            }],
        })

        this.updateFractalZoom()
    }

    updateFracal() {
        if(!this.context || !this.device || !this.fractalPipeline) {
            throw new Error("Context, device or pipeline not set");
        }

        const encoder = this.device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
            view: this.context?.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {r: 0, g: 0, b: 0, a: 1.0},
            storeOp: "store",
            }]
        });

        pass.setPipeline(this.fractalPipeline);
        pass.setBindGroup(0, this.bindGroup)
        pass.draw(3)
        pass.end()

        this.device.queue.submit([encoder.finish()])
    }

    updateFractalZoom() {
        if(!this.device || !this.fractalZoomBuffer)
            throw new Error("device or zoombuffer not set")
        this.fractalZoom[0] = this.zoomData.centerX;
        this.fractalZoom[1] = this.zoomData.centerY;
        this.fractalZoom[2] = this.zoomData.scale;
        this.fractalZoom[3] = this.zoomData.aspect;
        this.device.queue.writeBuffer(this.fractalZoomBuffer, 0, this.fractalZoom)
    }

    startAnimation = () => {
        this.updateFracal();
        requestAnimationFrame(this.startAnimation);
    }

}