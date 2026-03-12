import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    port: 5174,
    strictPort: true,
    headers: {
      "Content-Security-Policy":
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'; object-src 'none';",
    },
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
      // Demo video endpoints for road sign detection
      "/video_feed_demo": {
        target: "http://localhost:5000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
      "/get_demo_detection_info": "http://localhost:5000",
      "/stop_demo_video": "http://localhost:5000",
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
      "/analyze-drowsiness-video": "http://localhost:5000",
    },
  },
});
