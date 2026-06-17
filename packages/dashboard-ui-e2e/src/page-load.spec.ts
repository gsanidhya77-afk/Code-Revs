import { test, expect } from "@playwright/test";

/**
 * Basic dashboard load smoke test.
 *
 * Verifies the dashboard renders without fatal errors — the most
 * fundamental check that the full stack (Express server + Vite proxy
 * + React client) is working end to end.
 */

test.describe("dashboard loads", () => {
  test("page renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");

    // Wait for the app to hydrate — look for any content that indicates
    // React rendered successfully (not a blank page or error state)
    await expect(page.locator("body")).not.toBeEmpty();

    // No fatal console errors (SyntaxError, TypeError, etc.)
    const fatalErrors = consoleErrors.filter(
      (e) =>
        e.includes("SyntaxError") ||
        e.includes("TypeError") ||
        e.includes("ReferenceError"),
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test("page title is set", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
  });
});
