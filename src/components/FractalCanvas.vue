<template>
  <div class="canvas-wrapper">
    <canvas ref="canvas" class="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { RenderEngine } from "../engine/RenderEngine";
import { CanvasController } from "../engine/CanvasController";

const canvas = ref<HTMLCanvasElement | null>(null);
let renderEngine: RenderEngine | null = null;

onMounted(async () => {
  renderEngine = new RenderEngine(canvas.value!);
  await renderEngine.setup()
  renderEngine.startAnimation()
  const canvasController = new CanvasController(canvas.value!, renderEngine);

  const observer = new ResizeObserver(entries => {
    console.log("resizig")
    const { width, height } = entries[0].contentRect;
    canvasController.resize(width, height);
  });

  observer.observe(canvas.value!.parentElement!);
});
</script>
<style scoped>
.canvas-wrapper {
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
}
.canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
