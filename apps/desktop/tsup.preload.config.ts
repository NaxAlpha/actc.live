import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/preload/index.ts"],
  format: ["cjs"],
  outDir: "dist/preload",
  target: "node20",
  sourcemap: true,
  clean: false,
  splitting: false,
  external: ["electron"],
  noExternal: ["@actc/shared"]
});
