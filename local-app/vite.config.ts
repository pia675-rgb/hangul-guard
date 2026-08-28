import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dir,
  base: "./",
  mode: "production",
  plugins: [tailwindcss(), viteReact()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@": path.resolve(dir, "../src"),
    },
  },
  build: {
    outDir: path.resolve(dir, "../local-dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 10_000_000,
    minify: true,
    lib: {
      entry: path.resolve(dir, "main.tsx"),
      name: "EnglishGuardLocal",
      formats: ["iife"],
      fileName: () => "app.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "app.css",
      },
    },
  },
});
