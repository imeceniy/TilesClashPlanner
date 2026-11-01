import type { Alliance, Plan, PlannerState } from "./types";
import { removeAllianceReferences } from "./alliances";

export interface MergeResult {
  state: PlannerState;
  conflicts: string[];
}

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

function mergeValue(base: unknown, local: unknown, remote: unknown, path: string, conflicts: string[]): unknown {
  if (same(local, remote)) return structuredClone(local);
  if (same(local, base)) return structuredClone(remote);
  if (same(remote, base)) return structuredClone(local);
  if (local === undefined && base !== undefined && remote !== undefined) {
    conflicts.push(`${path} (удаление/изменение)`);
    return structuredClone(remote);
  }
  if (remote === undefined && base !== undefined && local !== undefined) {
    conflicts.push(`${path} (изменение/удаление)`);
    return structuredClone(local);
  }
  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const merged: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const value = mergeValue(base[key], local[key], remote[key], `${path}.${key}`, conflicts);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  conflicts.push(path);
  return structuredClone(local);
}

function mergeEntities<T extends { id: string }>(base: T[], local: T[], remote: T[], path: string, conflicts: string[]): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const order = [...remote.map(({ id }) => id), ...local.map(({ id }) => id).filter((id) => !remoteById.has(id))];
  const result: T[] = [];
  for (const id of order) {
    const before = baseById.get(id);
    const ours = localById.get(id);
    const theirs = remoteById.get(id);
    if (!before) {
      if (ours && theirs) result.push(mergeValue(undefined, ours, theirs, `${path}.${id}`, conflicts) as T);
      else if (ours || theirs) result.push(structuredClone((ours ?? theirs)!));
      continue;
    }
    if (!ours && !theirs) continue;
    if (!ours) {
      if (same(theirs, before)) continue;
      conflicts.push(`${path}.${id} (удаление/изменение)`);
      result.push(structuredClone(theirs!));
      continue;
    }
    if (!theirs) {
      if (same(ours, before)) continue;
      conflicts.push(`${path}.${id} (изменение/удаление)`);
      result.push(structuredClone(ours));
      continue;
    }
    result.push(mergeValue(before, ours, theirs, `${path}.${id}`, conflicts) as T);
  }
  return result;
}

function mergeKeyedMap<T>(base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>, path: string, conflicts: string[]) {
  const merged: Record<string, T> = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const before = base[key];
    const ours = local[key];
    const theirs = remote[key];
    if (ours === undefined && theirs === undefined) continue;
    if (before === undefined) {
      merged[key] = structuredClone((ours ?? theirs)!);
      continue;
    }
    if (ours === undefined) {
      if (same(theirs, before)) continue;
      conflicts.push(`${path}.${key} (удаление/изменение)`);
      merged[key] = structuredClone(theirs!);
      continue;
    }
    if (theirs === undefined) {
      if (same(ours, before)) continue;
      conflicts.push(`${path}.${key} (изменение/удаление)`);
      merged[key] = structuredClone(ours);
      continue;
    }
    merged[key] = mergeValue(before, ours, theirs, `${path}.${key}`, conflicts) as T;
  }
  return merged;
}

function mergePlan(base: Plan, local: Plan, remote: Plan, conflicts: string[]): Plan {
  const withoutCollections = (
    plan: Plan,
  ): Omit<Plan, "territories" | "baseAssignments" | "arrows" | "labels" | "markers" | "territoryTags"> => {
    const meta = { ...plan } as Partial<Plan>;
    delete meta.territories;
    delete meta.baseAssignments;
    delete meta.arrows;
    delete meta.labels;
    delete meta.markers;
    delete meta.territoryTags;
    return meta as Omit<Plan, "territories" | "baseAssignments" | "arrows" | "labels" | "markers" | "territoryTags">;
  };
  const baseMeta = withoutCollections(base);
  const localMeta = withoutCollections(local);
  const remoteMeta = withoutCollections(remote);
  const merged = mergeValue(baseMeta, localMeta, remoteMeta, `plans.${base.id}`, conflicts) as Plan;
  merged.territories = mergeKeyedMap(base.territories, local.territories, remote.territories, `plans.${base.id}.territories`, conflicts);
  merged.baseAssignments = mergeKeyedMap(
    base.baseAssignments,
    local.baseAssignments,
    remote.baseAssignments,
    `plans.${base.id}.baseAssignments`,
    conflicts,
  );
  merged.arrows = mergeEntities(base.arrows, local.arrows, remote.arrows, `plans.${base.id}.arrows`, conflicts);
  merged.labels = mergeEntities(base.labels, local.labels, remote.labels, `plans.${base.id}.labels`, conflicts);
  merged.markers = mergeEntities(base.markers, local.markers, remote.markers, `plans.${base.id}.markers`, conflicts);
  merged.territoryTags = mergeEntities(
    base.territoryTags,
    local.territoryTags,
    remote.territoryTags,
    `plans.${base.id}.territoryTags`,
    conflicts,
  );
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function mergeProjectStates(base: PlannerState, local: PlannerState, remote: PlannerState): MergeResult {
  const conflicts: string[] = [];
  const basePlans = new Map(base.plans.map((plan) => [plan.id, plan]));
  const localPlans = new Map(local.plans.map((plan) => [plan.id, plan]));
  const remotePlans = new Map(remote.plans.map((plan) => [plan.id, plan]));
  const planOrder = [...remote.plans.map(({ id }) => id), ...local.plans.map(({ id }) => id).filter((id) => !remotePlans.has(id))];
  const plans: Plan[] = [];
  for (const id of planOrder) {
    const before = basePlans.get(id);
    const ours = localPlans.get(id);
    const theirs = remotePlans.get(id);
    if (!before) {
      if (ours && theirs) plans.push(mergeValue(undefined, ours, theirs, `plans.${id}`, conflicts) as Plan);
      else if (ours || theirs) plans.push(structuredClone((ours ?? theirs)!));
      continue;
    }
    if (!ours && !theirs) continue;
    if (!ours) {
      if (same(theirs, before)) continue;
      conflicts.push(`plans.${id} (удаление/изменение)`);
      plans.push(structuredClone(theirs!));
      continue;
    }
    if (!theirs) {
      if (same(ours, before)) continue;
      conflicts.push(`plans.${id} (изменение/удаление)`);
      plans.push(structuredClone(ours));
      continue;
    }
    plans.push(mergePlan(before, ours, theirs, conflicts));
  }
  const alliances = mergeEntities<Alliance>(base.alliances, local.alliances, remote.alliances, "alliances", conflicts);
  const allianceIds = new Set(alliances.map(({ id }) => id));
  const removedAllianceIds = new Set(
    [...base.alliances, ...local.alliances, ...remote.alliances].map(({ id }) => id).filter((id) => !allianceIds.has(id)),
  );
  for (const plan of plans) {
    for (const allianceId of removedAllianceIds) {
      const removed = removeAllianceReferences(plan, allianceId);
      const count = removed.bases + removed.territories + removed.markers + removed.tags;
      if (count) conflicts.push(`alliances.${allianceId}: удалено ссылок ${count}`);
    }
    for (const [baseId, allianceId] of Object.entries(plan.baseAssignments))
      if (!allianceIds.has(allianceId)) delete plan.baseAssignments[baseId];
    for (const [territoryId, territory] of Object.entries(plan.territories))
      if (territory.ownerAllianceId && !allianceIds.has(territory.ownerAllianceId)) delete plan.territories[territoryId];
    plan.territoryTags = plan.territoryTags.filter((tag) => !tag.allianceId || allianceIds.has(tag.allianceId));
  }
  const localPlanId = plans.some(({ id }) => id === local.currentPlanId) ? local.currentPlanId : remote.currentPlanId;
  return {
    state: {
      version: local.version,
      currentPlanId: plans.some(({ id }) => id === localPlanId) ? localPlanId : plans[0]!.id,
      plans,
      alliances,
      settings: structuredClone(local.settings),
    },
    conflicts,
  };
}
