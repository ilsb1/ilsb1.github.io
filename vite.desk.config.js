import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { authorApiPlugin } from "./server/vite-plugin.js";

export default defineConfig({
  root: "desk",
  publicDir: false,
  envDir: "..",
  cacheDir: "../node_modules/.vite-desk",
  plugins: [react(), authorApiPlugin()],
  server: { port: 5174 },
  preview: { port: 5174 },
  build: { outDir: "../dist-desk", emptyOutDir: true },
});
