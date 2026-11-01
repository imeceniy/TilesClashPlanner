import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlannerServer } from "../server/server";

test("auth limiter, Origin validation, static MIME and traversal guard work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiles-security-"));
  const staticDir = join(directory, "static");
  await mkdir(staticDir);
  await writeFile(join(directory, "secret.txt"), "private");
  await writeFile(join(staticDir, "index.html"), "<html></html>");
  await writeFile(join(staticDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const { server, store } = await createPlannerServer({
    dataFile: join(directory, "database.json"),
    staticDir,
    authRateLimit: { maxRequests: 1, windowMs: 60_000 },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const register = (username: string) =>
      fetch(`${origin}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password: "long-password" }),
      });
    const first = await register("security-user");
    const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
    assert.equal((await register("second-user")).status, 429);
    const wrongOrigin = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "https://attacker.invalid" },
      body: "{}",
    });
    assert.equal(wrongOrigin.status, 403);
    const image = await fetch(`${origin}/image.png`);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    const traversal = await fetch(`${origin}/..%2fsecret.txt`);
    assert.equal(traversal.status, 404);
    store.save = async () => {
      throw new Error("private-database-path");
    };
    const previousConsoleError = console.error;
    console.error = () => {};
    let internalFailure: Response;
    try {
      internalFailure = await fetch(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: "{}",
      });
    } finally {
      console.error = previousConsoleError;
    }
    const failureBody = await internalFailure.text();
    assert.equal(internalFailure.status, 500);
    assert.equal(failureBody.includes("private-database-path"), false);
    assert.match(failureBody, /Ошибка сервера/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
