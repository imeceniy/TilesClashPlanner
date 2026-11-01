import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createPlannerServer } from "../server/server.ts";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url).pathname;
const map = JSON.parse(await readFile(new URL("../data/gene-clash-map.json", import.meta.url), "utf8"));
const dataDirectory = await mkdtemp(join(tmpdir(), "tiles-clash-e2e-"));
const { server } = await createPlannerServer({ dataFile: join(dataDirectory, "database.json"), trustProxy: true });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const apiOrigin = `http://127.0.0.1:${address.port}`;
const appPort = 30_000 + (process.pid % 10_000);
const appOrigin = `http://127.0.0.1:${appPort}`;
const frontend = spawn("npm", ["run", "dev", "--", "--port", String(appPort), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
  detached: true,
  env: { ...process.env, PLANNER_API_PROXY: apiOrigin },
});
const browser = await chromium.launch({ headless: true });

async function waitFor(url) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Сервер не запустился: ${url}`);
}

async function registerInUi(page, username, displayName) {
  await page.locator("#collaborationBtn").click();
  await page.locator("#registerTab").click();
  await page.locator("#authUsername").fill(username);
  await page.locator("#authDisplayName").fill(displayName);
  await page.locator("#authPassword").fill("password-123");
  await page.locator("#authSubmit").click();
  await page.waitForFunction(
    (login) =>
      document.querySelector("#cloudUserLogin")?.textContent?.includes(`@${login}`) || document.querySelector("#authError")?.textContent,
    username,
  );
  assert.equal(await page.locator("#authError").textContent(), "");
}

async function clickMapPoint(page, point) {
  const canvas = await page.locator("#mapCanvas .konvajs-content").boundingBox();
  const ratio = canvas.width / canvas.height;
  const mapRatio = map.width / map.height;
  const box =
    ratio > mapRatio
      ? { x: -(map.height * ratio - map.width) / 2, y: 0, width: map.height * ratio, height: map.height }
      : { x: 0, y: -(map.width / ratio - map.height) / 2, width: map.width, height: map.width / ratio };
  const scale = Math.min(canvas.width / box.width, canvas.height / box.height);
  await page.mouse.click(canvas.x + (point.x - box.x) * scale, canvas.y + (point.y - box.y) * scale);
}

try {
  await waitFor(appOrigin);
  await fetch(`${apiOrigin}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "editor", displayName: "Editor", password: "password-123" }),
  });

  const ownerContext = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const owner = await ownerContext.newPage();
  await owner.goto(appOrigin, { waitUntil: "networkidle" });
  await owner.locator("#mapEmpty").waitFor({ state: "hidden" });
  await registerInUi(owner, "owner", "Owner");
  owner.once("dialog", (dialog) => dialog.accept("War room"));
  await owner.locator("#createCloudProject").click();
  await owner.locator(".cloud-project-header").filter({ hasText: "War room" }).waitFor();
  await owner.locator("#memberUsername").fill("editor");
  await owner.locator("#memberRole").selectOption("R4");
  await owner.locator("#addCloudMember button").click();
  await owner.locator(".member-row").filter({ hasText: "@editor" }).waitFor();

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await editor.goto(appOrigin, { waitUntil: "networkidle" });
  await editor.locator("#mapEmpty").waitFor({ state: "hidden" });
  await editor.locator('[data-tool="captured"]').click();
  await clickMapPoint(
    editor,
    map.territories.find(({ id }) => id === "lair-M30"),
  );
  await editor.waitForFunction(() => document.querySelector("#saveState")?.textContent?.includes("Сохранено"));
  const personalKey = "tiles-clash-planner:v6";
  assert.equal(
    await editor.evaluate((key) => JSON.parse(localStorage.getItem(key)).plans[0].territories["lair-M30"].status, personalKey),
    "captured",
  );
  await editor.locator("#collaborationBtn").click();
  await editor.locator("#authUsername").fill("editor");
  await editor.locator("#authPassword").fill("password-123");
  await editor.locator("#authSubmit").click();
  await editor.locator(".cloud-project").filter({ hasText: "War room" }).click();
  await editor.locator(".cloud-project-header").filter({ hasText: "R4" }).waitFor();
  await editor.reload({ waitUntil: "networkidle" });
  await editor.locator("#collaborationBtn").click();
  await editor.locator(".cloud-project-header").filter({ hasText: "War room" }).waitFor();
  assert.match(await editor.locator(".cloud-project-header").textContent(), /R4/);
  assert.equal(await editor.evaluate(() => Object.keys(localStorage).some((key) => key.includes(":cloud:"))), true);

  await owner.locator("#closeCollaboration").click();
  owner.once("dialog", (dialog) => dialog.accept("Day realtime"));
  await owner.locator("#renamePlan").click();
  await editor.locator("#planSelect").filter({ hasText: "Day realtime" }).waitFor({ timeout: 10_000 });

  await owner.locator("#collaborationBtn").click();
  await owner.locator("#shortShare").click();
  await owner.locator("#toast").filter({ hasText: "Короткая ссылка скопирована" }).waitFor();
  const shareUrl = await owner.evaluate(() => navigator.clipboard.readText());
  const sharedLocation = new URL(shareUrl);
  assert.equal(sharedLocation.origin, appOrigin);
  assert.match(sharedLocation.pathname, /^\/share\/[A-Za-z0-9_-]+$/);

  await owner.locator('[data-member-role][data-username="editor"]').selectOption("MEMBER");
  await editor.locator("#readOnlyBadge").waitFor({ state: "visible" });
  await editor.locator("#logoutBtn").click();
  await editor.locator("#readOnlyBadge").waitFor({ state: "hidden" });
  assert.equal(await editor.evaluate(() => localStorage.getItem("tiles-clash-planner:active-cloud-project")), null);
  assert.equal(
    await editor.evaluate((key) => JSON.parse(localStorage.getItem(key)).plans[0].territories["lair-M30"].status, personalKey),
    "captured",
  );
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(shareUrl, { waitUntil: "networkidle" });
  await publicPage.locator("#mapEmpty").waitFor({ state: "hidden" });
  assert.equal(await publicPage.locator("#readOnlyBadge").isVisible(), true);
  assert.equal(await publicPage.locator("#collaborationBtn").isVisible(), false);

  await Promise.all([ownerContext.close(), editorContext.close(), publicContext.close()]);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  try {
    process.kill(-frontend.pid, "SIGTERM");
  } catch {}
}
