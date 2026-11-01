import assert from "node:assert/strict";
import test from "node:test";
import { SyncEngine, summarizeProjectChanges, type SyncApi, type SyncClock } from "../src/sync-engine";
import type { CloudProject } from "../src/collaboration-api";
import type { PlannerState } from "../src/types";

const initialState = (): PlannerState => ({
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
  alliances: [{ id: "a1", name: "A", shortName: "A", color: "#112233", isPlayerAlliance: true }],
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
});
const project = (state: PlannerState, revision = 1): CloudProject => ({
  id: "project",
  name: "Team",
  mapId: "map",
  state,
  revision,
  role: "R4",
  memberCount: 2,
  updatedAt: "now",
});

class TestClock implements SyncClock {
  private id = 0;
  readonly callbacks = new Map<number, () => void>();
  setTimeout(callback: () => void): ReturnType<typeof setTimeout> {
    const id = ++this.id;
    this.callbacks.set(id, callback);
    return id as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimeout(handle: ReturnType<typeof setTimeout> | undefined): void {
    if (handle !== undefined) this.callbacks.delete(handle as unknown as number);
  }
  runAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

test("SyncEngine ignores its own SSE echo", () => {
  const state = initialState();
  const clock = new TestClock();
  let fetches = 0;
  const api: SyncApi = {
    getProject: async () => {
      fetches++;
      return project(state, 2);
    },
    saveProject: async () => project(state, 2),
  };
  const engine = new SyncEngine({
    api,
    clock,
    userId: "user",
    getState: () => state,
    applyRemote: () => {},
    saveBackup: () => {},
    onProject: () => {},
    onStatus: () => {},
    onConflict: () => {},
    onUpdate: () => {},
    notify: () => {},
  });
  engine.start(project(state), state);
  engine.receiveRevision(2, "user");
  clock.runAll();
  assert.equal(fetches, 0);
});

test("change summaries include changed territory ids and stay within 120 characters", () => {
  const base = initialState();
  const changed = structuredClone(base);
  for (const id of ["M30", "M31", "M32", "M33", "M34", "M35"]) changed.plans[0]!.territories[id] = { territoryId: id, status: "captured" };
  assert.match(summarizeProjectChanges(base, changed), /M30, M31, M32, M33, M34 \+1/);
  assert.ok(summarizeProjectChanges(base, changed).length <= 120);
});

test("SyncEngine rebases simultaneous edits to separate territories", async () => {
  let server = project(initialState());
  let saves = 0;
  let attempts = 0;
  const api: SyncApi = {
    getProject: async () => structuredClone(server),
    saveProject: async (_id, state, baseRevision) => {
      attempts++;
      if (baseRevision !== server.revision) {
        throw Object.assign(new Error("conflict"), { status: 409, details: { project: structuredClone(server) } });
      }
      saves++;
      server = project(structuredClone(state), server.revision + 1);
      return structuredClone(server);
    },
  };
  const base = structuredClone(server.state);
  const localA = structuredClone(base);
  const localB = structuredClone(base);
  let stateA = localA;
  let stateB = localB;
  const engineA = new SyncEngine({
    api,
    userId: "a",
    getState: () => stateA,
    applyRemote: (value) => {
      stateA = value;
    },
    saveBackup: () => {},
    onProject: () => {},
    onStatus: () => {},
    onConflict: () => {},
    onUpdate: () => {},
    notify: () => {},
  });
  const engineB = new SyncEngine({
    api,
    userId: "b",
    getState: () => stateB,
    applyRemote: (value) => {
      stateB = value;
    },
    saveBackup: () => {},
    onProject: () => {},
    onStatus: () => {},
    onConflict: () => {},
    onUpdate: () => {},
    notify: () => {},
  });
  engineA.start(server, base);
  engineB.start(server, base);
  stateA.plans[0]!.territories.M30 = { territoryId: "M30", status: "captured" };
  stateB.plans[0]!.territories.M31 = { territoryId: "M31", status: "hold" };
  await engineA.push("edit A");
  await engineB.push("edit B");
  assert.equal(server.state.plans[0]!.territories.M30!.status, "captured");
  assert.equal(server.state.plans[0]!.territories.M31!.status, "hold");
  assert.equal(attempts, 3);
  assert.equal(saves, 2);
});

test("SyncEngine queues one push for edits made while a request is in flight", async () => {
  const clock = new TestClock();
  let state = initialState();
  let server = project(state);
  let calls = 0;
  let finishFirst: ((value: CloudProject) => void) | undefined;
  let startedFirst: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => {
    startedFirst = resolve;
  });
  const api: SyncApi = {
    getProject: async () => server,
    saveProject: async (_id, nextState, baseRevision) => {
      calls++;
      if (calls === 1) {
        startedFirst?.();
        return new Promise<CloudProject>((resolve) => {
          finishFirst = resolve;
        });
      }
      server = project(structuredClone(nextState), baseRevision + 1);
      return server;
    },
  };
  const engine = new SyncEngine({
    api,
    clock,
    userId: "user",
    getState: () => state,
    applyRemote: (next) => {
      state = next;
    },
    saveBackup: () => {},
    onProject: (next) => {
      server = next;
    },
    onStatus: () => {},
    onConflict: () => {},
    onUpdate: () => {},
    notify: () => {},
  });
  engine.start(server, state);
  state.plans[0]!.territories.M30 = { territoryId: "M30", status: "captured" };
  const pushing = engine.push("first edit");
  await firstStarted;
  state.plans[0]!.territories.M31 = { territoryId: "M31", status: "hold" };
  engine.localChange();
  finishFirst?.(
    project(
      { ...initialState(), plans: [{ ...initialState().plans[0]!, territories: { M30: { territoryId: "M30", status: "captured" } } }] },
      2,
    ),
  );
  await pushing;
  clock.runAll();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(server.state.plans[0]!.territories.M30!.status, "captured");
  assert.equal(server.state.plans[0]!.territories.M31!.status, "hold");
});
