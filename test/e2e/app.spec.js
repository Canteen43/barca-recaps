import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-10-11T19:00:00Z").getTime();
const H = 3600e3;
const iso = (t) => new Date(t).toISOString();
const fixture = (f) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");

const videos = {
  version: 1,
  createdAt: iso(NOW - 30 * 24 * H),
  updatedAt: iso(NOW - 2 * H),
  videos: [
    { id: "a966F5tgpNs", title: "Jesus gibt den perfekten Raphinha-Ersatz: FC Barcelona - FC Getafe | 8. Spieltag | LALIGA | DAZN", published: iso(NOW - 2 * H) },
    { id: "openOLD0001", title: "Katalanische Tormaschine rollt weiter: FC Sevilla - FC Barcelona | 7. Spieltag | LALIGA | DAZN", published: iso(NOW - 7 * 24 * H) },
    { id: "baseline001", title: "Adeyemi-Traumsolo & Raphinha zaubert: FC Barcelona - Santander | 6. Spieltag | LALIGA | DAZN", published: iso(NOW - 14 * 24 * H), baseline: true },
    { id: "baseline002", title: "Traum-Solo! Adeyemi weiter on fire: Levante - FC Barcelona | 5. Spieltag | LaLiga | DAZN Highlights", published: iso(NOW - 21 * 24 * H), baseline: true },
    { id: "baseline003", title: "Guadalajara - FC Barcelona | 3. Runde | Copa del Rey | DAZN Highlights", published: iso(NOW - 28 * 24 * H), baseline: true },
  ],
};

test.beforeEach(async ({ page, context }) => {
  await page.clock.install({ time: NOW });
  await context.route("**/data/videos.json*", (r) => r.fulfill({ json: videos }));
  await context.route("https://site.api.espn.com/**/standings*", (r) => r.fulfill({ body: fixture("espn-standings.json"), contentType: "application/json" }));
  await context.route("https://site.api.espn.com/**/schedule*", (r) => r.fulfill({ body: fixture("espn-fixtures.json"), contentType: "application/json" }));
  await context.route(/(ytimg|espncdn)\.com/, (r) => r.fulfill({ status: 404 }));
});

const openCards = (page) => page.locator("#view-recaps .card");
const watchedRows = (page) => page.locator("#view-recaps .row");

test("watchlist shows open recaps oldest first, watched below, spoiler-free", async ({ page }) => {
  await page.goto("./");
  await expect(openCards(page)).toHaveCount(2);
  await expect(openCards(page).nth(0)).toContainText("FC Sevilla – FC Barcelona");
  await expect(openCards(page).nth(1)).toContainText("FC Barcelona – FC Getafe");
  await expect(openCards(page).nth(1).locator(".chip")).toHaveText("NEW");
  await expect(openCards(page).nth(1)).toContainText("LaLiga · 8. Spieltag");
  await expect(watchedRows(page)).toHaveCount(3);
  await expect(page.locator("#tab-badge")).toHaveText("2");
  // Spoiler protection on by default: teaser headline hidden, thumbnails blurred.
  await expect(page.getByText("Raphinha-Ersatz")).toHaveCount(0);
  await expect(page.locator("#view-recaps")).toHaveClass(/spoiler-free/);
  // Next match strip from ESPN.
  await expect(page.locator(".next-match")).toContainText("Galatasaray – Barcelona");
});

test("recap links hand off to the YouTube app on Android", async ({ page }) => {
  await page.goto("./");
  const href = await openCards(page).nth(1).locator("a.card-link").getAttribute("href");
  expect(href).toContain("intent://www.youtube.com/watch?v=a966F5tgpNs#Intent;scheme=https;package=com.google.android.youtube;");
});

test("tapping a recap marks it watched", async ({ page }) => {
  await page.goto("./");
  // Swallow the intent: navigation (desktop Chrome can't handle it) but keep the click semantics.
  await page.evaluate(() => document.addEventListener("click", (e) => e.target.closest("a.card-link") && e.preventDefault()));
  await openCards(page).nth(0).locator("a.card-link").click();
  await expect(openCards(page)).toHaveCount(1);
  await expect(watchedRows(page)).toHaveCount(4);
  await expect(page.locator("#tab-badge")).toHaveText("1");
});

test("check button marks watched, undo restores, state survives reload", async ({ page }) => {
  await page.goto("./");
  await openCards(page).nth(1).getByRole("button", { name: "Mark as watched" }).click();
  await expect(openCards(page)).toHaveCount(1);
  await page.locator("#toast").getByRole("button", { name: "Undo" }).click();
  await expect(openCards(page)).toHaveCount(2);

  await openCards(page).nth(1).getByRole("button", { name: "Mark as watched" }).click();
  await expect(openCards(page)).toHaveCount(1);
  await page.reload();
  await expect(openCards(page)).toHaveCount(1);
  await expect(openCards(page).first()).toContainText("FC Sevilla");

  // Move a baseline recap back to open.
  await watchedRows(page).filter({ hasText: "Guadalajara" }).getByRole("button", { name: "Mark as unwatched" }).click();
  await expect(openCards(page)).toHaveCount(2);
  await expect(openCards(page).first()).toContainText("Guadalajara");
});

test("all caught up state", async ({ page }) => {
  await page.goto("./");
  await page.locator("#settings-btn").click();
  await page.getByRole("button", { name: "Mark all as watched" }).click();
  await expect(page.getByText("All caught up")).toBeVisible();
  await expect(page.locator("#tab-badge")).toBeHidden();
});

test("notification deep link opens the recap sheet", async ({ page }) => {
  await page.goto("./#/v/a966F5tgpNs");
  const sheet = page.locator("#sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("New Barça recap");
  await expect(sheet).toContainText("FC Barcelona – FC Getafe");
  await sheet.getByRole("button", { name: "Mark as watched" }).click();
  await expect(sheet).toBeHidden();
  await expect(openCards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/$/);
});

test("deep link to a not-yet-synced recap still offers YouTube", async ({ page }) => {
  await page.goto("./#/v/brandNew123");
  const sheet = page.locator("#sheet");
  await expect(sheet).toContainText("hasn't synced it yet");
  await expect(sheet.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", /watch\?v=brandNew123/);
});

test("spoiler protection can be turned off", async ({ page }) => {
  await page.goto("./");
  await page.locator("#settings-btn").click();
  await page.locator("#spoiler-toggle").setChecked(false, { force: true });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Jesus gibt den perfekten Raphinha-Ersatz")).toBeVisible();
  await expect(page.locator("#view-recaps")).not.toHaveClass(/spoiler-free/);
  await page.reload();
  await expect(page.getByText("Jesus gibt den perfekten Raphinha-Ersatz")).toBeVisible();
});

test("matches tab lists upcoming fixtures", async ({ page }) => {
  await page.goto("./");
  await page.locator(".tab", { hasText: "Matches" }).click();
  const fixtures = page.locator(".fixture");
  await expect(fixtures.first()).toContainText("UEFA Champions League");
  await expect(fixtures.first()).toContainText("Galatasaray");
  expect(await fixtures.count()).toBeGreaterThan(5);
});

test("table is guarded while recaps are open, then shows Barça highlighted", async ({ page }) => {
  await page.goto("./");
  await page.locator(".tab", { hasText: "Table" }).click();
  await expect(page.locator(".spoiler-guard")).toContainText("2 unwatched recaps");
  await page.getByRole("button", { name: "Show anyway" }).click();
  await expect(page.locator(".spoiler-guard")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.locator("tr.is-barca")).toContainText("Barcelona");
  await expect(page.locator(".summary")).toContainText("24");
});

test("works offline after the first visit (service worker)", async ({ page, context }) => {
  await page.goto("./");
  await expect(openCards(page)).toHaveCount(2);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the SW, populates runtime cache
  await expect(openCards(page)).toHaveCount(2);
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toContainText("Barça Recaps");
  await expect(openCards(page)).toHaveCount(2);
});

test("manifest and icons are installable", async ({ page, request }) => {
  await page.goto("./");
  const manifest = await (await request.get("manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.ok(), icon.src).toBeTruthy();
    expect(res.headers()["content-type"]).toBe("image/png");
  }
});
