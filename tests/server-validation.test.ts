import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlannerServer } from "../server/server";

test("project creation rejects invalid state and unknown map without changing storage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-validation-"));
  const { server, store } = await createPlannerServer({ dataFile: join(directory, "database.json") });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const registration = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "validate-user", password: "long-password" }),
    });
    const cookie = registration.headers.get("set-cookie")!.split(";")[0]!;
    const submit = (mapId: string, state: unknown) =>
      fetch(`${origin}/api/projects`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "Validation", mapId, state }),
      });
    const validMap = "gene-clash-oil-clash-season-5";
    const invalid = await submit(validMap, { version: 6, plans: [], alliances: [] });
    assert.equal(invalid.status, 400);
    const unknownMap = await submit("not-a-real-map", { version: 6, plans: [], alliances: [] });
    assert.equal(unknownMap.status, 400);
    const unknownReference = await submit(validMap, {
      version: 6,
      currentPlanId: "p1",
      plans: [
        {
          id: "p1",
          name: "Day 1",
          date: "2026-10-31",
          territories: { notOnMap: { territoryId: "notOnMap", status: "neutral" } },
          arrows: [],
          labels: [],
          markers: [],
          territoryTags: [],
          baseAssignments: {},
          updatedAt: 1,
        },
      ],
      alliances: [{ id: "a1", name: "Alliance", shortName: "A", color: "#112233", isPlayerAlliance: true }],
    });
    assert.equal(unknownReference.status, 400);
    assert.equal(store.data.projects.length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
