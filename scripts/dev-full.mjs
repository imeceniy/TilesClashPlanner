import { spawn } from "node:child_process";

const children = [spawn("npm", ["run", "dev:server"], { stdio: "inherit" }), spawn("npm", ["run", "dev"], { stdio: "inherit" })];
const stop = () => children.forEach((child) => child.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(children.map((child) => new Promise((resolve) => child.on("exit", resolve))));
stop();
