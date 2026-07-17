import { defineConfig } from "vite";

export default defineConfig({
  base: "/tothemoon/",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    open: true,
  },
});
