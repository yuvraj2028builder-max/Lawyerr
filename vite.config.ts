import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Initial-bundle budget: heavy PDF libs stay in lazy chunks (see report in README).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      // pdfjs-dist subpath imports are bundled as lazy chunks; tesseract.js
      // is installed and lazy-loaded via dynamic import (Option A, Prompt 16).
      // tesseract.js must NOT be external, or the browser could never load it.
      external: (id) => id === "pdfjs-dist",
      output: {
        // Safe caching split only: React vendor in its own chunk. No
        // functionality is removed or deferred by this change.
        manualChunks: {
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  ...({
    test: {
      globals: true,
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  } as Record<string, unknown>),
});
