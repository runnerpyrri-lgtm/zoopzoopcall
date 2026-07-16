// 청약봄 모바일 상세 화면의 실제 브라우저 회귀 검증 설정.
import { defineConfig } from "@playwright/test";

const previewPort = Number.parseInt(process.env.PLAYWRIGHT_PORT || "4173", 10);
const previewUrl = "http://127.0.0.1:" + previewPort + "/homebom/";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: previewUrl,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm preview --host 127.0.0.1 --port " + previewPort,
    url: previewUrl,
    reuseExistingServer: false,
    env: {
      VITE_NOTICES_URL: "https://homebom.test/notices",
    },
  },
});
