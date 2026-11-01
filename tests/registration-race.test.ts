import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlannerServer } from "../server/server";

test("parallel registrations for the same login create exactly one account", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-register-"));
  const { server, store } = await createPlannerServer({ dataFile: join(directory, "database.json") });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const register = () =>
      fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "race-user", password: "long-password", displayName: "Race" }),
      });
    const results = await Promise.all([register(), register()]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
    assert.equal(store.data.users.filter(({ username }) => username === "race-user").length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
