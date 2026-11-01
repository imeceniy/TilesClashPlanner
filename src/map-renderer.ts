import Konva from "konva";
import { territoryTheme } from "./tools";
import type {
  Alliance,
  GameConfig,
  MapBase,
  MapData,
  MapLabel,
  Plan,
  PlanArrow,
  PlannerSettings,
  RouteResult,
  Territory,
  TerritoryState,
  TerritoryTag,
  ToolName,
} from "./types";

export const nodeSize = (territory: Territory): number => {
  if (territory.points?.length) return Math.max(18, ...territory.points.map(([x, y]) => Math.hypot(x, y)));
  return territory.type === "lair" ? 27 : 54;
};
function territoryBounds(territory: Territory): { minX: number; maxX: number; minY: number; maxY: number } {
  if (territory.points?.length) {
    return territory.points.reduce(
      (bounds, [x, y]) => ({
        minX: Math.min(bounds.minX, x),
        maxX: Math.max(bounds.maxX, x),
        minY: Math.min(bounds.minY, y),
        maxY: Math.max(bounds.maxY, y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
  }
  const extent = territory.type === "lair" ? nodeSize(territory) : nodeSize(territory) / 2;
  return { minX: -extent, maxX: extent, minY: -extent, maxY: extent };
}
export const baseIndex = (base: MapBase): string => base.id.replace(/^base-/, "").toUpperCase();
export function shortenArrow(origin: Territory, target: Territory, distance: number): { x: number; y: number } {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: origin.x + (dx / length) * distance, y: origin.y + (dy / length) * distance };
}

export interface RenderCallbacks {
  territoryState(id: string): TerritoryState;
  onTerritoryClick(event: Event, territory: Territory): void;
  onTerritoryContext(event: MouseEvent, territory: Territory): void;
  onArrowEdit(arrow: PlanArrow): void;
  onArrowRemove(id: string): void;
  onLabelHistory(): void;
  onLabelMove(label: MapLabel, x: number, y: number): void;
  onLabelEdit(label: MapLabel): void;
  onMarkerHistory(): void;
  onMarkerMove(id: string, x: number, y: number): void;
  onMarkerRemove(id: string): void;
  onBaseClick(event: MouseEvent, base: MapBase): void;
}

export interface RenderContext {
  group: Konva.Group;
  layer: Konva.Layer;
  stage: Konva.Stage;
  map: MapData;
  gameConfig: GameConfig;
  plan: Plan;
  alliances: Alliance[];
  settings: PlannerSettings;
  tool: ToolName;
  searchHitId: string | null;
  selectingStart: boolean;
  routePreview: RouteResult | null;
  routeTargetId: string | null;
  readOnly: boolean;
  lowPowerMode: boolean;
  callbacks: RenderCallbacks;
}

export function renderStaticMapScene(group: Konva.Group, map: MapData): Konva.Group {
  group.destroyChildren();
  group.listening(false);
  group.add(new Konva.Rect({ x: 0, y: 0, width: map.width, height: map.height, fill: map.backgroundColor ?? "#f7f7f5", listening: false }));
  const territories = new Map(map.territories.map((territory) => [territory.id, territory]));
  const bases = new Map(map.bases.map((base) => [base.id, base]));
  const segments = [...map.connections, ...map.baseConnections]
    .map(({ from, to }) => {
      const start = territories.get(from) ?? bases.get(from);
      const end = territories.get(to) ?? bases.get(to);
      return start && end ? [start.x, start.y, end.x, end.y] : null;
    })
    .filter((segment): segment is number[] => segment !== null);
  const connections = new Konva.Group({ name: "static-connections", listening: false });
  connections.add(
    new Konva.Shape({
      listening: false,
      stroke: map.connectionColor ?? "#303030",
      strokeWidth: map.variant === "polygon" ? 1.25 : 2,
      opacity: map.variant === "polygon" ? 0.52 : 1,
      sceneFunc(context, shape) {
        context.beginPath();
        for (const [x1, y1, x2, y2] of segments) {
          context.moveTo(x1!, y1!);
          context.lineTo(x2!, y2!);
        }
        context.fillStrokeShape(shape);
      },
    }),
  );
  connections.cache({ x: 0, y: 0, width: map.width, height: map.height, pixelRatio: 1 });
  group.add(connections);
  for (const decoration of map.decorations ?? []) {
    const decorationGroup = new Konva.Group({ x: decoration.x, y: decoration.y, listening: false });
    decorationGroup.add(
      new Konva.Line({
        points: decoration.points.flat(),
        closed: true,
        fill: decoration.fill,
        stroke: "#242824",
        strokeWidth: 2,
      }),
    );
    decorationGroup.add(
      new Konva.Text({
        x: -90,
        y: -11,
        width: 180,
        align: "center",
        text: decoration.name.toUpperCase(),
        fill: "#39423c",
        fontSize: 18,
        fontStyle: "bold",
      }),
    );
    group.add(decorationGroup);
  }
  return connections;
}

export function renderMapScene(context: RenderContext): void {
  const { group, layer, stage, map, plan, alliances, settings, callbacks } = context;
  const getTerritory = (id: string) => map.territories.find((territory) => territory.id === id);
  group.destroyChildren();
  const allianceStartOverlays: Konva.Group[] = [];

  for (const territory of map.territories) {
    const itemState = callbacks.territoryState(territory.id);
    if (itemState.status === "neutral" && !settings.showNeutral) continue;
    if (itemState.status === "enemy" && !settings.showEnemies) continue;
    const colors = territoryTheme(itemState, alliances);
    const neutral = itemState.status === "neutral";
    const polygonMap = map.variant === "polygon";
    const fill = neutral ? (territory.baseColor ?? "#ffffff") : colors.color;
    const stroke = polygonMap ? "#101511" : neutral ? (territory.type === "lair" ? "#4f4f4f" : "#171717") : colors.stroke;
    const labelFill = neutral ? "#111111" : "#ffffff";
    const labelStroke = neutral ? "#ffffff" : "#111814";
    const size = nodeSize(territory);
    const bounds = territoryBounds(territory);
    const boundsHeight = bounds.maxY - bounds.minY;
    const nameY = bounds.minY + Math.max(1, boundsHeight * 0.12);
    const node = new Konva.Group({ x: territory.x, y: territory.y, name: "territory", id: territory.id });
    const shape: Konva.Shape = territory.points?.length
      ? new Konva.Line({
          points: territory.points.flat(),
          closed: true,
          fill,
          stroke: context.searchHitId === territory.id ? "#21a95d" : stroke,
          strokeWidth: context.searchHitId === territory.id ? 2.5 : 1,
          strokeScaleEnabled: false,
          lineJoin: "miter",
          miterLimit: 2,
          shadowColor: context.searchHitId === territory.id ? "#21a95d" : "transparent",
          shadowBlur: context.searchHitId === territory.id ? 6 : 0,
        })
      : territory.type === "lair"
        ? new Konva.Circle({
            radius: size,
            fill,
            stroke: context.searchHitId === territory.id ? "#21a95d" : stroke,
            strokeWidth: context.searchHitId === territory.id ? 5 : 2,
            shadowColor: context.searchHitId === territory.id ? "#21a95d" : "transparent",
            shadowBlur: 14,
          })
        : new Konva.Rect({
            x: -size / 2,
            y: -size / 2,
            width: size,
            height: size,
            cornerRadius: 4,
            fill,
            stroke: context.searchHitId === territory.id ? "#21a95d" : stroke,
            strokeWidth: context.searchHitId === territory.id ? 5 : 2,
            shadowColor: context.searchHitId === territory.id ? "#21a95d" : "transparent",
            shadowBlur: 14,
          });
    if (itemState.status === "ignore") shape.opacity(0.48);
    node.add(shape);
    const startAlliance = alliances.find(({ id }) => id === plan.baseAssignments[territory.id]);
    if (startAlliance) {
      const startIconRadius = map.variant === "polygon" ? 16 : 24;
      const startIconY = Math.min(-startIconRadius - 2, -size * 0.42);
      const startIcon = new Konva.Group({ x: territory.x, y: territory.y, listening: false });
      startIcon.add(
        new Konva.Circle({
          x: 0,
          y: startIconY,
          radius: startIconRadius,
          fill: startAlliance.color,
          stroke: "#ffffff",
          strokeWidth: 3,
          listening: false,
        }),
      );
      startIcon.add(
        new Konva.Text({
          x: -36,
          y: startIconY - (map.variant === "polygon" ? 8 : 10),
          width: 72,
          align: "center",
          text: startAlliance.shortName,
          fill: "#ffffff",
          fontSize: map.variant === "polygon" ? 12 : 17,
          fontStyle: "bold",
          stroke: "#101713",
          strokeWidth: 3,
          fillAfterStrokeEnabled: true,
          listening: false,
        }),
      );
      allianceStartOverlays.push(startIcon);
    }
    if (settings.showNames && !territory.bastionLevel) {
      const emphasized = itemState.emphasized === true;
      node.add(
        new Konva.Text({
          x: emphasized ? -65 : -40,
          y: nameY,
          width: emphasized ? 130 : 80,
          align: "center",
          text: territory.name,
          fontSize: emphasized ? 28 : map.id === "winter-2026" ? 11 : map.variant === "polygon" ? 7 : 16,
          fontStyle: "bold",
          fill: labelFill,
          stroke: labelStroke,
          strokeWidth: emphasized ? 5 : 3,
          fillAfterStrokeEnabled: true,
          listening: false,
        }),
      );
    }
    // Copper bastions always carry their stable B<level>.<number> identifier.
    // It remains visible even when ordinary object names are switched off.
    if (territory.bastionLevel && territory.bastionIndex) {
      node.add(
        new Konva.Text({
          x: -38,
          y: nameY,
          width: 76,
          align: "center",
          text: territory.name,
          fontSize: 11,
          fontStyle: "bold",
          fill: labelFill,
          stroke: labelStroke,
          strokeWidth: 3,
          fillAfterStrokeEnabled: true,
          listening: false,
        }),
      );
    }
    if (settings.showStrategic) {
      const config = territory.type === "lair" ? context.gameConfig.lairs[territory.size] : context.gameConfig.workbenches[territory.size];
      const strategic =
        map.eventRules === "copper"
          ? `${territory.value} оч. · ${territory.copperPerHour ?? 0} меди/ч`
          : `${territory.value}${config?.efficiency ? ` · ×${config.efficiency.toFixed(2)}` : ""}`;
      node.add(
        new Konva.Text({
          x: -55,
          y: 7,
          width: 110,
          align: "center",
          text: strategic,
          fontSize: 7,
          fontStyle: "bold",
          fill: neutral ? "#4b4b4b" : labelFill,
          listening: false,
        }),
      );
    } else if (settings.showValues)
      node.add(
        new Konva.Text({
          x: -34,
          y: 7,
          width: 68,
          align: "center",
          text: String(territory.value),
          fontSize: 9,
          fill: neutral ? "#666666" : labelFill,
          opacity: 0.9,
          listening: false,
        }),
      );
    if (!context.lowPowerMode) {
      node.on("mouseenter", () => {
        shape.strokeWidth(polygonMap ? 2 : 5);
        stage.container().style.cursor = "pointer";
        layer.batchDraw();
      });
      node.on("mouseleave", () => {
        shape.strokeWidth(context.searchHitId === territory.id ? (polygonMap ? 2.5 : 5) : polygonMap ? 1 : 2);
        stage.container().style.cursor = "default";
        layer.batchDraw();
      });
    }
    node.on("click tap", (event) => {
      event.cancelBubble = true;
      callbacks.onTerritoryClick(event.evt, territory);
    });
    node.on("contextmenu", (event) => {
      event.evt.preventDefault();
      event.cancelBubble = true;
      callbacks.onTerritoryContext(event.evt as MouseEvent, territory);
    });
    group.add(node);
  }

  if (context.routeTargetId) {
    const unavailable = new Set(context.routePreview?.unavailableTerritoryIds ?? []);
    for (const territoryId of unavailable) {
      const territory = getTerritory(territoryId);
      if (!territory) continue;
      const radius = nodeSize(territory) + 7;
      group.add(
        new Konva.Circle({
          x: territory.x,
          y: territory.y,
          radius,
          stroke: "#ff4d58",
          strokeWidth: 3,
          opacity: 0.72,
          dash: [7, 5],
          listening: false,
        }),
      );
      group.add(
        new Konva.Line({
          points: [territory.x - radius * 0.55, territory.y - radius * 0.55, territory.x + radius * 0.55, territory.y + radius * 0.55],
          stroke: "#ff4d58",
          strokeWidth: 3,
          opacity: 0.72,
          listening: false,
        }),
      );
    }
    const bestPath = new Set(context.routePreview?.path ?? []);
    for (const territoryId of context.routePreview?.preliminaryTerritoryIds ?? []) {
      if (bestPath.has(territoryId)) continue;
      const territory = getTerritory(territoryId);
      if (!territory) continue;
      group.add(
        new Konva.Circle({
          x: territory.x,
          y: territory.y,
          radius: nodeSize(territory) + 6,
          stroke: "#edb83f",
          strokeWidth: 3,
          opacity: 0.58,
          dash: [5, 7],
          listening: false,
        }),
      );
    }
  }

  if (context.routePreview?.reachable) {
    const previewTerritories = context.routePreview.path
      .map(getTerritory)
      .filter((territory): territory is Territory => Boolean(territory));
    previewTerritories.forEach((territory, index) =>
      group.add(
        new Konva.Circle({
          x: territory.x,
          y: territory.y,
          radius: nodeSize(territory) + 8,
          stroke: index === previewTerritories.length - 1 ? "#32d47b" : "#f3c84a",
          strokeWidth: 5,
          dash: [10, 5],
          shadowColor: "#f3c84a",
          shadowBlur: 8,
          listening: false,
        }),
      ),
    );
  } else if (context.routeTargetId) {
    const target = getTerritory(context.routeTargetId);
    if (target)
      group.add(
        new Konva.Circle({
          x: target.x,
          y: target.y,
          radius: nodeSize(target) + 9,
          stroke: "#ff4d58",
          strokeWidth: 6,
          dash: [8, 5],
          shadowColor: "#ff4d58",
          shadowBlur: 12,
          listening: false,
        }),
      );
  }

  if (settings.showArrows)
    for (const arrow of plan.arrows) {
      const from = getTerritory(arrow.fromTerritoryId);
      const to = getTerritory(arrow.toTerritoryId);
      if (!from || !to) continue;
      const start = shortenArrow(from, to, nodeSize(from) + 8);
      const end = shortenArrow(to, from, nodeSize(to) + 13);
      const line = new Konva.Arrow({
        points: [start.x, start.y, end.x, end.y],
        stroke: arrow.color,
        fill: arrow.color,
        strokeWidth: arrow.width,
        hitStrokeWidth: 22,
        pointerLength: 18,
        pointerWidth: 18,
        lineCap: "round",
        opacity: 0.94,
        dash: arrow.dashed ? [18, 12] : [],
      });
      if (!context.readOnly) {
        line.on("contextmenu", (event) => {
          event.evt.preventDefault();
          event.cancelBubble = true;
          callbacks.onArrowEdit(arrow);
        });
        line.on("dblclick dbltap", () => callbacks.onArrowRemove(arrow.id));
      }
      group.add(line);
      if (arrow.label)
        group.add(
          new Konva.Text({
            x: (start.x + end.x) / 2 - 80,
            y: (start.y + end.y) / 2 - 24,
            width: 160,
            align: "center",
            text: arrow.label,
            fill: arrow.color,
            fontSize: 18,
            fontStyle: "bold",
            stroke: "#111111",
            strokeWidth: 4,
            fillAfterStrokeEnabled: true,
            listening: false,
          }),
        );
    }

  if (settings.showLabels)
    for (const label of plan.labels) {
      const text = new Konva.Text({
        x: label.x - 160,
        y: label.y - label.size / 2,
        width: 320,
        align: "center",
        text: label.text,
        fill: label.color,
        fontSize: label.size,
        fontStyle: "bold",
        stroke: "#080b09",
        strokeWidth: 6,
        fillAfterStrokeEnabled: true,
        draggable: !context.readOnly && context.tool === "select",
      });
      if (!context.readOnly) {
        text.on("dragstart", callbacks.onLabelHistory);
        text.on("dragend", () => callbacks.onLabelMove(label, text.x() + 160, text.y() + label.size / 2));
        text.on("dblclick dbltap", () => callbacks.onLabelEdit(label));
      }
      group.add(text);
    }

  // Alliance badges sit above map labels, which makes them readable even when
  // their larger size overlaps a territory name or a custom annotation.
  for (const territory of map.territories) {
    const tags = plan.territoryTags.filter(({ territoryId }) => territoryId === territory.id);
    const allianceTags = tags.filter(({ kind }) => kind === "alliance");
    const refusalTags = tags.filter(({ kind }) => kind === "refusal");
    allianceTags.forEach((tag, index) =>
      addTerritoryTag(group, territory, tag, index, allianceTags.length, alliances, map.variant === "polygon"),
    );
    refusalTags.forEach((tag, index) =>
      addTerritoryTag(group, territory, tag, index, refusalTags.length, alliances, map.variant === "polygon"),
    );
  }
  allianceStartOverlays.forEach((overlay) => group.add(overlay));

  if (settings.showMarkers)
    for (const marker of plan.markers) {
      const alliance = alliances.find(({ id }) => id === marker.allianceId);
      if (!alliance) continue;
      const markerGroup = new Konva.Group({ x: marker.x, y: marker.y, draggable: !context.readOnly && context.tool === "select" });
      markerGroup.add(new Konva.RegularPolygon({ sides: 6, radius: 44, fill: "#101713", stroke: alliance.color, strokeWidth: 5 }));
      markerGroup.add(new Konva.Circle({ radius: 29, fill: alliance.color, opacity: 0.18 }));
      markerGroup.add(
        new Konva.Text({
          x: -38,
          y: -10,
          width: 76,
          align: "center",
          text: alliance.shortName,
          fill: alliance.color,
          fontSize: 21,
          fontStyle: "bold",
          stroke: "#09100c",
          strokeWidth: 4,
          fillAfterStrokeEnabled: true,
          listening: false,
        }),
      );
      if (!context.readOnly) {
        markerGroup.on("dragstart", callbacks.onMarkerHistory);
        markerGroup.on("dragend", () => callbacks.onMarkerMove(marker.id, markerGroup.x(), markerGroup.y()));
        markerGroup.on("dblclick dbltap", () => callbacks.onMarkerRemove(marker.id));
      }
      group.add(markerGroup);
    }

  for (const base of map.bases) {
    const alliance = alliances.find(({ id }) => id === plan.baseAssignments[base.id]);
    const color = alliance?.color ?? base.defaultColor;
    const baseGroup = new Konva.Group({ x: base.x, y: base.y });
    baseGroup.add(
      new Konva.Circle({
        radius: 52,
        fill: color,
        stroke: context.selectingStart ? "#32d47b" : "#222222",
        strokeWidth: context.selectingStart ? 6 : 2,
        shadowColor: context.selectingStart ? "#32d47b" : "transparent",
        shadowBlur: 10,
      }),
    );
    baseGroup.add(
      new Konva.Text({
        x: -58,
        y: -12,
        width: 116,
        align: "center",
        text: alliance?.shortName ?? baseIndex(base),
        fill: "#ffffff",
        fontSize: 20,
        fontStyle: "bold",
        stroke: "#111111",
        strokeWidth: 3,
        fillAfterStrokeEnabled: true,
        listening: false,
      }),
    );
    baseGroup.on("mouseenter", () => {
      stage.container().style.cursor = "pointer";
    });
    baseGroup.on("mouseleave", () => {
      stage.container().style.cursor = "default";
    });
    if (!context.readOnly)
      baseGroup.on("click tap", (event) => {
        event.cancelBubble = true;
        callbacks.onBaseClick(event.evt as MouseEvent, base);
      });
    group.add(baseGroup);
  }
  if (context.lowPowerMode)
    group.find<Konva.Shape>("Shape").forEach((shape) => {
      shape.perfectDrawEnabled(false);
      shape.shadowForStrokeEnabled(false);
      shape.shadowEnabled(false);
    });
  layer.draw();
}

function addTerritoryTag(
  group: Konva.Group,
  territory: Territory,
  tag: TerritoryTag,
  index: number,
  count: number,
  alliances: Alliance[],
  polygonMap: boolean,
): void {
  const alliance = tag.allianceId ? alliances.find(({ id }) => id === tag.allianceId) : undefined;
  const text = tag.kind === "refusal" ? "ОТКАЗ" : alliance?.shortName;
  if (!text) return;
  const allianceTag = tag.kind === "alliance";
  const color = tag.kind === "refusal" ? "#e85d75" : alliance!.color;
  const bounds = territoryBounds(territory);
  const availableWidth = Math.max(16, bounds.maxX - bounds.minX - 5);
  const width = polygonMap ? (allianceTag ? 62 : Math.min(30, availableWidth)) : allianceTag ? 120 : 68;
  const height = polygonMap
    ? allianceTag ? 18 : Math.max(6, Math.min(10, (bounds.maxY - bounds.minY - 8) / Math.max(1, count)))
    : allianceTag ? 36 : 18;
  const fontSize = polygonMap
    ? Math.max(allianceTag ? 7 : 4.5, Math.min(allianceTag ? 12 : 6.5, (width - 5) / Math.max(3, text.length * 0.72)))
    : allianceTag ? 20 : 11;
  // Center alliance badges in each cell; keep refusal badges below the cell name.
  const y = allianceTag
    ? territory.y + (bounds.minY + bounds.maxY - height) / 2 + (index - (count - 1) / 2) * (height + 1)
    : territory.y + Math.max(1, bounds.maxY * 0.12) + index * (height + 1);
  const badge = new Konva.Group({ x: territory.x - width / 2, y, listening: false });
  badge.add(
    new Konva.Rect({
      width,
      height,
      cornerRadius: height / 2,
      fill: "#101713",
      stroke: color,
      strokeWidth: polygonMap ? 1.5 : 2,
      strokeScaleEnabled: false,
      shadowColor: "#000000",
      shadowBlur: 3,
      shadowOpacity: 0.7,
    }),
  );
  badge.add(
    new Konva.Text({
      y: Math.max(0.5, (height - fontSize) / 2 - 0.5),
      width,
      align: "center",
      text,
      fill: color,
      fontSize,
      fontStyle: "bold",
    }),
  );
  group.add(badge);
}
