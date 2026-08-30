import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`host can form and score in simulator at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/simulate");

    await expect(page.getByRole("heading", { name: "Sunday simulator" })).toBeVisible();
    await expect(page.locator(".sim-roster li")).toHaveCount(10);
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Form Team-3" }).click();
    await expect(page.getByText("3 teams", { exact: true })).toBeVisible();
    await expect(page.getByText("1 waiting", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team Tora" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team Tsuki" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team Kumo" })).toBeVisible();

    await page.getByRole("button", { name: "Start bout" }).click();
    const akaPad = page.locator(".side-pad.aka");
    const shiroPad = page.locator(".side-pad.shiro");
    await akaPad.getByRole("button", { name: "MEN" }).click();
    await akaPad.getByRole("button", { name: "KOTE" }).click();
    await expect(page.locator(".bout-row.current .score").first()).toHaveText("2");
    await expect(akaPad.getByRole("button", { name: "MEN" })).toBeDisabled();

    await page.getByRole("button", { name: "Undo last" }).click();
    await expect(page.locator(".bout-row.current .score").first()).toHaveText("1");
    await shiroPad.getByRole("button", { name: "HANSOKU" }).click();
    await shiroPad.getByRole("button", { name: "HANSOKU" }).click();
    await expect(page.locator(".bout-row.current .score").first()).toHaveText("2");
    await expect(page.locator(".bout-row.current").getByText("H 2")).toBeVisible();
    await page.getByRole("button", { name: "End timer · Finalize" }).click();
    await expect(page.getByText("chuken · ready")).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
