import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
      API_URL: "http://127.0.0.1:8000",
      INTERNAL_API_SECRET: "test-secret",
    },
  },
});
