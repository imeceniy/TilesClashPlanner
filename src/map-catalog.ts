import type { GameConfig, MapCatalogEntry, MapData, Territory, TerritorySize, TerritoryType } from "./types";

interface PolygonRegion {
  id: string;
  kind: "resource" | "bastion" | "center";
  resourceType?: TerritoryType;
  level?: number;
  name: string;
  center: [number, number];
  points: Array<[number, number]>;
  color: string;
  interactive: boolean;
  firstCapturePoints: number | null;
  copperPerHour: number | null;
}

export interface PolygonMapSource {
  id: string;
  name: string;
  width: number;
  height: number;
  regions: PolygonRegion[];
  connections: Array<{ id: string; from: string; to: string }>;
}

const EMPTY_CONFIG: GameConfig = { lairs: {}, workbenches: {} };

export function validateMap(map: MapData): void {
  if (!map.id || !Number.isFinite(map.width) || !Number.isFinite(map.height) || map.width <= 0 || map.height <= 0)
    throw new Error("Карта: неверный идентификатор или размеры");
  const ids = new Set<string>();
  for (const node of [...map.territories, ...map.bases]) {
    if (!node.id || ids.has(node.id)) throw new Error(`Карта: повторный или пустой идентификатор ${node.id}`);
    ids.add(node.id);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error(`Карта: неверные координаты ${node.id}`);
    if ("value" in node && (!Number.isFinite(node.value) || node.value < 0)) throw new Error(`Карта: неверная награда ${node.id}`);
    if (
      "points" in node &&
      node.points &&
      (node.points.length < 3 || node.points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))
    )
      throw new Error(`Карта: неверный полигон ${node.id}`);
  }
  const connectionIds = new Set<string>();
  const edges = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const edge of [...map.connections, ...map.baseConnections]) {
    if (!edge.id || connectionIds.has(edge.id) || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)
      throw new Error(`Карта: неверная связь ${edge.id}`);
    connectionIds.add(edge.id);
    const key = [edge.from, edge.to].sort().join("\u0000");
    if (edges.has(key)) throw new Error(`Карта: повторная связь ${edge.id}`);
    edges.add(key);
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }
  // A disconnected graph may be intentional for a future event; validation
  // reports it without making existing maps impossible to open.
  if (ids.size && connectionIds.size) {
    const queue = [ids.values().next().value as string];
    const reached = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const next of adjacency.get(queue[i]!) ?? [])
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
    if (reached.size !== ids.size) console.warn(`Карта ${map.id}: граф содержит несвязанные территории (${reached.size}/${ids.size})`);
  }
}

export function normalizePolygonMap(source: PolygonMapSource, eventRules: MapData["eventRules"] = "copper"): MapData {
  const territories: Territory[] = source.regions
    .filter((region) => region.interactive)
    .map((region) => {
      const match = eventRules === "copper" && region.kind === "bastion" ? region.id.match(/bastion-L(\d+)-(\d+)/i) : null;
      const level = region.level ?? (match ? Number(match[1]) : undefined);
      const index = match ? Number(match[2]) : undefined;
      return {
        id: region.id,
        name: level && index ? `Б${level}.${index}` : region.name,
        type: region.kind === "bastion" ? "bastion" : (region.resourceType ?? "tradingPost"),
        size: region.kind === "bastion" ? (`L${region.level}` as TerritorySize) : "—",
        x: region.center[0],
        y: region.center[1],
        value: region.firstCapturePoints ?? 0,
        copperPerHour: region.copperPerHour ?? 0,
        defaultShape: "polygon",
        points: region.points.map(([x, y]) => [x - region.center[0], y - region.center[1]] as [number, number]),
        // Bastion levels are communicated by their number, not a brown fill.
        baseColor: eventRules === "copper" && region.kind === "bastion" ? "#eef2ea" : region.color,
        sourceId: region.id,
        ...(level && index ? { bastionLevel: level, bastionIndex: index } : {}),
      };
    });
  return {
    id: source.id,
    name: source.name,
    source: "Схематично.jpg · карта нового события",
    renderer: "konva",
    variant: "polygon",
    eventRules,
    backgroundColor: "#090d0b",
    connectionColor: "#40b874",
    width: source.width,
    height: source.height,
    territories,
    connections: source.connections,
    bases: [],
    baseConnections: [],
    decorations: source.regions
      .filter((region) => !region.interactive)
      .map((region) => ({
        id: region.id,
        name: region.name,
        x: region.center[0],
        y: region.center[1],
        points: region.points.map(([x, y]) => [x - region.center[0], y - region.center[1]] as [number, number]),
        fill: region.color,
      })),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function loadMapCatalog(): Promise<MapCatalogEntry[]> {
  return fetchJson<MapCatalogEntry[]>("./data/map-catalog.json");
}

export async function loadMapEntry(entry: MapCatalogEntry): Promise<{ map: MapData; config: GameConfig }> {
  if (entry.format === "native") {
    const map = await fetchJson<MapData>(entry.dataUrl);
    if (map.id !== entry.id) throw new Error("Идентификатор карты не совпадает с каталогом");
    map.eventRules = entry.eventRules ?? "generic";
    validateMap(map);
    return { map, config: EMPTY_CONFIG };
  }
  if (entry.format === "classic") {
    const [map, config] = await Promise.all([
      fetchJson<MapData>(entry.dataUrl),
      entry.configUrl ? fetchJson<GameConfig>(entry.configUrl) : Promise.resolve(EMPTY_CONFIG),
    ]);
    map.variant = "classic";
    map.eventRules = entry.eventRules ?? "classic";
    if (map.id !== entry.id) throw new Error("Идентификатор карты не совпадает с каталогом");
    validateMap(map);
    return { map, config };
  }
  const map = normalizePolygonMap(await fetchJson<PolygonMapSource>(entry.dataUrl), entry.eventRules ?? "generic");
  if (map.id !== entry.id) throw new Error("Идентификатор карты не совпадает с каталогом");
  validateMap(map);
  return { map, config: EMPTY_CONFIG };
}

const TERRITORY_TYPE_LABELS: Record<TerritoryType, string> = {
  lair: "Логово",
  workbench: "Верстак",
  bastion: "Бастион",
  tradingPost: "Торговый пост",
  militaryBase: "Военная база",
  researchCenter: "Центр исследований",
  megapolis: "Мегаполис",
  town: "Городок",
  factory: "Завод",
  village: "Деревня",
};

export function territoryTypeLabel(territory: Territory): string {
  return TERRITORY_TYPE_LABELS[territory.type];
}
