import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JsonStore } from "../server/store";

test("a failed JsonStore write does not poison later saves", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-store-"));
  const filename = join(directory, "database.json");
  try {
    await mkdir(filename);
    const store = new JsonStore(filename);
    await assert.rejects(store.save());
    await rm(filename, { recursive: true });
    store.data.users.push({
      id: "u1",
      username: "one",
      displayName: "One",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAt: "now",
    });
    await store.save();
    assert.equal(JSON.parse(await readFile(filename, "utf8")).users[0].id, "u1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
