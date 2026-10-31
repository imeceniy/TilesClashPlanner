import type {
  Alliance,
  GameConfig,
  MapData,
  Plan,
  PlanArrow,
  RouteAlternative,
  RouteResult,
  StatusThemes,
  TargetRecommendation,
  Territory,
  TerritoryState,
} from "./types";

export const STATUS: StatusThemes = {
  neutral: { label: "Нейтрально", color: "#414b44", stroke: "#78847b" },
  captured: { label: "Захвачено", color: "#159957", stroke: "#45ec8e" },
  hold: { label: "Удержать", color: "#d9a4b1", stroke: "#f5d3dc" },
  priority: { label: "Главная цель", color: "#d53c47", stroke: "#ff7379" },
  secondary: { label: "Не бьём", color: "#454b48", stroke: "#929a96" },
  noAttack: { label: "1 удар", color: "#f28c28", stroke: "#ffd0a1" },
  enemy: { label: "Противник", color: "#7456c6", stroke: "#ab8eff" },
  ignore: { label: "Не учитывать", color: "#252c27", stroke: "#4a544d" },
};

export function territoryTheme(item: TerritoryState, alliances: Alliance[]) {
  if (item.status === "captured") {
    const alliance = alliances.find(({ isPlayerAlliance }) => isPlayerAlliance);
    if (alliance) return { ...STATUS.captured, color: alliance.color, stroke: "#ffffff" };
  }
  if (item.status === "enemy" && item.ownerAllianceId) {
    const alliance = alliances.find(({ id }) => id === item.ownerAllianceId);
    if (alliance) return { ...STATUS.enemy, color: alliance.color, stroke: "#ffffff" };
  }
  return STATUS[item.status] ?? STATUS.neutral;
}

interface GraphEdge {
  from: string;
  to: string;
}

const edgeKey = (from: string, to: string): string => [from, to].sort().join("|");
const adjacencyCache = new WeakMap<MapData, Map<string, string[]>>();
const territoryCache = new WeakMap<MapData, Map<string, Territory>>();

function adjacencyFor(map: MapData): Map<string, string[]> {
  const cached = adjacencyCache.get(map);
  if (cached) return cached;
  const adjacency = new Map<string, string[]>();
  const add = ({ from, to }: GraphEdge): void => {
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
    adjacency.set(to, [...(adjacency.get(to) ?? []), from]);
  };
  [...map.connections, ...map.baseConnections].forEach(add);
  adjacencyCache.set(map, adjacency);
  return adjacency;
}

function territoriesFor(map: MapData): Map<string, Territory> {
  const cached = territoryCache.get(map);
  if (cached) return cached;
  const territories = new Map(map.territories.map((territory) => [territory.id, territory]));
  territoryCache.set(map, territories);
  return territories;
}

function stateFor(plan: Plan | undefined, territoryId: string): TerritoryState {
  return plan?.territories[territoryId] ?? { territoryId, status: "neutral" };
}

function entryCost(territory: Territory, plan: Plan | undefined): number {
  const status = stateFor(plan, territory.id).status;
  return status === "captured" || status === "hold"
    ? 0.08
    : status === "enemy"
      ? 2.5
      : status === "priority"
        ? 0.75
        : status === "secondary"
          ? 0.9
          : 1;
}

function describePath(path: string[], map: MapData, plan?: Plan): RouteAlternative {
  const byId = territoriesFor(map);
  let score = 0;
  let uncapturedCount = 0;
  let enemyCount = 0;
  for (const nodeId of path) {
    const territory = byId.get(nodeId);
    if (!territory) continue;
    const status = stateFor(plan, nodeId).status;
    score += entryCost(territory, plan);
    if (status !== "captured") {
      uncapturedCount += 1;
      if (status === "enemy") enemyCount += 1;
    }
  }
  return { path, score, uncapturedCount, enemyCount };
}

function shortestWeightedPath(
  map: MapData,
  fromBaseId: string,
  targetTerritoryId: string,
  plan?: Plan,
  bannedEdges = new Set<string>(),
): string[] {
  const adjacency = adjacencyFor(map);
  const territories = territoriesFor(map);
  const blocked = blockedTerritories(plan);
  const distances = new Map<string, number>([[fromBaseId, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set<string>([fromBaseId]);
  while (pending.size) {
    let current = "";
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const nodeId of pending) {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = nodeId;
        currentDistance = distance;
      }
    }
    pending.delete(current);
    if (current === targetTerritoryId) break;
    for (const next of adjacency.get(current) ?? []) {
      if (blocked.has(next) || bannedEdges.has(edgeKey(current, next))) continue;
      const territory = territories.get(next);
      const candidate = currentDistance + (territory ? entryCost(territory, plan) : 0);
      if (candidate >= (distances.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(next, candidate);
      previous.set(next, current);
      pending.add(next);
    }
  }
  if (!distances.has(targetTerritoryId)) return [];
  const path = [targetTerritoryId];
  while (path[0] !== fromBaseId) {
    const parent = previous.get(path[0]!);
    if (!parent) return [];
    path.unshift(parent);
  }
  return path;
}

function unreachableTerritories(map: MapData, fromBaseId: string, plan?: Plan): string[] {
  const blocked = blockedTerritories(plan);
  const adjacency = adjacencyFor(map);
  const reached = new Set<string>([fromBaseId]);
  const queue = [fromBaseId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (reached.has(next) || blocked.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return map.territories.filter(({ id }) => !reached.has(id)).map(({ id }) => id);
}

export function findStrategicRoute(
  map: MapData,
  fromBaseId: string,
  targetTerritoryId: string,
  plan: Plan,
  _config: GameConfig,
  alternativeLimit = 3,
  includeAvailability = true,
): RouteResult {
  const nodeIds = new Set([...map.bases.map(({ id }) => id), ...map.territories.map(({ id }) => id)]);
  if (!nodeIds.has(fromBaseId)) return { path: [], reachable: false, reason: "Стартовая база не найдена" };
  if (!nodeIds.has(targetTerritoryId)) return { path: [], reachable: false, reason: "Цель не найдена" };
  const unavailableTerritoryIds = includeAvailability ? unreachableTerritories(map, fromBaseId, plan) : [];
  if (blockedTerritories(plan).has(targetTerritoryId)) {
    const status = stateFor(plan, targetTerritoryId).status;
    return {
      path: [],
      reachable: false,
      reason: status === "secondary" ? "Цель отмечена как «Не бьём»" : "Цель отмечена как «Не учитывать»",
      unavailableTerritoryIds,
    };
  }
  const primary = shortestWeightedPath(map, fromBaseId, targetTerritoryId, plan);
  if (!primary.length) return { path: [], reachable: false, reason: "Доступный путь не найден", unavailableTerritoryIds };
  const candidates = new Map<string, RouteAlternative>();
  const addCandidate = (path: string[]): void => {
    if (path.length) candidates.set(path.join(">"), describePath(path, map, plan));
  };
  addCandidate(primary);
  if (alternativeLimit > 1)
    for (let index = 0; index < primary.length - 1; index += 1) {
      const alternate = shortestWeightedPath(
        map,
        fromBaseId,
        targetTerritoryId,
        plan,
        new Set([edgeKey(primary[index]!, primary[index + 1]!)]),
      );
      addCandidate(alternate);
    }
  const alternatives = [...candidates.values()]
    .sort((a, b) => a.score - b.score || a.uncapturedCount - b.uncapturedCount || a.path.length - b.path.length)
    .slice(0, alternativeLimit);
  const best = alternatives[0]!;
  const preliminaryTerritoryIds = [...new Set(alternatives.flatMap(({ path }) => path.slice(1, -1)))];
  return {
    ...best,
    reachable: true,
    alternatives,
    preliminaryTerritoryIds,
    unavailableTerritoryIds,
  };
}

export function findRoute(
  map: MapData,
  fromBaseId: string,
  targetTerritoryId: string,
  blockedTerritoryIds = new Set<string>(),
): RouteResult {
  const plan = {
    territories: Object.fromEntries([...blockedTerritoryIds].map((territoryId) => [territoryId, { territoryId, status: "ignore" }])),
  } as Plan;
  const path = shortestWeightedPath(map, fromBaseId, targetTerritoryId, plan);
  if (!path.length)
    return {
      path: [],
      reachable: false,
      reason: blockedTerritoryIds.has(targetTerritoryId) ? "Цель отмечена как «Не учитывать»" : "Доступный путь не найден",
    };
  return { ...describePath(path, map), reachable: true };
}

export function recommendTargets(map: MapData, baseId: string, plan: Plan, config: GameConfig, limit = 5): TargetRecommendation[] {
  return map.territories
    .filter(({ type }) => type === "workbench")
    .map((territory) => {
      const efficiency = config.workbenches[territory.size]?.efficiency ?? 1;
      const route = findStrategicRoute(map, baseId, territory.id, plan, config, 1, false);
      if (!route.reachable) return null;
      const uncapturedCount = route.uncapturedCount ?? 0;
      return {
        territoryId: territory.id,
        efficiency,
        routeScore: route.score ?? Number.POSITIVE_INFINITY,
        uncapturedCount,
        recommendationScore: efficiency / Math.max(1, uncapturedCount),
      };
    })
    .filter((item): item is TargetRecommendation => item !== null)
    .sort((a, b) => b.recommendationScore - a.recommendationScore || b.efficiency - a.efficiency || a.routeScore - b.routeScore)
    .slice(0, limit);
}

export function routePathToArrows(path: string[], map: MapData, createId: () => string, color = "#ff5a5f"): PlanArrow[] {
  const territoryIds = new Set(map.territories.map(({ id }) => id));
  const onlyTerritories = path.filter((nodeId) => territoryIds.has(nodeId));
  return onlyTerritories.slice(0, -1).map((fromTerritoryId, index) => ({
    id: createId(),
    fromTerritoryId,
    toTerritoryId: onlyTerritories[index + 1]!,
    color,
    width: 8,
    dashed: false,
  }));
}

export function blockedTerritories(plan?: Plan): Set<string> {
  if (!plan) return new Set();
  return new Set(
    Object.values(plan.territories)
      .filter(({ status }) => status === "ignore" || status === "secondary")
      .map(({ territoryId }) => territoryId),
  );
}
