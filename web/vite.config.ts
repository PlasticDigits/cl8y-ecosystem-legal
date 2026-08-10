import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/admin": "http://127.0.0.1:8080",
    },
  },
  build: {
    outDir: "dist",
  },
});
