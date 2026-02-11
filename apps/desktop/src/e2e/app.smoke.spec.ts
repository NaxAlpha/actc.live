import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, test, expect } from "@playwright/test";
import electronPath from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appEntrypoint = path.resolve(__dirname, "..", "..", "dist", "main", "index.cjs");

test("desktop app launches smoke", async () => {
  test.skip(!fs.existsSync(appEntrypoint), "Build artifacts are missing; run npm run build -w @actc/desktop first");

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.ELECTRON_ENABLE_LOGGING = "true";
  const electronExecutablePath = electronPath as unknown as string;

  const electronApp = await electron.launch({
    executablePath: electronExecutablePath,
    args: [path.resolve(__dirname, "..", "..")],
    env
  });

  const page = await electronApp.firstWindow();
  await expect.poll(async () => electronApp.windows().length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page).toBeTruthy();
  await expect(page.locator(".wizard-shell")).toBeVisible();
  await expect(page.getByText("ACTC Live Setup")).toBeVisible();

  await electronApp.close();
});
