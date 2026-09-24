import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Relative base so assets resolve under capacitor://localhost and file-like origins.
  base: "./",
  build: { outDir: "dist", sourcemap: false, target: "es2020" },
});
