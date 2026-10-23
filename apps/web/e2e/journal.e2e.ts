import { expect, test, type Page } from "@playwright/test";

// Uses the fictional demo account from supabase/seed.sql.
const EMAIL = "demo@journal.local";
const PASSWORD = "DemoTrader2026";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Equity curve" })).toBeVisible();
}

test("guests are sent to login, and a wrong password keeps the email", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toHaveText("Email or password is incorrect.");
  await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
});

test("dashboard shows stats, calendar and recent trades", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Net P&L", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("grid", { name: /Daily P&L/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent trades" })).toBeVisible();
  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/range=all/);
});

test("manual trade, journal and plan round-trip", async ({ page }) => {
  await signIn(page);
  await page.goto("/trades/new");
  await page.getByLabel("Symbol").fill("eurusd");
  await page.getByLabel("Size").fill("0.5");
  await page.getByLabel(/Opened/).fill("2026-10-22T10:00");
  await page.getByLabel("Closed").fill("2026-10-22T12:30");
  await page.getByLabel("Entry price").fill("1.0850");
  await page.getByLabel("Exit price").fill("1.0880");
  await page.getByLabel("Stop loss").fill("1.0835");
  await page.getByRole("button", { name: "Save trade" }).click();

  await expect(page.getByRole("heading", { name: "EURUSD" })).toBeVisible();
  await expect(page.getByText("+30.0 pips", { exact: true })).toBeVisible();
  await expect(page.getByText("+2.00R")).toBeVisible();

  await page.getByRole("combobox", { name: "Setup" }).fill("E2E setup");
  await page.getByLabel("Followed the plan?").selectOption("yes");
  await page.getByLabel("Notes").fill("Waited for the retest.");
  await page.getByRole("button", { name: "Save journal" }).click();
  await expect(page.getByRole("status")).toHaveText("Journal saved.");

  await page.goto("/plans/new");
  await page.getByLabel("Symbol").fill("GBPUSD");
  await page.getByLabel("Entry").fill("1.3000");
  await page.getByLabel("Stop loss").fill("1.2980");
  await page.getByLabel("Take profit").fill("1.3050");
  await expect(page.getByText("2.50 : 1")).toBeVisible();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/plans$/);
});

test("playbook setup drives the plan, and futures P&L is calculated", async ({ page }) => {
  await signIn(page);
  await page.goto("/playbook");
  const add = page.locator("#new");
  await add.getByLabel("Name").fill("E2E FTB");
  await add.getByLabel("Target").fill("4");
  await add.getByLabel("Checklist").fill("Failed to break the high\nVisual break on M1");
  await add.getByRole("button", { name: "Add to playbook" }).click();
  await expect(add.getByRole("status")).toHaveText('Added "E2E FTB".');

  await page.goto("/plans/new");
  await page.getByRole("combobox", { name: "Setup" }).fill("e2e ftb");
  await expect(page.getByText("Visual break on M1")).toBeVisible();
  await page.getByLabel("Entry").fill("100");
  await page.getByLabel("Stop loss").fill("98");
  await page.getByRole("button", { name: /Use 4R target/ }).click();
  await expect(page.getByLabel("Take profit")).toHaveValue("108");

  await page.goto("/trades/new");
  await page.getByLabel("Symbol").fill("NQZ6");
  await page.getByLabel("Size").fill("2");
  await page.getByLabel(/Opened/).fill("2026-10-22T16:30");
  await page.getByLabel("Closed").fill("2026-10-22T16:45");
  await page.getByLabel("Entry price").fill("21000");
  await page.getByLabel("Exit price").fill("21010");
  await page.getByRole("button", { name: "Save trade" }).click();
  await expect(page.getByRole("heading", { name: "NQZ6" })).toBeVisible();
  await expect(page.getByText("+10.0 pts", { exact: true })).toBeVisible();
  await expect(page.getByText("2 ct", { exact: true })).toBeVisible();
  await expect(page.getByText("+$400.00").first()).toBeVisible();
});

test("export then re-import skips every duplicate", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const file = await (await download).path();

  await page.goto("/import");
  await page.getByLabel("CSV file").setInputFiles(file!);
  await expect(page.getByText(/rows ready to import/)).toBeVisible();
  await page.getByRole("button", { name: /^Import \d+ trades$/ }).click();
  await expect(page.getByRole("status")).toContainText("Imported 0 trades.");
});

test("cron endpoint rejects callers without the secret", async ({ request }) => {
  const res = await request.post("/api/sync/cron", { headers: { Authorization: "Bearer wrong" } });
  expect(res.status()).toBe(401);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/login");
  const headers = res.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("mobile layout has no horizontal scroll @mobile", async ({ page }) => {
  await signIn(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
