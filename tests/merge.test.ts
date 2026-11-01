import assert from "node:assert/strict";
import test from "node:test";
import { mergeProjectStates } from "../src/merge";
import type { PlannerState } from "../src/types";

function state(): PlannerState {
  return {
    version: 6,
    currentPlanId: "p1",
    plans: [
      {
        id: "p1",
        name: "Day 1",
        date: "2026-10-31",
        territories: {},
        arrows: [],
        labels: [],
        markers: [],
        territoryTags: [],
        baseAssignments: {},
        updatedAt: 1,
      },
    ],
    alliances: [{ id: "a1", name: "A", shortName: "A", color: "#112233", isPlayerAlliance: true }],
    settings: {
      showNames: true,
      showValues: true,
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
  };
}

test("three-way merge combines independent territory edits", () => {
  const base = state();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.plans[0]!.territories.M30 = { territoryId: "M30", status: "captured" };
  remote.plans[0]!.territories.M31 = { territoryId: "M31", status: "hold" };
  const result = mergeProjectStates(base, local, remote);
  assert.deepEqual(Object.keys(result.state.plans[0]!.territories).sort(), ["M30", "M31"]);
  assert.deepEqual(result.conflicts, []);
});

test("same territory conflict is local-wins and reported", () => {
  const base = state();
  base.plans[0]!.territories.M30 = { territoryId: "M30", status: "neutral" };
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.plans[0]!.territories.M30!.status = "captured";
  remote.plans[0]!.territories.M30!.status = "hold";
  const result = mergeProjectStates(base, local, remote);
  assert.equal(result.state.plans[0]!.territories.M30!.status, "captured");
  assert.equal(result.conflicts.length, 1);
});

test("deletion versus a remote change keeps the changed entity", () => {
  const base = state();
  base.plans[0]!.territories.M30 = { territoryId: "M30", status: "neutral" };
  const local = structuredClone(base);
  const remote = structuredClone(base);
  delete local.plans[0]!.territories.M30;
  remote.plans[0]!.territories.M30!.status = "hold";
  const result = mergeProjectStates(base, local, remote);
  assert.equal(result.state.plans[0]!.territories.M30!.status, "hold");
  assert.equal(result.conflicts.length, 1);
});

test("current plan stays local when it still exists", () => {
  const base = state();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.plans.push({ ...structuredClone(local.plans[0]!), id: "p2", name: "Day 2" });
  local.currentPlanId = "p2";
  const result = mergeProjectStates(base, local, remote);
  assert.equal(result.state.currentPlanId, "p2");
});
