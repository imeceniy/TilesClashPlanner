import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allianceTerritorySummariesForExport } from "../src/export";
import type { MapData, Plan, PlannerState } from "../src/types";

const map = JSON.parse(await readFile(new URL("../data/winter-map.json", import.meta.url), "utf8")) as MapData;
const territoryId = (name: string): string => {
  const territory = map.territories.find((item) => item.name === name);
  assert.ok(territory, `Missing winter territory ${name}`);
  return territory.id;
};

test("winter export summarizes assigned territories by group for each alliance", () => {
  const state: PlannerState = {
    version: 6,
    currentPlanId: "plan-1",
    plans: [],
    alliances: [
      { id: "ust", name: "UST", shortName: "UST", color: "#32d47b", isPlayerAlliance: true },
      { id: "abc", name: "ABC", shortName: "ABC", color: "#7367e8", isPlayerAlliance: false },
    ],
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
  const plan: Plan = {
    id: "plan-1",
    name: "Day 1",
    date: "2026-11-01",
    territories: {},
    arrows: [],
    labels: [],
    markers: [],
    territoryTags: [
      { id: "tag-1", territoryId: territoryId("Б1.1"), kind: "alliance", allianceId: "ust" },
      { id: "tag-2", territoryId: territoryId("Б1.2"), kind: "alliance", allianceId: "ust" },
      { id: "tag-3", territoryId: territoryId("Б1.3"), kind: "alliance", allianceId: "ust" },
      { id: "tag-4", territoryId: territoryId("Б2.1"), kind: "alliance", allianceId: "ust" },
      { id: "tag-5", territoryId: territoryId("ПГ1.1"), kind: "alliance", allianceId: "abc" },
      { id: "tag-6", territoryId: territoryId("Б1.4"), kind: "refusal" },
    ],
    baseAssignments: {},
    updatedAt: 0,
  };

  assert.deepEqual(allianceTerritorySummariesForExport(map, plan, state), [
    {
      label: "UST",
      color: "#32d47b",
      groups: [
        { label: "Б1", count: 3 },
        { label: "Б2", count: 1 },
      ],
    },
    { label: "ABC", color: "#7367e8", groups: [{ label: "ПГ1", count: 1 }] },
  ]);
});
