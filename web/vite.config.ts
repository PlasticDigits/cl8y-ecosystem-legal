import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/admin": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
  },
});
