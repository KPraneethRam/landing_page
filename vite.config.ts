import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // three.js is ~550 kB minified and lives in its own lazily loaded chunk.
    chunkSizeWarningLimit: 700,
  },
});
