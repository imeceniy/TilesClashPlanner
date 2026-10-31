import assert from "node:assert/strict";
import test from "node:test";
import { assignTerritoryStatus, clonePlanForDay, findTerritories, PlannerHistory } from "../src/planner-store";
import { blankPlan } from "../src/plans";
import type { PlannerState, Territory } from "../src/types";

const plan = () => blankPlan("day-1", "Day 1", "2026-08-15", 1);
const state = (): PlannerState => ({
  version: 5,
  plans: [plan()],
  alliances: [{ id: "ust", name: "UST", shortName: "UST", color: "#32d47b", isPlayerAlliance: true }],
  currentPlanId: "day-1",
  settings: {
    showNames: true,
    showValues: false,
    showEnemies: true,
    showNeutral: true,
    showArrows: true,
    showConnections: true,
    showLabels: true,
    showMarkers: true,
    showLegend: true,
    showStrategic: false,
    viewBox: null,
  },
});

test("territory status changes, keeps notes and returns to neutral", () => {
  const current = plan();
  current.territories["lair-M30"] = { territoryId: "lair-M30", status: "neutral", note: "hold" };
  assignTerritoryStatus(current, "lair-M30", "enemy", "enemy-abc");
  assert.equal(current.territories["lair-M30"]?.ownerAllianceId, "enemy-abc");
  assert.equal(current.territories["lair-M30"]?.note, "hold");
  assignTerritoryStatus(current, "lair-M30", "captured");
  assert.equal(current.territories["lair-M30"]?.ownerAllianceId, undefined);
  assignTerritoryStatus(current, "lair-M30", "neutral");
  assert.equal(current.territories["lair-M30"], undefined);
});

test("returning a territory to neutral preserves its emphasized name", () => {
  const current = plan();
  current.territories["lair-M30"] = { territoryId: "lair-M30", status: "priority", emphasized: true };
  assignTerritoryStatus(current, "lair-M30", "neutral");
  assert.deepEqual(current.territories["lair-M30"], { territoryId: "lair-M30", status: "neutral", emphasized: true });
});

test("plan cloning is independent", () => {
  const source = plan();
  assignTerritoryStatus(source, "lair-M30", "priority");
  const copy = clonePlanForDay(source, "day-2", "Day 2", "2026-08-16", 123);
  copy.territories["lair-M30"]!.status = "captured";
  assert.equal(source.territories["lair-M30"]?.status, "priority");
  assert.equal(copy.updatedAt, 123);
});

test("history supports undo and redo", () => {
  const current = state();
  const history = new PlannerHistory();
  history.push(current);
  assignTerritoryStatus(current.plans[0]!, "lair-M30", "priority");
  const before = history.undo(current)!;
  assert.equal(before.plans[0]!.territories["lair-M30"], undefined);
  const after = history.redo({ ...current, ...before })!;
  assert.equal(after.plans[0]!.territories["lair-M30"]?.status, "priority");
});

test("search is case-insensitive and limited", () => {
  const territories = [{ name: "M30" }, { name: "M31" }, { name: "XL30" }] as Territory[];
  assert.deepEqual(
    findTerritories(territories, "m3", 2).map(({ name }) => name),
    ["M30", "M31"],
  );
});
