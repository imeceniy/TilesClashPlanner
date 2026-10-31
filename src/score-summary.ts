import type { MapData, Plan } from "./types";

export interface ScoreSummary {
  capturedPoints: number;
  capturedCount: number;
  plannedPoints: number;
  plannedCount: number;
  theoreticalPoints: number;
  theoreticalCount: number;
  capturedCopperPerHour: number;
  plannedCopperPerHour: number;
  theoreticalCopperPerHour: number;
}

export function calculateScoreSummary(map: MapData, plan: Plan): ScoreSummary {
  let capturedPoints = 0;
  let capturedCount = 0;
  let plannedPoints = 0;
  let plannedCount = 0;
  let capturedCopperPerHour = 0;
  let plannedCopperPerHour = 0;
  for (const territory of map.territories) {
    const status = plan.territories[territory.id]?.status ?? "neutral";
    if (status === "captured" || status === "hold") {
      capturedPoints += territory.value;
      capturedCount += 1;
      capturedCopperPerHour += territory.copperPerHour ?? 0;
    } else if (status === "priority" || status === "noAttack") {
      plannedPoints += territory.value;
      plannedCount += 1;
      plannedCopperPerHour += territory.copperPerHour ?? 0;
    }
  }
  return {
    capturedPoints,
    capturedCount,
    plannedPoints,
    plannedCount,
    theoreticalPoints: capturedPoints + plannedPoints,
    theoreticalCount: capturedCount + plannedCount,
    capturedCopperPerHour,
    plannedCopperPerHour,
    theoreticalCopperPerHour: capturedCopperPerHour + plannedCopperPerHour,
  };
}
