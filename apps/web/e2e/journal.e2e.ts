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

// 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("end-of-day review: fill a market, log a missed play, grade the day", async ({ page }) => {
  await signIn(page);
  await page.goto("/eod");
  await page.getByRole("link", { name: "Fill in today", exact: true }).click();
  await expect(page).toHaveURL(/\/eod\/\d{4}-\d{2}-\d{2}$/);

  for (const m of ["GC", "CL", "GER40", "YM"]) await page.getByRole("checkbox", { name: m, exact: true }).uncheck();
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByRole("heading", { name: "NQ", exact: true })).toBeVisible();
  await page.getByLabel("How the session went").fill("Trend day from the open.");
  await page.getByRole("checkbox", { name: "NY reversal short" }).check();
  await page.getByLabel("Time it presented").fill("09:35");
  await page.getByRole("combobox", { name: "Setup" }).fill("NY reversal");
  await page.getByLabel("Direction").selectOption("sell");
  await page.getByLabel("Outcome").selectOption("missed");
  await page.getByLabel("The trade").fill("Hesitated at the shift line.");
  await page.getByLabel("Add a NQ chart screenshot").setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "NQ chart 1" })).toBeVisible();
  await page.getByRole("button", { name: "Save and next" }).click();

  await page.getByRole("button", { name: "B", exact: true }).click();
  await page.getByLabel("How did the day go overall?").fill("Patient, but missed the best play.");
  await page.getByLabel("Main thing to carry into tomorrow").fill("Take the first clean shift-line touch.");
  await page.getByRole("button", { name: "Save day" }).click();

  await expect(page).toHaveURL(/\/eod\?month=/);
  // The day's card on the review page (the form stays mounted, hidden, behind it).
  const card = page.locator("section[id^='20']");
  await expect(card.getByText("Patient, but missed the best play.")).toBeVisible();
  await expect(card.getByText("Hesitated at the shift line.", { exact: false })).toBeVisible();
  await expect(card.getByRole("img", { name: "NQ chart 1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "NY reversal" })).toBeVisible();
});

test("end-of-day review imports an EOD Journal backup", async ({ page }) => {
  await signIn(page);
  const backup = [{
    date: "2026-10-30", assets: ["GER40"], grade: "C", summary: "Imported from the old app.", learn: "",
    entries: { GER40: { went: "Choppy", did: "", should: "", link: "", setups: ["No clean setup"], notrade: true, trades: [], imgs: [] } },
  }];
  await page.goto("/eod");
  await page.getByText("Import from the EOD Journal app").click();
  await page.getByLabel("EOD Journal backup file").setInputFiles({ name: "eod.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toHaveText("Imported 1 day.");
  await page.goto("/eod?month=2026-10");
  await expect(page.getByText("Imported from the old app.")).toBeVisible();
  await expect(page.getByText("No trade presented.")).toBeVisible();
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
