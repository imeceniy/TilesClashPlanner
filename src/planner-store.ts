import type { Plan, PlannerSnapshot, PlannerState, Territory, TerritoryStatus } from "./types";

export function assignTerritoryStatus(
  plan: Plan,
  territoryId: string,
  status: TerritoryStatus,
  ownerAllianceId: string | null = null,
): void {
  const previous = plan.territories[territoryId];
  if (status === "neutral") {
    if (previous?.emphasized) {
      plan.territories[territoryId] = { ...previous, territoryId, status };
      delete plan.territories[territoryId].ownerAllianceId;
    } else delete plan.territories[territoryId];
    return;
  }
  plan.territories[territoryId] = { ...(previous ?? {}), territoryId, status };
  if (status === "enemy" && ownerAllianceId) plan.territories[territoryId].ownerAllianceId = ownerAllianceId;
  else delete plan.territories[territoryId].ownerAllianceId;
}

export function clonePlanForDay(source: Plan, planId: string, name: string, date: string, updatedAt = Date.now()): Plan {
  return { ...structuredClone(source), id: planId, name, date, updatedAt };
}

export function findTerritories(territories: Territory[], query: string, limit = 12): Territory[] {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return [];
  return territories.filter((territory) => territory.name.toUpperCase().includes(normalized)).slice(0, limit);
}

export function takeSnapshot(state: PlannerState): PlannerSnapshot {
  return structuredClone({ plans: state.plans, alliances: state.alliances, currentPlanId: state.currentPlanId });
}

export class PlannerHistory {
  readonly past: PlannerSnapshot[] = [];
  readonly future: PlannerSnapshot[] = [];
  constructor(private readonly limit = 60) {}
  push(state: PlannerState): void {
    this.past.push(takeSnapshot(state));
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }
  undo(state: PlannerState): PlannerSnapshot | null {
    const snapshot = this.past.pop();
    if (!snapshot) return null;
    this.future.push(takeSnapshot(state));
    return snapshot;
  }
  redo(state: PlannerState): PlannerSnapshot | null {
    const snapshot = this.future.pop();
    if (!snapshot) return null;
    this.past.push(takeSnapshot(state));
    return snapshot;
  }
  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
