import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/miniapp/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2018",
  },
  server: {
    proxy: {
      "/api": "https://chat.chuli.win",
    },
  },
});
