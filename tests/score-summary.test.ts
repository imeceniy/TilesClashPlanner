import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { blankPlan } from "../src/plans";
import { calculateScoreSummary } from "../src/score-summary";
import type { MapData } from "../src/types";

const map = JSON.parse(await readFile(new URL("../data/gene-clash-map.json", import.meta.url), "utf8")) as MapData;

test("score summary separates captured and planned rewards", () => {
  const plan = blankPlan("p", "Plan", "2026-08-17");
  plan.territories["lair-M30"] = { territoryId: "lair-M30", status: "captured" };
  plan.territories["lair-XS01"] = { territoryId: "lair-XS01", status: "hold" };
  plan.territories["workbench-XL02"] = { territoryId: "workbench-XL02", status: "priority" };
  plan.territories["workbench-S01"] = { territoryId: "workbench-S01", status: "secondary" };
  plan.territories["workbench-M01"] = { territoryId: "workbench-M01", status: "noAttack" };
  plan.territories["lair-M29"] = { territoryId: "lair-M29", status: "enemy" };
  assert.deepEqual(calculateScoreSummary(map, plan), {
    capturedPoints: 475,
    capturedCount: 2,
    plannedPoints: 1400,
    plannedCount: 2,
    theoreticalPoints: 1875,
    theoreticalCount: 4,
    capturedCopperPerHour: 0,
    plannedCopperPerHour: 0,
    theoreticalCopperPerHour: 0,
  });
});
