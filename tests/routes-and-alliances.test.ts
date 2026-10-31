import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assignedBaseForAlliance, removeAllianceReferences, setBaseAssignment } from "../src/alliances";
import { blankPlan } from "../src/plans";
import { findRoute, findStrategicRoute, recommendTargets, routePathToArrows, territoryTheme } from "../src/tools";
import type { GameConfig, MapData } from "../src/types";

const map = JSON.parse(await readFile(new URL("../data/gene-clash-map.json", import.meta.url), "utf8")) as MapData;
test("route finder reaches a target from NW and produces arrows", () => {
  const route = findRoute(map, "base-nw", "workbench-XXL01");
  assert.equal(route.reachable, true);
  assert.equal(route.path[0], "base-nw");
  assert.equal(route.path.at(-1), "workbench-XXL01");
  assert.ok(routePathToArrows(route.path, map, () => "a").length > 0);
});
test("ignored target is unavailable", () => {
  const route = findRoute(map, "base-nw", "workbench-XXL01", new Set(["workbench-XXL01"]));
  assert.equal(route.reachable, false);
});
test("do-not-hit target is unavailable to the strategic route", () => {
  const plan = blankPlan("p", "P", "2026-08-15");
  plan.territories["workbench-XXL01"] = { territoryId: "workbench-XXL01", status: "secondary" };
  assert.equal(findStrategicRoute(map, "base-nw", "workbench-XXL01", plan, { lairs: {}, workbenches: {} }).reachable, false);
});
test("base assignment is one-to-one for an alliance", () => {
  const plan = blankPlan("p", "P", "2026-08-15");
  setBaseAssignment(plan, "base-nw", "ust");
  setBaseAssignment(plan, "base-ne", "ust");
  assert.deepEqual(plan.baseAssignments, { "base-ne": "ust" });
  assert.equal(assignedBaseForAlliance(plan, map.bases, "ust")?.id, "base-ne");
});
test("removing an alliance clears its references without touching other alliances", () => {
  const plan = blankPlan("p", "P", "2026-08-15");
  plan.baseAssignments = { "base-nw": "abc", "base-ne": "xyz" };
  plan.territories = {
    a: { territoryId: "a", status: "enemy", ownerAllianceId: "abc" },
    b: { territoryId: "b", status: "enemy", ownerAllianceId: "xyz" },
  };
  plan.markers = [
    { id: "m1", x: 1, y: 1, allianceId: "abc" },
    { id: "m2", x: 2, y: 2, allianceId: "xyz" },
  ];
  plan.territoryTags = [
    { id: "t1", territoryId: "a", kind: "alliance", allianceId: "abc" },
    { id: "t2", territoryId: "b", kind: "alliance", allianceId: "xyz" },
    { id: "t3", territoryId: "a", kind: "refusal" },
  ];

  assert.deepEqual(removeAllianceReferences(plan, "abc"), { bases: 1, territories: 1, markers: 1, tags: 1 });
  assert.deepEqual(plan.baseAssignments, { "base-ne": "xyz" });
  assert.deepEqual(Object.keys(plan.territories), ["b"]);
  assert.deepEqual(
    plan.markers.map(({ id }) => id),
    ["m2"],
  );
  assert.deepEqual(
    plan.territoryTags.map(({ id }) => id),
    ["t2", "t3"],
  );
});
test("enemy territory uses its alliance color", () => {
  const theme = territoryTheme({ territoryId: "lair-M29", status: "enemy", ownerAllianceId: "abc" }, [
    { id: "abc", name: "ABC", shortName: "ABC", color: "#7367e8", isPlayerAlliance: false },
  ]);
  assert.equal(theme.color, "#7367e8");
});
test("captured territory uses the player alliance color", () => {
  const theme = territoryTheme({ territoryId: "lair-M30", status: "captured" }, [
    { id: "ust", name: "UST", shortName: "UST", color: "#123456", isPlayerAlliance: true },
    { id: "abc", name: "ABC", shortName: "ABC", color: "#7367e8", isPlayerAlliance: false },
  ]);
  assert.equal(theme.color, "#123456");
});

test("strategic route prefers a longer captured corridor over an enemy shortcut", () => {
  const strategicMap: MapData = {
    id: "test",
    name: "test",
    renderer: "konva",
    width: 100,
    height: 100,
    bases: [{ id: "base-nw", name: "NW", x: 0, y: 0, defaultColor: "#fff" }],
    baseConnections: [
      { id: "ba", from: "base-nw", to: "a" },
      { id: "bb", from: "base-nw", to: "b" },
    ],
    connections: [
      { id: "at", from: "a", to: "target" },
      { id: "bc", from: "b", to: "c" },
      { id: "ct", from: "c", to: "target" },
    ],
    territories: [
      { id: "a", name: "A", type: "lair", size: "S", x: 20, y: 20, value: 200, defaultShape: "circle" },
      { id: "b", name: "B", type: "lair", size: "S", x: 20, y: 60, value: 200, defaultShape: "circle" },
      { id: "c", name: "C", type: "lair", size: "S", x: 50, y: 60, value: 200, defaultShape: "circle" },
      { id: "target", name: "XXL01", type: "workbench", size: "XXL", x: 80, y: 40, value: 2000, defaultShape: "square" },
    ],
  };
  const plan = blankPlan("p", "P", "2026-08-16");
  plan.territories.a = { territoryId: "a", status: "enemy" };
  plan.territories.b = { territoryId: "b", status: "captured" };
  plan.territories.c = { territoryId: "c", status: "captured" };
  const config: GameConfig = {
    lairs: { S: { value: 200 } },
    workbenches: { XXL: { value: 2000, efficiency: 3.33 } },
  };
  const route = findStrategicRoute(strategicMap, "base-nw", "target", plan, config);
  assert.deepEqual(route.path, ["base-nw", "b", "c", "target"]);
  assert.equal(route.uncapturedCount, 1);
  assert.ok((route.alternatives?.length ?? 0) >= 2);
});

test("target recommendations favor efficiency per required territory", () => {
  const recommendations = recommendTargets(map, "base-nw", blankPlan("p", "P", "2026-08-16"), {
    lairs: { XS: { value: 100 }, S: { value: 200 }, M: { value: 375 } },
    workbenches: {
      S: { value: 300, efficiency: 1 },
      M: { value: 400, efficiency: 1 },
      L: { value: 600, efficiency: 1 },
      XL: { value: 1000, efficiency: 1.67 },
      XXL: { value: 2000, efficiency: 3.33 },
    },
  });
  assert.equal(recommendations.length, 5);
  assert.ok(recommendations.every(({ recommendationScore }) => Number.isFinite(recommendationScore)));
  assert.ok(recommendations[0]!.recommendationScore >= recommendations[1]!.recommendationScore);
});
