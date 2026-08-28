import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dir,
  base: "./",
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    alias: {
      "@": path.resolve(dir, "../src"),
    },
  },
  build: {
    outDir: path.resolve(dir, "../local-dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
