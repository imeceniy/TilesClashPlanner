import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const mapUrl = new URL("../data/gene-clash-map.json", import.meta.url);
const config = JSON.parse(await readFile(new URL("../data/game-config.json", import.meta.url), "utf8"));
const map = JSON.parse(await readFile(mapUrl, "utf8"));
const checkOnly = process.argv.includes("--check");
let changed = 0;

for (const territory of map.territories) {
  const group = territory.type === "lair" ? config.lairs : config.workbenches;
  const expected = group[territory.size]?.value;
  assert.equal(typeof expected, "number", `Нет награды для ${territory.type} ${territory.size}`);
  if (territory.value !== expected) {
    if (checkOnly) throw new Error(`${territory.id}: карта=${territory.value}, config=${expected}`);
    territory.value = expected;
    changed += 1;
  }
}

assert.equal(map.territories.length, 165, "Ожидалось 165 территорий");
if (!checkOnly && changed) await writeFile(mapUrl, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Game rewards verified: ${map.territories.length}/165, changed: ${changed}`);
