<template>
  <h1>Fractal Wiki</h1>
  <div class="layout">
    <div class="left">
      <FractalCanvas />
    </div>
    <div class="right">
      <h2>Fractal Wiki</h2>
    </div>
  </div>
</template>

<script setup lang="ts">
  import FractalCanvas from "./FractalCanvas.vue"
</script>

<style>
  .layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100vw;
  height: 100vh;
}

.left,
.right {
  overflow: hidden;
}
</style>