import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Database } from "./types";

const emptyDatabase = (): Database => ({ users: [], sessions: [], projects: [], members: [], revisions: [], shares: [] });

export class JsonStore {
  data: Database = emptyDatabase();
  private writeQueue: Promise<void> = Promise.resolve();
  constructor(readonly filename: string) {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.filename, "utf8")) as Database;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.save();
    }
  }

  save(): Promise<void> {
    const snapshot = JSON.stringify(this.data);
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${process.pid}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, this.filename);
    });
    this.writeQueue = write.catch(() => undefined);
    return write;
  }
}
