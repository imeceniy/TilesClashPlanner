import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePolygonMap, type PolygonMapSource } from "../src/map-catalog";
import { blankPlan } from "../src/plans";
import { calculateScoreSummary } from "../src/score-summary";

const source = JSON.parse(await readFile(new URL("../New event/new-event-map.json", import.meta.url), "utf8")) as PolygonMapSource;
const map = normalizePolygonMap(source);

test("new event map keeps Arcadia decorative and exposes the complete playable graph", () => {
  assert.equal(map.id, "new-event-2026-09");
  assert.equal(map.variant, "polygon");
  assert.equal(map.territories.length, 312);
  assert.equal(map.connections.length, 722);
  assert.equal(map.bases.length, 0);
  assert.equal(map.decorations?.length, 1);
  assert.equal(map.decorations?.[0]?.name, "Аркадия");
  assert.equal(
    map.territories.some(({ id }) => id === "event-center-01"),
    false,
  );
  assert.equal((source as PolygonMapSource & { extraction: { traceScale: number } }).extraction.traceScale, 4);
  const shortSegments = source.regions.flatMap(({ points }) =>
    points.filter((point, index) => {
      const next = points[(index + 1) % points.length]!;
      return Math.hypot(next[0] - point[0], next[1] - point[1]) <= 6;
    }),
  );
  assert.ok(shortSegments.length <= 2, `Слишком много коротких сегментов: ${shortSegments.length}`);
});

test("new event rewards include bastion capture points and copper production", () => {
  const bastion = map.territories.find(({ type, size }) => type === "bastion" && size === "L6");
  const military = map.territories.find(({ type }) => type === "militaryBase");
  const tradingPost = map.territories.find(({ type }) => type === "tradingPost");
  assert.equal(bastion?.value, 1500);
  assert.equal(military?.copperPerHour, 50);
  assert.equal(tradingPost?.value, 0);
  assert.equal(tradingPost?.copperPerHour, 0);

  const plan = blankPlan("new-event", "Новое событие", "2026-09-10");
  plan.territories[bastion!.id] = { territoryId: bastion!.id, status: "priority" };
  plan.territories[military!.id] = { territoryId: military!.id, status: "hold" };
  const summary = calculateScoreSummary(map, plan);
  assert.equal(summary.plannedPoints, 1500);
  assert.equal(summary.capturedCopperPerHour, 50);
  assert.equal(summary.theoreticalCopperPerHour, 50);
});

test("bastions receive stable level-based labels without the former brown fill", () => {
  const first = map.territories.find(({ id }) => id === "bastion-L1-001");
  const sixth = map.territories.find(({ id }) => id === "bastion-L6-001");
  assert.equal(first?.name, "Б1.1");
  assert.equal(first?.bastionLevel, 1);
  assert.equal(first?.bastionIndex, 1);
  assert.equal(sixth?.name, "Б6.1");
  assert.equal(first?.baseColor, "#eef2ea");
});
