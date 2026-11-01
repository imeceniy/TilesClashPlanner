import { mergeProjectStates } from "./merge";
import type { CloudProject } from "./collaboration-api";
import type { PlannerState } from "./types";

export type SyncStatus = "idle" | "dirty" | "pushing" | "conflict" | "offline" | "readonly";
export function summarizeProjectChanges(base: PlannerState | null, current: PlannerState): string {
  if (!base) return "Изменение плана";
  const before = new Map(base.plans.map((plan) => [plan.id, plan]));
  const territoryChanges: string[] = [];
  let arrowsAdded = 0;
  for (const plan of current.plans) {
    const previous = before.get(plan.id);
    if (!previous) continue;
    for (const [id, territory] of Object.entries(plan.territories))
      if (JSON.stringify(previous.territories[id]) !== JSON.stringify(territory)) territoryChanges.push(id);
    arrowsAdded += Math.max(0, plan.arrows.length - previous.arrows.length);
  }
  const parts: string[] = [];
  if (territoryChanges.length)
    parts.push(
      `Изменено территорий: ${territoryChanges.slice(0, 5).join(", ")}${territoryChanges.length > 5 ? ` +${territoryChanges.length - 5}` : ""}`,
    );
  if (arrowsAdded) parts.push(`+${arrowsAdded} стрелок`);
  if (current.plans.length !== base.plans.length) parts.push(`планов: ${base.plans.length} → ${current.plans.length}`);
  return (parts.join("; ") || "Изменение плана").slice(0, 120);
}
export interface SyncApi {
  getProject(id: string): Promise<CloudProject>;
  saveProject(id: string, state: PlannerState, revision: number, summary: string): Promise<CloudProject>;
}
export interface SyncClock {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout> | undefined): void;
}
export interface SyncEngineOptions {
  api: SyncApi;
  clock?: SyncClock;
  getState(): PlannerState;
  applyRemote(state: PlannerState, mapId: string): void | Promise<void>;
  saveBackup(state: PlannerState): void;
  onProject(project: CloudProject): void;
  onStatus(status: SyncStatus): void;
  onConflict(remote: CloudProject | null): void;
  onRemoteApplied?(project: CloudProject): void | Promise<void>;
  onUpdate(): void | Promise<void>;
  notify(message: string): void;
  userId: string;
  summarize?(base: PlannerState | null, current: PlannerState): string;
}

const realClock: SyncClock = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class SyncEngine {
  private project: CloudProject | null = null;
  private baseState: PlannerState | null = null;
  private unresolved: CloudProject | null = null;
  private dirty = false;
  private localVersion = 0;
  private inFlight = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private pullTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 500;
  private ownRevision = 0;
  private role: CloudProject["role"] | null = null;
  private readonly clock: SyncClock;

  constructor(private readonly options: SyncEngineOptions) {
    this.clock = options.clock ?? realClock;
  }
  get conflict(): CloudProject | null {
    return this.unresolved;
  }
  start(project: CloudProject, baseState: PlannerState): void {
    this.project = project;
    this.baseState = structuredClone(baseState);
    this.role = project.role;
    this.dirty = false;
    this.localVersion = 0;
    this.ownRevision = 0;
    this.unresolved = null;
    this.options.onStatus(project.role === "MEMBER" ? "readonly" : "idle");
  }
  stop(): void {
    this.clock.clearTimeout(this.saveTimer);
    this.clock.clearTimeout(this.pullTimer);
    this.clock.clearTimeout(this.retryTimer);
    this.project = null;
    this.baseState = null;
    this.dirty = false;
    this.unresolved = null;
    this.options.onStatus("idle");
  }
  setRole(role: CloudProject["role"] | null): void {
    this.role = role;
    if (role === "MEMBER") {
      this.dirty = false;
      this.clock.clearTimeout(this.saveTimer);
      this.options.onStatus("readonly");
    } else if (this.dirty) this.schedulePush();
  }
  localChange(): void {
    if (!this.project || !this.role || this.role === "MEMBER") return;
    this.dirty = true;
    this.localVersion++;
    this.options.onStatus("dirty");
    this.schedulePush();
  }
  private schedulePush(delay = 900): void {
    this.clock.clearTimeout(this.saveTimer);
    this.saveTimer = this.clock.setTimeout(() => {
      const summary = this.options.summarize?.(this.baseState, this.options.getState()) ?? "Автосохранение";
      void this.push(summary);
    }, delay);
  }
  receiveRevision(revision: number, authorId?: string): void {
    if (!this.project || authorId === this.options.userId) {
      if (authorId === this.options.userId) this.ownRevision = Math.max(this.ownRevision, revision);
      return;
    }
    if (revision <= Math.max(this.project.revision, this.ownRevision)) return;
    this.clock.clearTimeout(this.pullTimer);
    this.pullTimer = this.clock.setTimeout(() => void this.pullRemote(revision), 250);
  }
  reconnect(): void {
    if (this.dirty) void this.push("Автосохранение");
    else this.options.onStatus(this.role === "MEMBER" ? "readonly" : "idle");
  }
  setOffline(): void {
    this.options.onStatus("offline");
  }
  async keepLocal(): Promise<void> {
    if (!this.unresolved) return;
    this.project = this.unresolved;
    this.options.onProject(this.project);
    this.baseState = this.withLocalSettings(this.unresolved.state, this.options.getState());
    this.unresolved = null;
    this.options.onConflict(null);
    this.dirty = true;
    await this.push("Слияние изменений");
  }
  async takeRemote(): Promise<void> {
    if (!this.unresolved) return;
    const local = this.options.getState();
    this.options.saveBackup(local);
    this.project = this.unresolved;
    this.options.onProject(this.project);
    this.unresolved = null;
    this.options.onConflict(null);
    await this.options.applyRemote(this.project.state, this.project.mapId);
    this.baseState = this.withLocalSettings(this.project.state, this.options.getState());
    this.dirty = false;
    this.options.onStatus("idle");
    await this.options.onUpdate();
  }
  private withLocalSettings(remote: PlannerState, local: PlannerState): PlannerState {
    return { ...structuredClone(remote), settings: structuredClone(local.settings) };
  }
  private async rebase(remote: CloudProject): Promise<void> {
    const local = this.options.getState();
    const remoteState = this.withLocalSettings(remote.state, local);
    const merged = mergeProjectStates(this.baseState ?? local, local, remoteState);
    this.project = remote;
    this.options.onProject(remote);
    this.baseState = remoteState;
    await this.options.applyRemote(merged.state, remote.mapId);
    this.dirty = true;
    if (merged.conflicts.length) this.options.notify(`Слияние: ${merged.conflicts.length} конфликтов; сохранены ваши значения`);
  }
  private async pullRemote(revision: number): Promise<void> {
    if (!this.project) return;
    try {
      const remote = await this.options.api.getProject(this.project.id);
      if (remote.revision <= this.project.revision || remote.revision < revision) return;
      if (this.dirty) {
        await this.rebase(remote);
        await this.push("Слияние изменений");
        return;
      }
      this.project = remote;
      this.options.onProject(remote);
      await this.options.applyRemote(remote.state, remote.mapId);
      this.baseState = this.withLocalSettings(remote.state, this.options.getState());
      this.options.onStatus("idle");
      await this.options.onRemoteApplied?.(remote);
      await this.options.onUpdate();
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        this.stop();
        this.options.notify("Нет доступа к общему проекту. Вы возвращены к локальному плану.");
      } else this.setOffline();
    }
  }
  async push(summary: string): Promise<void> {
    if (!this.project || !this.role || this.role === "MEMBER" || this.inFlight) return;
    this.clock.clearTimeout(this.saveTimer);
    this.inFlight = true;
    let sentVersion = this.localVersion;
    this.options.onStatus("pushing");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!this.project) return;
        sentVersion = this.localVersion;
        const sentState = this.options.getState();
        try {
          const saved = await this.options.api.saveProject(this.project.id, sentState, this.project.revision, summary);
          this.project = saved;
          this.options.onProject(saved);
          this.ownRevision = Math.max(this.ownRevision, saved.revision);
          this.baseState = structuredClone(sentState);
          this.retryDelay = 500;
          this.dirty = this.localVersion !== sentVersion;
          this.unresolved = null;
          this.options.onConflict(null);
          this.options.onStatus(this.dirty ? "dirty" : "idle");
          await this.options.onUpdate();
          return;
        } catch (error) {
          if ((error as Error & { status?: number }).status !== 409) throw error;
          this.options.onStatus("conflict");
          const details = (error as Error & { details?: { project?: CloudProject } }).details;
          const remote = details?.project ?? (await this.options.api.getProject(this.project.id));
          await this.rebase(remote);
          if (attempt === 2) {
            this.unresolved = remote;
            this.options.onConflict(remote);
            this.options.notify("Не удалось автоматически завершить слияние. Выберите версию в панели проекта.");
            await this.options.onUpdate();
            return;
          }
          summary = "Слияние изменений";
        }
      }
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        this.stop();
        this.options.notify("Нет прав на сохранение общего проекта. Вы возвращены к локальному плану.");
      } else {
        this.setOffline();
        this.clock.clearTimeout(this.retryTimer);
        this.retryTimer = this.clock.setTimeout(() => {
          if (this.dirty) void this.push(summary);
        }, this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
      }
    } finally {
      this.inFlight = false;
      if (this.dirty && this.localVersion !== sentVersion) this.schedulePush();
    }
  }
}
