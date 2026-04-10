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
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react";
          }

          if (
            id.includes("/@codemirror/") ||
            id.includes("/@lezer/") ||
            id.includes("/codemirror/") ||
            id.includes("/style-mod/") ||
            id.includes("/w3c-keyname/") ||
            id.includes("/crelt/")
          ) {
            return "codemirror";
          }

          if (
            id.includes("/remark-") ||
            id.includes("/unified/") ||
            id.includes("/micromark") ||
            id.includes("/mdast-util-") ||
            id.includes("/unist-util-") ||
            id.includes("/vfile") ||
            id.includes("/trough/") ||
            id.includes("/bail/") ||
            id.includes("/zwitch/") ||
            id.includes("/character-entities") ||
            id.includes("/decode-named-character-reference/")
          ) {
            return "markdown";
          }

          if (id.includes("/zustand/")) {
            return "state";
          }

          return undefined;
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
