import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlannerServer } from "../server/server";
import type { PlannerState } from "../src/types";

const state: PlannerState = {
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
  alliances: [{ id: "a1", name: "Alliance", shortName: "A", color: "#112233", isPlayerAlliance: true }],
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

test("history coalesces recent edits but keeps pinned revisions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-history-"));
  const { server, store } = await createPlannerServer({ dataFile: join(directory, "database.json") });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, cookie: string, options: RequestInit = {}) => {
    const response = await fetch(`${origin}${path}`, {
      ...options,
      headers: { "content-type": "application/json", cookie, ...options.headers },
    });
    return { response, payload: await response.json() };
  };
  try {
    const registration = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "history-user", password: "long-password" }),
    });
    const cookie = registration.headers.get("set-cookie")!.split(";")[0]!;
    const created = await call("/api/projects", cookie, {
      method: "POST",
      body: JSON.stringify({ name: "History", mapId: "gene-clash-oil-clash-season-5", state }),
    });
    assert.equal(created.response.status, 201);
    const id = created.payload.project.id as string;
    const pinned = await call(`/api/projects/${id}/history/1/pin`, cookie, { method: "POST", body: JSON.stringify({ label: "Итог дня" }) });
    assert.equal(pinned.response.status, 200);
    for (const baseRevision of [1, 2]) {
      const saved = await call(`/api/projects/${id}/state`, cookie, {
        method: "PUT",
        body: JSON.stringify({ state, baseRevision, summary: "Автосохранение" }),
      });
      assert.equal(saved.response.status, 200);
    }
    const history = await call(`/api/projects/${id}/history`, cookie);
    assert.deepEqual(
      history.payload.revisions.map((item: { revision: number }) => item.revision),
      [3, 1],
    );
    assert.equal(history.payload.revisions[1].pinned, true);
    assert.equal(history.payload.revisions[1].label, "Итог дня");

    const otherAccount = await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "history-other", password: "long-password" }),
    });
    const otherUser = (await otherAccount.json()).user as { id: string };
    const timestamp = new Date().toISOString();
    store.data.revisions = Array.from({ length: 103 }, (_, index) => ({
      id: `synthetic-${index + 1}`,
      projectId: id,
      revision: index + 1,
      state: structuredClone(state),
      authorId: otherUser.id,
      summary: `Synthetic ${index + 1}`,
      createdAt: timestamp,
      ...(index === 0 ? { pinned: true, label: "Итог дня" } : {}),
    }));
    store.data.projects.find((item) => item.id === id)!.revision = 103;
    const trimmed = await call(`/api/projects/${id}/state`, cookie, {
      method: "PUT",
      body: JSON.stringify({ state, baseRevision: 103, summary: "New" }),
    });
    assert.equal(trimmed.response.status, 200);
    const afterTrim = await call(`/api/projects/${id}/history`, cookie);
    assert.equal(afterTrim.payload.revisions.length, 100);
    assert.equal(
      afterTrim.payload.revisions.some((item: { revision: number; pinned?: boolean }) => item.revision === 1 && item.pinned),
      true,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
