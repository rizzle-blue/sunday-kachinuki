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
    await expect(page.getByText("Shinai meet at dawn")).toBeVisible();
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
  await page.getByRole("tab", { name: "Register" }).click();
  await expect(page.getByLabel("Họ và tên")).toHaveAttribute("placeholder", "e.g: Nguyen Thi Cam Tu");
  await expect(page.getByLabel("Nickname")).toHaveAttribute("placeholder", "e.g: Tu");
  await expect(page.getByLabel("Dojo")).toHaveAttribute("placeholder", "e.g: Shakaijin");
  await expect(page.getByLabel("Số năm tập")).toHaveAttribute("placeholder", "e.g: 2");
  await page.getByRole("tab", { name: "Invite code" }).click();
  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  await page.getByLabel("Invite code").fill("one_demo");
  await page.getByRole("button", { name: "Reveal my card" }).click();
  await page.waitForURL("**/profile");
  await expect(page.getByRole("heading", { name: "Demo Kenshi One" })).toBeVisible();
  await expect(page.getByRole("article").getByText("Lucky waza")).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem Sunday record →" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ready · Join lobby" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.route("**/rest/v1/rpc/get_my_sunday_result", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          sessionId: "83000000-0000-4000-8000-000000000001",
          name: "Sunday Kachinuki · 31/08/2026",
          startedAt: "2026-08-30T03:05:22.052Z",
          completedAt: "2026-08-30T04:11:22.046Z",
          durationMinutes: 66,
        },
        summary: {
          matchesPlayed: 4,
          formationCount: 2,
          teamWins: 3,
          teamLosses: 1,
          winRate: 75,
          boutsFought: 4,
          boutWins: 3,
          boutLosses: 0,
          boutDraws: 1,
          ipponScored: 6,
          ipponConceded: 2,
          hansoku: 0,
          pointsByWaza: { men: 4, kote: 1, do: 1, tsuki: 0 },
          excludedMatches: 2,
        },
        history: [{
          matchSequence: 1,
          teamLabel: "Indigo Tora",
          opponentTeamLabel: "Crimson Kitsune",
          teamResult: "win",
          position: "senpo",
          opponentName: "Demo Kenshi Four",
          boutResult: "win",
          ipponFor: 2,
          ipponAgainst: 1,
          hansoku: 0,
          pointsByWaza: { men: 1, kote: 1, do: 0, tsuki: 0 },
        }],
      }),
    });
  });
  await page.getByRole("link", { name: "Xem Sunday record →" }).click();
  await page.waitForURL("**/profile/one_demo/individuals");
  await expect(page.getByRole("heading", { name: "Demo Kenshi One" })).toBeVisible();
  await expect(page.getByText("Ippon Storm").first()).toBeVisible();
  await expect(page.getByText("3–1")).toBeVisible();
  await page.getByLabel("Giải thích Formations").click();
  await expect(page.getByText("Số Team-3 roster khác nhau")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reveal my card" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("Invite code").fill("two_demo");
  await page.getByRole("button", { name: "Reveal my card" }).click();
  await page.waitForURL("**/profile");
  await expect(page.getByRole("heading", { name: "Demo Kenshi Two" })).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("button", { name: "Reveal my card" })).toBeVisible();
});
