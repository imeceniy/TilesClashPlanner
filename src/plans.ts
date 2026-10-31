import type { Plan, PlannerState } from "./types";

export function blankPlan(id: string, name: string, date: string, updatedAt = Date.now()): Plan {
  return { id, name, date, territories: {}, arrows: [], labels: [], markers: [], territoryTags: [], baseAssignments: {}, updatedAt };
}
export function currentPlan(state: PlannerState): Plan {
  const plan = state.plans.find(({ id }) => id === state.currentPlanId) ?? state.plans[0];
  if (!plan) throw new Error("Нет доступных планов");
  return plan;
}
export function resetPlan(plan: Plan): void {
  plan.territories = {};
  plan.arrows = [];
  plan.labels = [];
  plan.markers = [];
  plan.territoryTags = [];
  plan.baseAssignments = {};
  plan.updatedAt = Date.now();
}
