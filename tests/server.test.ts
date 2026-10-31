import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlannerServer } from "../server/server";
import type { PlannerState } from "../src/types";

const state: PlannerState = {
  version: 5,
  currentPlanId: "p1",
  plans: [
    {
      id: "p1",
      name: "Day 1",
      date: "2026-08-18",
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

test("collaboration API enforces roles, revisions, history, SSE and public shares", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-clash-server-"));
  const { server } = await createPlannerServer({ dataFile: join(directory, "database.json") });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const call = async (path: string, options: RequestInit = {}, cookie = "") => {
    const response = await fetch(`${origin}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...options.headers },
    });
    const payload = await response.json();
    return { response, payload };
  };
  const register = async (username: string) => {
    const result = await call("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, displayName: username.toUpperCase(), password: "password-123" }),
    });
    assert.equal(result.response.status, 201);
    return { cookie: result.response.headers.get("set-cookie")!.split(";")[0]!, user: result.payload.user as { id: string } };
  };

  try {
    const owner = await register("owner");
    const editor = await register("editor");
    const created = await call(
      "/api/projects",
      { method: "POST", body: JSON.stringify({ name: "War room", mapId: "gene-clash", state }) },
      owner.cookie,
    );
    assert.equal(created.response.status, 201);
    const projectId = created.payload.project.id as string;

    const added = await call(
      `/api/projects/${projectId}/members`,
      { method: "POST", body: JSON.stringify({ username: "editor", role: "R4" }) },
      owner.cookie,
    );
    assert.equal(added.response.status, 200);
    const lastAdmin = await call(
      `/api/projects/${projectId}/members`,
      { method: "POST", body: JSON.stringify({ username: "owner", role: "R4" }) },
      owner.cookie,
    );
    assert.equal(lastAdmin.response.status, 400);
    const forbidden = await call(
      `/api/projects/${projectId}/members`,
      { method: "POST", body: JSON.stringify({ username: "owner", role: "R5" }) },
      editor.cookie,
    );
    assert.equal(forbidden.response.status, 403);

    const eventResponse = await fetch(`${origin}/api/projects/${projectId}/events`, { headers: { cookie: editor.cookie } });
    assert.equal(eventResponse.status, 200);
    const reader = eventResponse.body!.getReader();
    const firstEvent = new TextDecoder().decode((await reader.read()).value);
    assert.match(firstEvent, /event: ready/);

    const changedState = structuredClone(state);
    changedState.plans[0]!.name = "Day 2";
    const saved = await call(
      `/api/projects/${projectId}/state`,
      { method: "PUT", body: JSON.stringify({ state: changedState, baseRevision: 1, summary: "Цели обновлены" }) },
      editor.cookie,
    );
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.project.revision, 2);
    const revisionEvent = new TextDecoder().decode((await reader.read()).value);
    assert.match(revisionEvent, /event: revision/);
    await reader.cancel();

    const conflict = await call(
      `/api/projects/${projectId}/state`,
      { method: "PUT", body: JSON.stringify({ state, baseRevision: 1 }) },
      owner.cookie,
    );
    assert.equal(conflict.response.status, 409);
    const history = await call(`/api/projects/${projectId}/history`, {}, owner.cookie);
    assert.deepEqual(
      history.payload.revisions.map((item: { revision: number }) => item.revision),
      [2, 1],
    );

    const shared = await call(`/api/projects/${projectId}/share`, { method: "POST", body: "{}" }, editor.cookie);
    assert.equal(shared.response.status, 200);
    const publicView = await call(`/api/public/${shared.payload.shareId}`);
    assert.equal(publicView.response.status, 200);
    assert.equal(publicView.payload.project.state.plans[0].name, "Day 2");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
