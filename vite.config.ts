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
      // pdfjs-dist and tesseract.js are optional lazy-loaded deps — do not fail build if not installed
      external: (id) => id === "pdfjs-dist" || id === "tesseract.js",
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
