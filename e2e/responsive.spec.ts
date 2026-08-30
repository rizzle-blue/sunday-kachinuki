import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`landing and host stay inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Sunday Kachinuki/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto("/host");
    await expect(page.getByRole("heading", { name: "Host sign in" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("anonymous invite reveals card with adjacent Ready and Logout actions on mobile", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reveal my card" })).toBeEnabled();
  await expect(page.getByLabel("Invite code")).toHaveAttribute("placeholder", "ten_ho · không dấu, viết thường");
  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  await page.getByLabel("Invite code").fill("one_demo");
  await page.getByRole("button", { name: "Reveal my card" }).click();
  await page.waitForURL("**/profile");
  await expect(page.getByRole("heading", { name: "Demo Kenshi One" })).toBeVisible();
  await expect(page.getByRole("article").getByText("Lucky waza")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ready · Join lobby" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("button", { name: "Reveal my card" })).toBeVisible();
});
