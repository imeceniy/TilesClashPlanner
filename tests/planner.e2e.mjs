import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const map = JSON.parse(await readFile(new URL("../data/gene-clash-map.json", import.meta.url), "utf8"));
const newEventMap = JSON.parse(await readFile(new URL("../New event/new-event-map.json", import.meta.url), "utf8"));
const winterMap = JSON.parse(await readFile(new URL("../data/winter-map.json", import.meta.url), "utf8"));
const baseUrl = process.env.PLANNER_BASE_URL || "http://127.0.0.1:4180/";
const server = process.env.PLANNER_BASE_URL ? null : spawn("npm", ["run", "dev", "--", "--port", "4180"], { cwd: root, stdio: "ignore" });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1600, height: 1000 } });

try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#mapEmpty").waitFor({ state: "hidden" });

  async function clickMapPoint(point, options = {}, currentMap = map) {
    const canvas = await page.locator("#mapCanvas .konvajs-content").boundingBox();
    const ratio = canvas.width / canvas.height;
    const mapRatio = currentMap.width / currentMap.height;
    const box =
      ratio > mapRatio
        ? {
            x: -(currentMap.height * ratio - currentMap.width) / 2,
            y: 0,
            width: currentMap.height * ratio,
            height: currentMap.height,
          }
        : {
            x: 0,
            y: -(currentMap.width / ratio - currentMap.height) / 2,
            width: currentMap.width,
            height: currentMap.width / ratio,
          };
    const scale = Math.min(canvas.width / box.width, canvas.height / box.height);
    await page.mouse.click(canvas.x + (point.x - box.x) * scale, canvas.y + (point.y - box.y) * scale, options);
  }

  async function clickTerritory(id, options) {
    const territory = map.territories.find((item) => item.id === id);
    assert.ok(territory, id);
    await clickMapPoint(territory, options);
  }

  await clickTerritory("lair-M32", { button: "right" });
  await page.locator("#contextMenu button", { hasText: "Крупное название" }).click();
  await page.locator('[data-tool="priority"]').click();
  await clickTerritory("lair-M30");
  await page.locator('[data-tool="captured"]').click();
  await clickTerritory("lair-M31");
  await page.locator('[data-tool="noAttack"]').click();
  await clickTerritory("lair-XS01");
  await page.locator(".alliance").nth(1).click();
  await page.locator('[data-tool="enemy"]').click();
  await clickTerritory("lair-M29");
  await page.locator('[data-tool="arrow"]').click();
  await clickTerritory("lair-M30");
  await clickTerritory("workbench-XL02");
  await page.locator("#finishRoute").click();
  await page.locator(".alliance").first().click();
  await page.locator(".start-point-button").first().click();
  await clickMapPoint(map.bases.find(({ id }) => id === "base-nw"));
  await page.locator("#routeTargetSelect").selectOption("workbench-XXL01");
  await page.locator("#calculateRoute").click();
  assert.ok(
    await page.locator("#routeResult").evaluate((element) => element.classList.contains("success")),
    await page.locator("#routeResult").textContent(),
  );
  assert.match(await page.locator("#routeResult").textContent(), /NW.*XXL01/);
  await page.locator("#addCalculatedRoute").click();
  await page.locator("label:has(#showStrategic)").click();
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "networkidle" });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tiles-clash-planner:v6")));
  assert.equal(saved.version, 6);
  assert.equal(saved.plans[0].territories["lair-M30"].status, "priority");
  assert.equal(saved.plans[0].territories["lair-M32"].emphasized, true);
  assert.equal(saved.plans[0].territories["lair-M31"].status, "captured");
  assert.equal(saved.plans[0].territories["lair-XS01"].status, "noAttack");
  assert.deepEqual(saved.plans[0].territories["lair-M29"], { territoryId: "lair-M29", status: "enemy", ownerAllianceId: "enemy-abc" });
  assert.ok(saved.plans[0].arrows.length > 1);
  assert.equal(saved.plans[0].baseAssignments["base-nw"], "ust");
  assert.equal(saved.settings.showStrategic, true);
  assert.equal((await page.locator("#capturedScore").textContent()).replace(/\s/g, ""), "375");
  assert.equal((await page.locator("#theoreticalScore").textContent()).replace(/\s/g, ""), "850");
  assert.equal(await page.locator(".score-panel").isVisible(), true);
  const toolbarBox = await page.locator(".toolbar").boundingBox();
  const scoreBox = await page.locator(".score-panel").boundingBox();
  const mapBox = await page.locator("#mapFrame").boundingBox();
  assert.ok(toolbarBox && scoreBox && mapBox);
  assert.ok(scoreBox.y >= toolbarBox.y + toolbarBox.height - 1);
  assert.ok(mapBox.y >= scoreBox.y + scoreBox.height - 1);
  await page.locator("#helpBtn").click();
  await page.locator("#helpModal:not([hidden])").waitFor();
  assert.match(await page.locator("#helpContent").textContent(), /Tiles Clash Planner/);
  await page.locator("#closeHelp").click();

  const allianceCount = await page.locator(".alliance").count();
  page.once("dialog", (dialog) => dialog.accept("TMP"));
  await page.locator("#addAlliance").click();
  assert.equal(await page.locator(".alliance").count(), allianceCount + 1);
  page.once("dialog", (dialog) => dialog.accept("REN"));
  await page.locator(".alliance").last().locator(".edit-alliance-button").click();
  assert.match(await page.locator(".alliance").last().textContent(), /REN/);
  await page
    .locator(".alliance")
    .last()
    .locator(".alliance-color-input")
    .evaluate((input) => {
      input.value = "#123456";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  assert.equal(
    await page
      .locator(".alliance")
      .last()
      .evaluate((item) => item.style.getPropertyValue("--alliance")),
    "#123456",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".alliance").last().locator(".delete-alliance-button").click();
  assert.equal(await page.locator(".alliance").count(), allianceCount);

  assert.equal(await page.locator("#mapSelect option").count(), 3);
  assert.equal(await page.locator('#mapSelect option[value="new-event-2026-09"]').textContent(), "Медь");
  await page.locator("#mapSelect").selectOption("new-event-2026-09");
  await page.waitForFunction(() => document.querySelector("#territoryCount")?.textContent?.includes("312"));
  assert.equal(await page.locator("#mobileMapSelect").inputValue(), "new-event-2026-09");
  assert.equal(await page.locator("#mapCaptionName").textContent(), "МЕДЬ");
  assert.equal(await page.locator(".copyright").textContent(), "© Задов Продакшн");
  assert.equal(await page.locator('[data-tool="allianceTag"]').isVisible(), true);
  assert.equal(await page.locator("#territoryAssignmentsSection").isVisible(), true);
  const firstBastion = newEventMap.regions.find(({ id }) => id === "bastion-L1-001");
  await page.locator('[data-tool="allianceTag"]').click();
  await clickMapPoint({ x: firstBastion.center[0], y: firstBastion.center[1] }, {}, newEventMap);
  await page.locator('[data-tool="refusalTag"]').click();
  await clickMapPoint({ x: firstBastion.center[0], y: firstBastion.center[1] }, {}, newEventMap);
  assert.match(await page.locator("#territoryAssignmentsList").textContent(), /UST/);
  assert.match(await page.locator("#territoryAssignmentsList").textContent(), /ОТКАЗ/);
  await page.screenshot({ path: "/tmp/tiles-clash-copper-tags.png", fullPage: true });
  await page.locator(".start-point-button").first().click();
  const firstVillage = newEventMap.regions.find(({ id }) => id === "village-001");
  await clickMapPoint({ x: firstVillage.center[0], y: firstVillage.center[1] }, {}, newEventMap);
  await page.locator('[data-tool="hold"]').click();
  const military = newEventMap.regions.find(({ resourceType }) => resourceType === "militaryBase");
  await clickMapPoint({ x: military.center[0], y: military.center[1] }, {}, newEventMap);
  assert.match(await page.locator("#capturedScoreDetails").textContent(), /50 меди\/ч/);
  await page.waitForTimeout(600);
  const newEventSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("tiles-clash-planner:v6:new-event-2026-09")));
  assert.equal(newEventSaved.plans[0].baseAssignments["village-001"], "ust");
  assert.equal(newEventSaved.plans[0].territories[military.id].status, "hold");
  assert.equal(newEventSaved.plans[0].territoryTags.filter((tag) => tag.territoryId === firstBastion.id).length, 2);
  await page.locator("#mapSelect").selectOption("gene-clash-oil-clash-season-5");
  await page.waitForFunction(() => document.querySelector("#territoryCount")?.textContent?.includes("165"));
  assert.equal((await page.locator("#theoreticalScore").textContent()).replace(/\s/g, ""), "850");
  assert.equal(await page.locator('[data-tool="allianceTag"]').isHidden(), true);
  assert.equal(await page.locator("#territoryAssignmentsSection").isHidden(), true);

  await page.locator("#mapSelect").selectOption("winter-2026");
  await page.waitForFunction(() => document.querySelector("#territoryCount")?.textContent?.includes("168"));
  assert.equal(await page.locator("#showNames").isChecked(), true);
  assert.equal(await page.locator('[data-tool="allianceTag"]').isVisible(), true);
  assert.equal(await page.locator('[data-tool="refusalTag"]').isVisible(), true);
  const winterTerritory = winterMap.territories.find(({ id }) => id === "winter-b5-001");
  await page.locator('[data-tool="allianceTag"]').click();
  await clickMapPoint(winterTerritory, {}, winterMap);
  await page.locator('[data-tool="refusalTag"]').click();
  await clickMapPoint(winterTerritory, {}, winterMap);
  await page.locator('[data-tool="marker"]').click();
  assert.equal(await page.locator('[data-tool="marker"]').getAttribute("aria-pressed"), "true");
  await clickMapPoint(winterTerritory, {}, winterMap);
  await page.waitForFunction(() => document.querySelector("#toast")?.textContent?.includes("Маркер UST добавлен"));
  await page.waitForTimeout(600);
  const winterSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("tiles-clash-planner:v6:winter-2026")));
  assert.deepEqual(winterSaved.plans[0].territoryTags.map(({ kind }) => kind).sort(), ["alliance", "refusal"]);
  assert.equal(winterSaved.plans[0].markers.length, 1);
  assert.equal(winterSaved.plans[0].markers[0].x, winterTerritory.x);
  assert.equal(winterSaved.plans[0].markers[0].y, winterTerritory.y);
  const winterExportPromise = page.waitForEvent("download");
  await page.locator("#exportPng").click();
  const winterExport = await winterExportPromise;
  await winterExport.saveAs("/tmp/tiles-clash-winter-export.png");
  await page.locator("#mapSelect").selectOption("gene-clash-oil-clash-season-5");
  await page.waitForFunction(() => document.querySelector("#territoryCount")?.textContent?.includes("165"));

  await page.locator("#shareView").click();
  await page.locator("#toast:not([hidden])").waitFor();
  const publicUrl = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(publicUrl, /#view=g\./);
  const publicPage = await context.newPage();
  await publicPage.goto(publicUrl, { waitUntil: "networkidle" });
  await publicPage.locator("#mapEmpty").waitFor({ state: "hidden" });
  assert.equal(await publicPage.locator("body.readonly").count(), 1);
  assert.equal(await publicPage.locator("#readOnlyBadge").isVisible(), true);
  assert.equal(await publicPage.locator(".toolbar").isVisible(), false);
  assert.equal(await publicPage.locator(".score-panel").isVisible(), true);
  assert.equal(await publicPage.locator("#shareView").isVisible(), false);
  const publicMapFrame = await publicPage.locator("#mapFrame").boundingBox();
  const publicMapCanvas = await publicPage.locator("#mapCanvas .konvajs-content").boundingBox();
  assert.ok(publicMapFrame && publicMapFrame.height > 500, JSON.stringify(publicMapFrame));
  assert.ok(publicMapCanvas && publicMapCanvas.height > 450, JSON.stringify(publicMapCanvas));
  assert.match(await publicPage.locator("#selectionInfo").textContent(), /Ничего не выбрано/);
  await publicPage.close();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportPng").click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.png$/);
  await download.saveAs("/tmp/tiles-clash-export.png");
  await page.screenshot({ path: "/tmp/tiles-clash-complete-desktop.png", fullPage: true });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await mobile.locator(".score-panel").isVisible(), true);
  const canvasMetrics = await mobile
    .locator("#mapCanvas canvas")
    .first()
    .evaluate((canvas) => ({
      pixels: canvas.width,
      css: canvas.getBoundingClientRect().width,
    }));
  assert.ok(canvasMetrics.pixels <= canvasMetrics.css * 1.1, JSON.stringify(canvasMetrics));
  await mobile.locator("#mobileSidebarToggle").click();
  await mobile.locator(".sidebar.open").waitFor();
  await mobile.waitForTimeout(250);
  assert.equal(await mobile.locator("#mobilePlanSelect").isVisible(), true);
  await mobile.locator("#mobileMapSelect").selectOption("new-event-2026-09");
  await mobile.waitForFunction(() => document.querySelector("#territoryCount")?.textContent?.includes("312"));
  await mobile.locator("#mobileSidebarToggle").click();
  await mobile.locator('[data-tool="allianceTag"]').click();
  await mobile.locator("#zoomIn").click();
  await mobile.locator("#zoomIn").click();
  await mobile.waitForTimeout(600);
  const viewBeforePan = await mobile.evaluate(
    () => JSON.parse(localStorage.getItem("tiles-clash-planner:v6:new-event-2026-09")).settings.viewBox,
  );
  const mobileCanvas = await mobile.locator("#mapCanvas .konvajs-content").boundingBox();
  assert.ok(mobileCanvas);
  const touchX = mobileCanvas.x + mobileCanvas.width * 0.3;
  const touchY = mobileCanvas.y + mobileCanvas.height * 0.5;
  const cdp = await mobileContext.newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: touchY }] });
  for (let step = 1; step <= 5; step += 1)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: touchX - step * 14, y: touchY }],
    });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await mobile.waitForTimeout(700);
  const viewAfterPan = await mobile.evaluate(
    () => JSON.parse(localStorage.getItem("tiles-clash-planner:v6:new-event-2026-09")).settings.viewBox,
  );
  assert.ok(viewAfterPan.x > viewBeforePan.x + 20, JSON.stringify({ viewBeforePan, viewAfterPan }));
  assert.equal(await mobile.locator("#contextMenu").isHidden(), true);
  await mobile.locator('[data-tool="select"]').click();
  const visibleTerritory = newEventMap.regions
    .filter(({ interactive }) => interactive)
    .map((region) => ({
      region,
      distance: Math.hypot(
        region.center[0] - (viewAfterPan.x + viewAfterPan.width / 2),
        region.center[1] - (viewAfterPan.y + viewAfterPan.height / 2),
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0].region;
  const mobileScale = Math.min(mobileCanvas.width / viewAfterPan.width, mobileCanvas.height / viewAfterPan.height);
  await mobile.touchscreen.tap(
    mobileCanvas.x + (visibleTerritory.center[0] - viewAfterPan.x) * mobileScale,
    mobileCanvas.y + (visibleTerritory.center[1] - viewAfterPan.y) * mobileScale,
  );
  await mobile.locator("#contextMenu:not([hidden])").waitFor();
  await mobile.screenshot({ path: "/tmp/tiles-clash-complete-mobile.png", fullPage: true });
  await mobileContext.close();
} finally {
  await context.close();
  await browser.close();
  server?.kill("SIGTERM");
}
