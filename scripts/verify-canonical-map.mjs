import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("data/map-manifest.json", root), "utf8"));
const bytes = await readFile(new URL(`data/${manifest.canonical}`, root));
const map = JSON.parse(bytes.toString("utf8"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256, "Canonical map checksum changed");
assert.equal(map.territories.length, manifest.territories);
assert.equal(map.connections.length, manifest.connections);
assert.equal(map.bases.length, manifest.bases);
assert.equal(map.baseConnections.length, manifest.baseConnections);
console.log(`Canonical map verified: ${manifest.sha256}`);
