import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:5000",
      // MJPEG stream — needs buffering disabled so frames flow through immediately
      "/road-sign/video_feed": {
        target: "http://localhost:5000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/road-sign/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
      // All other road-sign backend calls (exclude React page routes)
      "^/road-sign/(?!(live|results|video-results)(/|$))": {
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
