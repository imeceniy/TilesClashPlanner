import type { Alliance, Plan, PlannerSettings, PlannerState, TerritoryStatus, TerritoryTag } from "./types";

export function validateProjectMapReferences(
  project: PlannerState,
  map: { territories: Array<{ id: string }>; bases: Array<{ id: string }> },
): void {
  const territoryIds = new Set(map.territories.map(({ id }) => id));
  const startIds = new Set([...territoryIds, ...map.bases.map(({ id }) => id)]);
  for (const plan of project.plans) {
    const check = (id: string): void => {
      if (!territoryIds.has(id)) throw new Error(`План «${plan.name}»: территория ${id} отсутствует на карте`);
    };
    for (const [key, territory] of Object.entries(plan.territories)) {
      check(key);
      if (territory.territoryId !== key) throw new Error(`План «${plan.name}»: неверный идентификатор территории ${key}`);
    }
    for (const arrow of plan.arrows) {
      check(arrow.fromTerritoryId);
      check(arrow.toTerritoryId);
    }
    for (const tag of plan.territoryTags) check(tag.territoryId);
    for (const startId of Object.keys(plan.baseAssignments))
      if (!startIds.has(startId)) throw new Error(`План «${plan.name}»: старт ${startId} отсутствует на карте`);
  }
}

export const STORAGE_VERSION = 6 as const;
export const STORAGE_KEY = "tiles-clash-planner:v6";
export const LEGACY_STORAGE_KEYS = [
  "tiles-clash-planner:v5",
  "tiles-clash-planner:v4",
  "tiles-clash-planner:v3",
  "tiles-clash-planner:v2",
  "tiles-clash-planner:v1",
] as const;

const statuses = new Set<TerritoryStatus>(["neutral", "captured", "hold", "priority", "secondary", "noAttack", "enemy", "ignore"]);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown, path: string): string => {
  if (typeof value !== "string") throw new Error(`${path}: ожидалась строка`);
  return value;
};
const number = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path}: ожидалось число`);
  return value;
};
const boolean = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`${path}: ожидалось логическое значение`);
  return value;
};
function object(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${path}: ожидался объект`);
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: ожидался массив`);
  return value;
}
function strictKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${path}: неизвестные поля ${unknown.join(", ")}`);
}

function validateAlliance(value: unknown, path: string): Alliance {
  const item = object(value, path);
  strictKeys(item, ["id", "name", "shortName", "color", "isPlayerAlliance"], path);
  const color = string(item.color, `${path}.color`);
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${path}.color: неверный HEX`);
  return {
    id: string(item.id, `${path}.id`),
    name: string(item.name, `${path}.name`),
    shortName: string(item.shortName, `${path}.shortName`),
    color,
    isPlayerAlliance: boolean(item.isPlayerAlliance, `${path}.isPlayerAlliance`),
  };
}

function validatePlan(value: unknown, path: string): Plan {
  const item = object(value, path);
  strictKeys(
    item,
    ["id", "name", "date", "territories", "arrows", "labels", "markers", "territoryTags", "baseAssignments", "updatedAt"],
    path,
  );
  const territoriesRaw = object(item.territories, `${path}.territories`);
  const territories: Plan["territories"] = {};
  for (const [id, raw] of Object.entries(territoriesRaw)) {
    const territory = object(raw, `${path}.territories.${id}`);
    strictKeys(territory, ["territoryId", "status", "ownerAllianceId", "note", "emphasized"], `${path}.territories.${id}`);
    const status = string(territory.status, `${path}.territories.${id}.status`) as TerritoryStatus;
    if (!statuses.has(status)) throw new Error(`${path}.territories.${id}.status: неизвестный статус`);
    territories[id] = { territoryId: string(territory.territoryId, `${path}.territories.${id}.territoryId`), status };
    if (territory.ownerAllianceId !== undefined)
      territories[id].ownerAllianceId = string(territory.ownerAllianceId, `${path}.territories.${id}.ownerAllianceId`);
    if (territory.note !== undefined) territories[id].note = string(territory.note, `${path}.territories.${id}.note`);
    if (territory.emphasized !== undefined)
      territories[id].emphasized = boolean(territory.emphasized, `${path}.territories.${id}.emphasized`);
  }
  const arrows = array(item.arrows, `${path}.arrows`).map((raw, index) => {
    const arrow = object(raw, `${path}.arrows[${index}]`);
    strictKeys(arrow, ["id", "fromTerritoryId", "toTerritoryId", "color", "width", "dashed", "label"], `${path}.arrows[${index}]`);
    return {
      id: string(arrow.id, `${path}.arrows[${index}].id`),
      fromTerritoryId: string(arrow.fromTerritoryId, `${path}.arrows[${index}].fromTerritoryId`),
      toTerritoryId: string(arrow.toTerritoryId, `${path}.arrows[${index}].toTerritoryId`),
      color: string(arrow.color, `${path}.arrows[${index}].color`),
      width: number(arrow.width, `${path}.arrows[${index}].width`),
      dashed: boolean(arrow.dashed, `${path}.arrows[${index}].dashed`),
      ...(arrow.label === undefined ? {} : { label: string(arrow.label, `${path}.arrows[${index}].label`) }),
    };
  });
  const labels = array(item.labels, `${path}.labels`).map((raw, index) => {
    const label = object(raw, `${path}.labels[${index}]`);
    strictKeys(label, ["id", "x", "y", "text", "size", "color"], `${path}.labels[${index}]`);
    return {
      id: string(label.id, `${path}.labels[${index}].id`),
      x: number(label.x, `${path}.labels[${index}].x`),
      y: number(label.y, `${path}.labels[${index}].y`),
      text: string(label.text, `${path}.labels[${index}].text`),
      size: number(label.size, `${path}.labels[${index}].size`),
      color: string(label.color, `${path}.labels[${index}].color`),
    };
  });
  const markers = array(item.markers, `${path}.markers`).map((raw, index) => {
    const marker = object(raw, `${path}.markers[${index}]`);
    strictKeys(marker, ["id", "x", "y", "allianceId"], `${path}.markers[${index}]`);
    return {
      id: string(marker.id, `${path}.markers[${index}].id`),
      x: number(marker.x, `${path}.markers[${index}].x`),
      y: number(marker.y, `${path}.markers[${index}].y`),
      allianceId: string(marker.allianceId, `${path}.markers[${index}].allianceId`),
    };
  });
  const territoryTags = array(item.territoryTags ?? [], `${path}.territoryTags`).map((raw, index): TerritoryTag => {
    const tag = object(raw, `${path}.territoryTags[${index}]`);
    strictKeys(tag, ["id", "territoryId", "kind", "allianceId"], `${path}.territoryTags[${index}]`);
    const kind = string(tag.kind, `${path}.territoryTags[${index}].kind`);
    if (kind !== "alliance" && kind !== "refusal") throw new Error(`${path}.territoryTags[${index}].kind: неизвестная метка`);
    if (kind === "alliance" && tag.allianceId === undefined)
      throw new Error(`${path}.territoryTags[${index}].allianceId: для союза обязателен`);
    if (kind === "refusal" && tag.allianceId !== undefined)
      throw new Error(`${path}.territoryTags[${index}].allianceId: не применяется к отказу`);
    return {
      id: string(tag.id, `${path}.territoryTags[${index}].id`),
      territoryId: string(tag.territoryId, `${path}.territoryTags[${index}].territoryId`),
      kind,
      ...(tag.allianceId === undefined ? {} : { allianceId: string(tag.allianceId, `${path}.territoryTags[${index}].allianceId`) }),
    };
  });
  const baseAssignmentsRaw = object(item.baseAssignments, `${path}.baseAssignments`);
  const baseAssignments = Object.fromEntries(
    Object.entries(baseAssignmentsRaw).map(([baseId, allianceId]) => [baseId, string(allianceId, `${path}.baseAssignments.${baseId}`)]),
  );
  return {
    id: string(item.id, `${path}.id`),
    name: string(item.name, `${path}.name`),
    date: string(item.date, `${path}.date`),
    territories,
    arrows,
    labels,
    markers,
    territoryTags,
    baseAssignments,
    updatedAt: number(item.updatedAt, `${path}.updatedAt`),
  };
}

function validateSettings(value: unknown, defaults: PlannerSettings): PlannerSettings {
  const item = object(value, "settings");
  strictKeys(
    item,
    [
      "showNames",
      "showValues",
      "showEnemies",
      "showNeutral",
      "showArrows",
      "showConnections",
      "showLabels",
      "showMarkers",
      "showLegend",
      "showStrategic",
      "viewBox",
    ],
    "settings",
  );
  const result = { ...defaults };
  for (const key of [
    "showNames",
    "showValues",
    "showEnemies",
    "showNeutral",
    "showArrows",
    "showConnections",
    "showLabels",
    "showMarkers",
    "showLegend",
    "showStrategic",
  ] as const) {
    if (item[key] !== undefined) result[key] = boolean(item[key], `settings.${key}`);
  }
  if (item.viewBox !== undefined && item.viewBox !== null) {
    const box = object(item.viewBox, "settings.viewBox");
    strictKeys(box, ["x", "y", "width", "height"], "settings.viewBox");
    result.viewBox = {
      x: number(box.x, "settings.viewBox.x"),
      y: number(box.y, "settings.viewBox.y"),
      width: number(box.width, "settings.viewBox.width"),
      height: number(box.height, "settings.viewBox.height"),
    };
  }
  return result;
}

export function migrateProject(raw: unknown, defaults: PlannerState): PlannerState {
  const source = object(raw, "project");
  const version = source.version === undefined ? 1 : number(source.version, "version");
  if (version > STORAGE_VERSION) throw new Error(`Проект создан более новой версией (${version})`);
  if (version < 1) throw new Error(`Неподдерживаемая версия проекта (${version})`);
  const plansSource = array(source.plans, "plans").map((rawPlan) => {
    const plan = object(rawPlan, "plan");
    const withoutLegacyStart = { ...plan };
    delete withoutLegacyStart.allianceStarts;
    const migrated = {
      ...withoutLegacyStart,
      baseAssignments: isObject(plan.baseAssignments) ? plan.baseAssignments : {},
      markers: Array.isArray(plan.markers)
        ? plan.markers.filter((marker) => !isObject(marker) || marker.allianceId !== "__no_attack__")
        : [],
      territoryTags: Array.isArray(plan.territoryTags) ? plan.territoryTags : [],
      updatedAt: typeof plan.updatedAt === "number" ? plan.updatedAt : Date.now(),
    };
    return migrated;
  });
  const project: PlannerState = {
    version: STORAGE_VERSION,
    currentPlanId: string(source.currentPlanId, "currentPlanId"),
    plans: plansSource.map((plan, index) => validatePlan(plan, `plans[${index}]`)),
    alliances: array(source.alliances, "alliances").map((alliance, index) => validateAlliance(alliance, `alliances[${index}]`)),
    settings: validateSettings(source.settings ?? {}, defaults.settings),
  };
  if (!project.plans.length || !project.alliances.length) throw new Error("Проект должен содержать план и союз");
  if (!project.plans.some((plan) => plan.id === project.currentPlanId)) project.currentPlanId = project.plans[0]!.id;
  const allianceIds = new Set(project.alliances.map(({ id }) => id));
  for (const plan of project.plans) {
    for (const [baseId, allianceId] of Object.entries(plan.baseAssignments))
      if (!allianceIds.has(allianceId)) throw new Error(`План ${plan.name}: база ${baseId} ссылается на неизвестный союз`);
    for (const territory of Object.values(plan.territories))
      if (territory.ownerAllianceId && !allianceIds.has(territory.ownerAllianceId))
        throw new Error(`План ${plan.name}: неизвестный владелец территории`);
    for (const tag of plan.territoryTags)
      if (tag.allianceId && !allianceIds.has(tag.allianceId)) throw new Error(`План ${plan.name}: метка ссылается на неизвестный союз`);
  }
  return project;
}

export function serializeProject(state: PlannerState): string {
  return JSON.stringify(state);
}
export function toSharedState(state: PlannerState): Omit<PlannerState, "settings"> {
  const shared = structuredClone(state) as Partial<PlannerState>;
  delete shared.settings;
  return shared as Omit<PlannerState, "settings">;
}
export function parseProject(text: string, defaults: PlannerState): PlannerState {
  return migrateProject(JSON.parse(text) as unknown, defaults);
}

const scopedStorageKey = (mapId?: string): string => (mapId ? `${STORAGE_KEY}:${mapId}` : STORAGE_KEY);

export function loadState(storage: Storage, defaults: PlannerState, mapId?: string): PlannerState {
  const currentKey = scopedStorageKey(mapId);
  const keys = mapId ? [currentKey, ...LEGACY_STORAGE_KEYS.map((key) => `${key}:${mapId}`)] : [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keys) {
    const stored = storage.getItem(key);
    if (!stored) continue;
    try {
      const migrated = parseProject(stored, defaults);
      if (key !== currentKey || JSON.parse(stored).version !== STORAGE_VERSION) saveBackup(storage, key, stored);
      storage.setItem(currentKey, serializeProject(migrated));
      return migrated;
    } catch (error) {
      console.warn(`Cannot restore planner state from ${key}`, error);
    }
  }
  return defaults;
}

export function saveState(storage: Storage, state: PlannerState, mapId?: string): void {
  const key = scopedStorageKey(mapId);
  const serialized = serializeProject(state);
  try {
    storage.setItem(key, serialized);
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error;
    removeBackups(storage, key);
    storage.setItem(key, serialized);
  }
}

const backupPrefix = (key: string): string => `${key}:backup:`;
function backupKeys(storage: Storage, key: string): string[] {
  const prefix = backupPrefix(key);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const candidate = storage.key(index);
    if (candidate?.startsWith(prefix)) keys.push(candidate);
  }
  return keys.sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)));
}
function removeBackups(storage: Storage, key: string): void {
  for (const backup of backupKeys(storage, key)) storage.removeItem(backup);
}
function saveBackup(storage: Storage, key: string, value: string): void {
  const backup = `${backupPrefix(key)}${Date.now()}`;
  const existing = backupKeys(storage, key);
  if (existing.length >= 3) for (const old of existing.slice(2)) storage.removeItem(old);
  storage.setItem(backup, value);
  for (const old of backupKeys(storage, key).slice(3)) storage.removeItem(old);
}
function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "QuotaExceededError" || error.code === 22
    : Boolean(error && typeof error === "object" && "name" in error && (error as { name: string }).name === "QuotaExceededError");
}
