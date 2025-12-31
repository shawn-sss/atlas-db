import { defineConfig } from "vite";

// Dev setup:
// - Frontend runs on http://localhost:5173
// - Backend runs on http://localhost:8080
//
// This proxy lets the React app call /api/* without CORS issues.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
