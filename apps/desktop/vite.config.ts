import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  resolve: {
    alias: {
      "@actc/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  },
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: false
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
