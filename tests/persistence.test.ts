import assert from "node:assert/strict";
import test from "node:test";
import { migrateProject, parseProject, serializeProject, STORAGE_VERSION } from "../src/persistence";
import type { PlannerState } from "../src/types";

const defaults: PlannerState = {
  version: 6,
  currentPlanId: "p1",
  plans: [
    {
      id: "p1",
      name: "Day 1",
      date: "2026-08-15",
      territories: {},
      arrows: [],
      labels: [],
      markers: [],
      territoryTags: [],
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

test("v1 migrates to the current format and removes obsolete starts", () => {
  const legacy = structuredClone(defaults) as unknown as Record<string, unknown>;
  legacy.version = 1;
  (legacy.plans as Array<Record<string, unknown>>)[0]!.allianceStarts = { ust: "lair-M30" };
  const migrated = migrateProject(legacy, defaults);
  assert.equal(migrated.version, STORAGE_VERSION);
  assert.equal("allianceStarts" in migrated.plans[0]!, false);
  assert.equal(migrated.settings.showStrategic, false);
});
test("v2 migrates emphasized territory names as disabled by default", () => {
  const legacy = structuredClone(defaults) as unknown as Record<string, unknown>;
  legacy.version = 2;
  const migrated = migrateProject(legacy, defaults);
  assert.equal(migrated.version, STORAGE_VERSION);
  assert.equal(migrated.plans[0]!.territories.m30?.emphasized, undefined);
});
test("emphasized territory names survive serialization", () => {
  const project = structuredClone(defaults);
  project.plans[0]!.territories.m30 = { territoryId: "m30", status: "neutral", emphasized: true };
  assert.equal(parseProject(serializeProject(project), defaults).plans[0]!.territories.m30?.emphasized, true);
});
test("v3 migrates and removes obsolete no-attack overlay markers", () => {
  const legacy = structuredClone(defaults) as unknown as Record<string, unknown>;
  legacy.version = 3;
  (legacy.plans as Array<Record<string, unknown>>)[0]!.markers = [{ id: "old", x: 10, y: 20, allianceId: "__no_attack__" }];
  assert.deepEqual(migrateProject(legacy, defaults).plans[0]!.markers, []);
});
test("no-attack territory status survives serialization", () => {
  const project = structuredClone(defaults);
  project.plans[0]!.territories.m30 = { territoryId: "m30", status: "noAttack" };
  assert.equal(parseProject(serializeProject(project), defaults).plans[0]!.territories.m30?.status, "noAttack");
});
test("hold territory status survives serialization", () => {
  const project = structuredClone(defaults);
  project.plans[0]!.territories.m30 = { territoryId: "m30", status: "hold" };
  assert.equal(parseProject(serializeProject(project), defaults).plans[0]!.territories.m30?.status, "hold");
});
test("v5 migrates plans without multi-tag assignments", () => {
  const legacy = structuredClone(defaults) as unknown as Record<string, unknown>;
  legacy.version = 5;
  delete (legacy.plans as Array<Record<string, unknown>>)[0]!.territoryTags;
  assert.deepEqual(migrateProject(legacy, defaults).plans[0]!.territoryTags, []);
});
test("alliance and refusal tags survive serialization", () => {
  const project = structuredClone(defaults);
  project.plans[0]!.territoryTags = [
    { id: "a", territoryId: "bastion-L1-001", kind: "alliance", allianceId: "ust" },
    { id: "r", territoryId: "bastion-L1-001", kind: "refusal" },
  ];
  assert.deepEqual(parseProject(serializeProject(project), defaults).plans[0]!.territoryTags, project.plans[0]!.territoryTags);
});
test("serialization round-trips", () => assert.deepEqual(parseProject(serializeProject(defaults), defaults), defaults));
test("strict validation rejects unknown nested fields", () => {
  const invalid = structuredClone(defaults) as unknown as Record<string, unknown>;
  (invalid.plans as Array<Record<string, unknown>>)[0]!.unexpected = true;
  assert.throws(() => migrateProject(invalid, defaults), /неизвестные поля/);
});
test("future versions are rejected", () =>
  assert.throws(() => migrateProject({ ...defaults, version: 99 }, defaults), /более новой версией/));
