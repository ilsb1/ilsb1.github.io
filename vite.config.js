import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { authorApiPlugin } from "./server/vite-plugin.js";

export default defineConfig({
  plugins: [react(), authorApiPlugin()],
  base: "/",
});


// Integrated Language Skills for Higher Education (ILS)