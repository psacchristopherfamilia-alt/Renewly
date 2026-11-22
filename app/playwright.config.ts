import { defineConfig } from "@playwright/test";

// E2E against a running app (APP_URL, default http://localhost:3200) backed by a local Supabase
// (`supabase start`, email confirmations off). See README for the full sequence.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3200", trace: "off" },
});
