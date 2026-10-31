import type { Alliance, MapBase, Plan } from "./types";

export function currentAlliance(alliances: Alliance[], activeId: string): Alliance {
  const alliance = alliances.find(({ id }) => id === activeId) ?? alliances[0];
  if (!alliance) throw new Error("Нет доступных союзов");
  return alliance;
}
export function currentEnemyAlliance(alliances: Alliance[], activeId: string): Alliance | undefined {
  const selected = currentAlliance(alliances, activeId);
  return selected && !selected.isPlayerAlliance ? selected : alliances.find(({ isPlayerAlliance }) => !isPlayerAlliance);
}
export function assignedBaseForAlliance(plan: Plan, bases: MapBase[], allianceId: string): MapBase | undefined {
  const entry = Object.entries(plan.baseAssignments).find(([, id]) => id === allianceId);
  return entry ? bases.find(({ id }) => id === entry[0]) : undefined;
}
export function setBaseAssignment(plan: Plan, baseId: string, allianceId: string | null): void {
  if (allianceId) {
    for (const [assignedBaseId, assignedAllianceId] of Object.entries(plan.baseAssignments))
      if (assignedAllianceId === allianceId) delete plan.baseAssignments[assignedBaseId];
    plan.baseAssignments[baseId] = allianceId;
  } else delete plan.baseAssignments[baseId];
}

export interface RemovedAllianceReferences {
  bases: number;
  territories: number;
  markers: number;
  tags: number;
}

export function removeAllianceReferences(plan: Plan, allianceId: string): RemovedAllianceReferences {
  let bases = 0;
  let territories = 0;

  for (const [baseId, assignedAllianceId] of Object.entries(plan.baseAssignments)) {
    if (assignedAllianceId !== allianceId) continue;
    delete plan.baseAssignments[baseId];
    bases += 1;
  }

  for (const [territoryId, territory] of Object.entries(plan.territories)) {
    if (territory.ownerAllianceId !== allianceId) continue;
    delete plan.territories[territoryId];
    territories += 1;
  }

  const markerCount = plan.markers.length;
  plan.markers = plan.markers.filter((marker) => marker.allianceId !== allianceId);
  const tagCount = plan.territoryTags.length;
  plan.territoryTags = plan.territoryTags.filter((tag) => tag.allianceId !== allianceId);

  return { bases, territories, markers: markerCount - plan.markers.length, tags: tagCount - plan.territoryTags.length };
}
