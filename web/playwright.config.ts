import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, "..", "api");

const e2eApiEnv: Record<string, string> = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal",
  LISTEN_ADDR: "127.0.0.1:8080",
  LEGAL_PUBLIC_BASE_URL: "http://127.0.0.1:5173",
  CORS_ORIGINS: "http://127.0.0.1:5173",
  ALLOW_LOCALHOST_PROPERTY: "true",
  TERMS_SYNC_ON_STARTUP: "false",
  TERMS_SYNC_INTERVAL_HOURS: "24",
  ADMIN_TOKEN: "test-admin",
  TELEGRAM_BOT_TOKEN: "123456:ABC-DEF",
  RATE_LIMIT_READ: "1000",
  RATE_LIMIT_WRITE: "1000",
  TERMS_GITLAB_RAW_URL:
    process.env.TERMS_GITLAB_RAW_URL ??
    "https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/raw/main/TERMS_AND_CONDITIONS.txt",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 5,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
  },
  webServer: [
    {
      command: "cargo run --quiet",
      cwd: apiDir,
      url: "http://127.0.0.1:8080/update_terms",
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        ...process.env,
        ...e2eApiEnv,
      },
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: "",
        VITE_TELEGRAM_BOT_NAME: "",
      },
    },
  ],
});
