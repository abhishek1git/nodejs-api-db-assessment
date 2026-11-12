import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev/preview server proxies to serverless-offline on port 3000, so the
// browser talks to a single origin and no CORS configuration is needed.
const target = "http://localhost:3000";

const proxy = {
  "/api": {
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
  "/openapi.yaml": {
    target,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
});
