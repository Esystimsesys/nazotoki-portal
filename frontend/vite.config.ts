import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ローカル開発時、vite devサーバーから同一オリジンでバックエンドAPIを叩けるようにする。
      // 実際のAPI起点は VITE_API_BASE（既定 /api）で切替可能。
      "/api": {
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
