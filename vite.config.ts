import { defineConfig } from "vite";
import { readConfig } from "./server/config.js";

export default defineConfig({
  optimizeDeps: { include: ["@thatopen/components", "three"] },
  build: { manifest: "asset-manifest.json" },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${readConfig().port}`,
        changeOrigin: false,
      },
    },
  },
});
