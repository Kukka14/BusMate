import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:5000",
      "/road-sign": {
        target: "http://localhost:5000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/road-sign/, ""),
      },
      "/rsa": "http://localhost:5000",
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
      "/analyze-drowsiness-video": "http://localhost:5000",
    },
  },
});
