import { RenderEngine } from "./RenderEngine";

export class CanvasController {
    canvas: HTMLCanvasElement;
    renderEngine: RenderEngine;

    zoomWarning: boolean = false;
    dragging: boolean = false;
    lastX: number = 0;
    lastY: number = 0;

    constructor(canvas: HTMLCanvasElement, renderEngine: RenderEngine) {
        this.canvas = canvas;
        this.renderEngine = renderEngine;
        this.registerCanvasEvents()
    }

    registerCanvasEvents() {
        this.canvas.onwheel = this.zoom;
        this.canvas.onmousedown = this.down;
        this.canvas.onmousemove = this.drag;
        this.canvas.onmouseup = this.up;
    }

    zoom = (e: WheelEvent) => {
        e.preventDefault();

        const zoomSpeed = 0.001;
        const anchorStrength = 0.75; 
        const zoom = Math.exp(e.deltaY * zoomSpeed);

        const rect = this.canvas.getBoundingClientRect();

        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top)  / rect.height;

        const beforeX = this.renderEngine.zoomData.centerX + (mx - 0.5) * this.renderEngine.zoomData.scale * this.renderEngine.zoomData.aspect;
        const beforeY = this.renderEngine.zoomData.centerY + (my - 0.5) * this.renderEngine.zoomData.scale;

        this.renderEngine.zoomData.scale *= zoom;

        const afterX = this.renderEngine.zoomData.centerX + (mx - 0.5) * this.renderEngine.zoomData.scale * this.renderEngine.zoomData.aspect;
        const afterY = this.renderEngine.zoomData.centerY + (my - 0.5) * this.renderEngine.zoomData.scale;

        this.renderEngine.zoomData.centerX += (beforeX - afterX) * anchorStrength;
        this.renderEngine.zoomData.centerY -= (beforeY - afterY) * anchorStrength;

        if(this.renderEngine.zoomData.scale < 1e-5 && !this.zoomWarning) {
            this.zoomWarning = true;
            alert("Hitting limits of 32 bit floats!");
        }
        this.renderEngine.markDirty();
    }


    down = (e: MouseEvent) => {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    }

    drag = (e: MouseEvent) => {
        if (!this.dragging) return;

        const dx = (e.clientX - this.lastX) / this.canvas.clientWidth;
        const dy = (e.clientY - this.lastY) / this.canvas.clientHeight;

        this.renderEngine.zoomData.centerX -= dx * this.renderEngine.zoomData.scale * this.renderEngine.zoomData.aspect;
        this.renderEngine.zoomData.centerY += dy * this.renderEngine.zoomData.scale;

        this.lastX = e.clientX;
        this.lastY = e.clientY;

        this.renderEngine.markDirty();
    }

    up = () => {
        this.dragging = false;
    }

    resize(width: number, height: number) {
        this.renderEngine.resize(width, height);
        this.renderEngine.zoomData.aspect = width / height;
        this.renderEngine.markDirty();
    }

}