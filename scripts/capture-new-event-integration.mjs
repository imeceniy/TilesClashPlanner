import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = process.env.PLANNER_BASE_URL ?? "http://127.0.0.1:4181/";
const newEventMap = JSON.parse(await readFile(new URL("../New event/new-event-map.json", import.meta.url), "utf8"));
const server = process.env.PLANNER_BASE_URL
  ? null
  : spawn("npm", ["run", "dev", "--", "--port", "4181"], { cwd: new URL("../", import.meta.url).pathname, stdio: "ignore" });
const browser = await chromium.launch({ headless: true });
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const page = await browser.newPage({ viewport: { width: 1800, height: 1120 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#mapEmpty").waitFor({ state: "hidden" });
  await page.locator("#mapSelect").selectOption("new-event-2026-09");
  await page.waitForFunction(() => document.querySelector("#territoryCount")?.textContent?.includes("312"));
  await page.locator("#showNames").evaluate((element) => {
    element.checked = false;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#showConnections").evaluate((element) => {
    element.checked = true;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#fitMap").click();
  await page.waitForTimeout(500);
  const sampleRegions = newEventMap.regions
    .filter(({ interactive, center }) => interactive && center[0] > 210 && center[0] < 410 && center[1] > 330 && center[1] < 560)
    .slice(0, 24);
  await page.evaluate((regions) => {
    const key = "tiles-clash-planner:v6:new-event-2026-09";
    const state = JSON.parse(localStorage.getItem(key));
    regions.forEach((region, index) => {
      const status = index < 14 ? "captured" : "enemy";
      state.plans[0].territories[region.id] = {
        territoryId: region.id,
        status,
        ...(status === "enemy" ? { ownerAllianceId: "enemy-abc" } : {}),
      };
    });
    localStorage.setItem(key, JSON.stringify(state));
  }, sampleRegions);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#mapEmpty").waitFor({ state: "hidden" });
  await page.locator("#fitMap").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "New event/integrated-planner-preview.png", fullPage: true });
  await page.locator("#searchInput").fill(sampleRegions[8].name);
  await page.locator("#searchResults button").first().click();
  await page.waitForTimeout(300);
  await page.locator("#mapCanvas").screenshot({ path: "New event/map-boundaries-detail.png" });
  const standalone = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  await standalone.goto(new URL("New%20event/preview.html", baseUrl).toString(), { waitUntil: "networkidle" });
  await standalone.screenshot({ path: "New event/new-event-map-preview.png", fullPage: true });
  await standalone.close();
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
