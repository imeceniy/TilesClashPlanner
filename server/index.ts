import { resolve } from "node:path";
import { createPlannerServer } from "./server";

const port = Number(process.env.PLANNER_PORT ?? 8787);
const dataFile = resolve(process.env.PLANNER_DATA_FILE ?? "server-data/database.json");
const staticDir = process.env.PLANNER_STATIC_DIR ? resolve(process.env.PLANNER_STATIC_DIR) : undefined;
const { server } = await createPlannerServer({ dataFile, staticDir, sessionSecure: process.env.NODE_ENV === "production" });
server.listen(port, "127.0.0.1", () => console.log(`Tiles Clash collaboration API: http://127.0.0.1:${port}`));
