import assert from "node:assert/strict";
import test from "node:test";
import { createPublicViewUrl, readPublicViewFromHash } from "../src/public-share";
import type { PlannerState } from "../src/types";

const state: PlannerState = {
  version: 5,
  currentPlanId: "p1",
  plans: [
    {
      id: "p1",
      name: "Day 1",
      date: "2026-08-16",
      territories: { m30: { territoryId: "m30", status: "priority" } },
      arrows: [],
      labels: [],
      markers: [],
      baseAssignments: {},
      updatedAt: 1,
    },
    {
      id: "p2",
      name: "Private history",
      date: "2026-08-15",
      territories: {},
      arrows: [],
      labels: [],
      markers: [],
      baseAssignments: {},
      updatedAt: 1,
    },
  ],
  alliances: [{ id: "ust", name: "UST", shortName: "UST", color: "#32d47b", isPlayerAlliance: true }],
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
};

test("public link contains only the current plan and restores it", async () => {
  const location = { href: "https://example.test/TilesClashPlanner/", hash: "" };
  Object.defineProperty(globalThis, "window", { value: { location }, configurable: true });
  const url = await createPublicViewUrl(state, "gene-clash");
  location.hash = new URL(url).hash;
  const payload = await readPublicViewFromHash();
  assert.equal(payload?.mapId, "gene-clash");
  assert.equal(payload?.state.plans.length, 1);
  assert.equal(payload?.state.plans[0]?.name, "Day 1");
  assert.equal(payload?.state.plans[0]?.territories.m30?.status, "priority");
});
