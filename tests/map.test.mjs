import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const map = JSON.parse(await readFile(new URL("../data/gene-clash-map.json", import.meta.url), "utf8"));

test("Konva map contains the complete supplied object set", () => {
  assert.equal(map.renderer, "konva");
  assert.equal(map.width, 1280);
  assert.equal(map.height, 1246);
  assert.equal(map.territories.length, 165);
  assert.equal(map.territories.filter(({ type }) => type === "lair").length, 104);
  assert.equal(map.territories.filter(({ type }) => type === "workbench").length, 61);
  assert.equal(new Set(map.territories.map(({ id }) => id)).size, 165);
});

test("critical acceptance objects are present and typed", () => {
  const m30 = map.territories.find(({ id }) => id === "lair-M30");
  const xxl = map.territories.find(({ id }) => id === "workbench-XXL01");
  assert.deepEqual(
    { name: m30.name, type: m30.type, value: m30.value, sourceId: m30.sourceId },
    { name: "M30", type: "lair", value: 375, sourceId: "M-30" },
  );
  assert.deepEqual({ name: xxl.name, type: xxl.type, value: xxl.value }, { name: "XXL01", type: "workbench", value: 2000 });
});

test("all imported positions and values are valid", () => {
  for (const territory of map.territories) {
    assert.ok(territory.x >= 0 && territory.x <= map.width, territory.id);
    assert.ok(territory.y >= 0 && territory.y <= map.height, territory.id);
    assert.ok(territory.value > 0, territory.id);
    assert.ok(["circle", "square"].includes(territory.defaultShape), territory.id);
  }
});

test("reference graph and fixed bases are present", () => {
  assert.equal(map.connections.length, 203);
  assert.equal(map.bases.length, 8);
  assert.equal(map.baseConnections.length, 24);
  assert.equal(map.connections.length + map.baseConnections.length, 227);
  assert.equal(new Set(map.bases.map(({ id }) => id)).size, 8);
  const territoryIds = new Set(map.territories.map(({ id }) => id));
  const baseIds = new Set(map.bases.map(({ id }) => id));
  for (const connection of map.connections) {
    assert.ok(territoryIds.has(connection.from), connection.from);
    assert.ok(territoryIds.has(connection.to), connection.to);
    assert.notEqual(connection.from, connection.to);
  }
  for (const connection of map.baseConnections) {
    assert.ok(baseIds.has(connection.from), connection.from);
    assert.ok(territoryIds.has(connection.to), connection.to);
  }
});
