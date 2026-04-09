import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3001";
const apiUrl = new URL(apiTarget);
apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
const wsTarget = apiUrl.toString();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/auth": apiTarget,
      "/ws": {
        target: wsTarget,
        ws: true,
      },
    },
  },
});
