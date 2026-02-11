import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main/index.ts"],
  format: ["cjs"],
  outDir: "dist/main",
  target: "node20",
  sourcemap: true,
  clean: false,
  splitting: false,
  external: ["electron"],
  noExternal: ["@actc/shared"]
});
