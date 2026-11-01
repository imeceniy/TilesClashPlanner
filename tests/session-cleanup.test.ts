import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlannerServer } from "../server/server";

test("expired sessions are removed when the server starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-session-cleanup-"));
  const dataFile = join(directory, "database.json");
  await writeFile(
    dataFile,
    JSON.stringify({
      users: [],
      sessions: [{ tokenHash: "old-hash", userId: "missing-user", expiresAt: "2000-01-01T00:00:00.000Z" }],
      projects: [],
      members: [],
      revisions: [],
      shares: [],
    }),
  );
  const { server, store } = await createPlannerServer({ dataFile });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    assert.deepEqual(store.data.sessions, []);
    assert.deepEqual(JSON.parse(await readFile(dataFile, "utf8")).sessions, []);
    const me = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, { headers: { cookie: "planner_session=expired-token" } });
    assert.equal((await me.json()).user, null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
