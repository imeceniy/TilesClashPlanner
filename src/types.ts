export type TerritoryType =
  | "lair"
  | "workbench"
  | "bastion"
  | "tradingPost"
  | "militaryBase"
  | "researchCenter"
  | "megapolis"
  | "town"
  | "factory"
  | "village";
export type TerritorySize = "XS" | "S" | "M" | "L" | "XL" | "XXL" | `L${1 | 2 | 3 | 4 | 5 | 6}` | "—";
export type TerritoryStatus = "neutral" | "captured" | "hold" | "priority" | "secondary" | "noAttack" | "enemy" | "ignore";

export interface Territory {
  id: string;
  name: string;
  type: TerritoryType;
  size: TerritorySize;
  x: number;
  y: number;
  value: number;
  copperPerHour?: number;
  defaultShape: "circle" | "square" | "polygon";
  points?: Array<[number, number]>;
  baseColor?: string;
  sourceId?: string;
  /** Present only on the Copper event map. */
  bastionLevel?: number;
  bastionIndex?: number;
}

export interface TerritoryConnection {
  id: string;
  from: string;
  to: string;
}
export interface MapBase {
  id: string;
  name: string;
  x: number;
  y: number;
  defaultColor: string;
  sourceId?: string;
}
export interface MapData {
  id: string;
  name: string;
  source?: string;
  renderer: "konva";
  variant?: "classic" | "polygon";
  eventRules?: "classic" | "copper" | "generic";
  backgroundColor?: string;
  connectionColor?: string;
  width: number;
  height: number;
  territories: Territory[];
  connections: TerritoryConnection[];
  bases: MapBase[];
  baseConnections: TerritoryConnection[];
  decorations?: MapDecoration[];
}

export interface MapDecoration {
  id: string;
  name: string;
  x: number;
  y: number;
  points: Array<[number, number]>;
  fill: string;
}

export interface MapCatalogEntry {
  id: string;
  name: string;
  format: "classic" | "polygon" | "native";
  dataUrl: string;
  configUrl?: string;
  eventRules?: "classic" | "copper" | "generic";
}

export interface Alliance {
  id: string;
  name: string;
  shortName: string;
  color: string;
  isPlayerAlliance: boolean;
}
export interface TerritoryState {
  territoryId: string;
  status: TerritoryStatus;
  ownerAllianceId?: string;
  note?: string;
  emphasized?: boolean;
}
export interface PlanArrow {
  id: string;
  fromTerritoryId: string;
  toTerritoryId: string;
  color: string;
  width: number;
  dashed: boolean;
  label?: string;
}
export interface MapLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
}
export interface AllianceMarker {
  id: string;
  x: number;
  y: number;
  allianceId: string;
}
export type TerritoryTagKind = "alliance" | "refusal";
/** A non-exclusive planning mark. Several tags may belong to one territory. */
export interface TerritoryTag {
  id: string;
  territoryId: string;
  kind: TerritoryTagKind;
  allianceId?: string;
}
export interface Plan {
  id: string;
  name: string;
  date: string;
  territories: Record<string, TerritoryState>;
  arrows: PlanArrow[];
  labels: MapLabel[];
  markers: AllianceMarker[];
  territoryTags: TerritoryTag[];
  baseAssignments: Record<string, string>;
  updatedAt: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PlannerSettings {
  showNames: boolean;
  showValues: boolean;
  showEnemies: boolean;
  showNeutral: boolean;
  showArrows: boolean;
  showConnections: boolean;
  showLabels: boolean;
  showMarkers: boolean;
  showLegend: boolean;
  showStrategic: boolean;
  viewBox: ViewBox | null;
}
export interface PlannerState {
  version: 6;
  currentPlanId: string;
  plans: Plan[];
  alliances: Alliance[];
  settings: PlannerSettings;
}
export interface PlannerSnapshot {
  plans: Plan[];
  alliances: Alliance[];
  currentPlanId: string;
}

export interface GameConfigEntry {
  value: number;
  efficiency?: number;
}
export interface GameConfig {
  lairs: Record<string, GameConfigEntry>;
  workbenches: Record<string, GameConfigEntry>;
}
export interface StatusTheme {
  label: string;
  color: string;
  stroke: string;
}
export type StatusThemes = Record<TerritoryStatus, StatusTheme>;

export type ToolName =
  | TerritoryStatus
  | "select"
  | "arrow"
  | "label"
  | "marker"
  | "allianceStart"
  | "routeTarget"
  | "allianceTag"
  | "refusalTag";

export interface RouteResult {
  path: string[];
  reachable: boolean;
  reason?: string;
  score?: number;
  uncapturedCount?: number;
  enemyCount?: number;
  alternatives?: RouteAlternative[];
  preliminaryTerritoryIds?: string[];
  unavailableTerritoryIds?: string[];
}

export interface RouteAlternative {
  path: string[];
  score: number;
  uncapturedCount: number;
  enemyCount: number;
}

export interface TargetRecommendation {
  territoryId: string;
  efficiency: number;
  routeScore: number;
  uncapturedCount: number;
  recommendationScore: number;
}
