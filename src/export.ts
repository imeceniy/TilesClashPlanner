import Konva from "konva";
import { calculateScoreSummary } from "./score-summary";
import { STATUS } from "./tools";
import type { MapData, Plan, PlannerState, Territory, TerritoryTag } from "./types";

export const EXPORT_WARNING = "ЛОГОВА ВСЕГДА БЬЕМ ПЕРЕД СНОМ";

export function downloadFile(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProjectJson(state: PlannerState, mapId: string, date: string): void {
  const payload = { ...state, exportedAt: new Date().toISOString(), mapId };
  downloadFile(JSON.stringify(payload, null, 2), `tiles-clash-${date}.json`, "application/json");
}

interface ExportTagGroup {
  label: string;
  color: string;
  territories: Territory[];
}

export interface AllianceTerritorySummary {
  label: string;
  color: string;
  groups: Array<{ label: string; count: number }>;
}

function tagGroupsForExport(map: MapData, plan: Plan, state: PlannerState): ExportTagGroup[] {
  const territoryById = new Map(map.territories.map((territory) => [territory.id, territory]));
  const byTerritoryOrder = (left: Territory, right: Territory): number =>
    (left.bastionLevel ?? Number.MAX_SAFE_INTEGER) - (right.bastionLevel ?? Number.MAX_SAFE_INTEGER) ||
    (left.bastionIndex ?? 0) - (right.bastionIndex ?? 0) ||
    left.name.localeCompare(right.name, "ru");
  const territoriesFor = (tags: TerritoryTag[]): Territory[] =>
    tags
      .map(({ territoryId }) => territoryById.get(territoryId))
      .filter((territory): territory is Territory => Boolean(territory))
      .sort(byTerritoryOrder);
  const allianceGroups = state.alliances
    .map((alliance) => ({
      label: alliance.shortName,
      color: alliance.color,
      territories: territoriesFor(plan.territoryTags.filter((tag) => tag.kind === "alliance" && tag.allianceId === alliance.id)),
    }))
    .filter(({ territories }) => territories.length);
  const refusals = territoriesFor(plan.territoryTags.filter((tag) => tag.kind === "refusal"));
  return refusals.length ? [...allianceGroups, { label: "ОТКАЗ", color: "#e85d75", territories: refusals }] : allianceGroups;
}

export function allianceTerritorySummariesForExport(map: MapData, plan: Plan, state: PlannerState): AllianceTerritorySummary[] {
  const territoryById = new Map(map.territories.map((territory) => [territory.id, territory]));
  return state.alliances
    .map((alliance) => {
      const counts = new Map<string, number>();
      for (const tag of plan.territoryTags) {
        if (tag.kind !== "alliance" || tag.allianceId !== alliance.id) continue;
        const territory = territoryById.get(tag.territoryId);
        if (!territory) continue;
        const group = territory.name.match(/^(.+?)\.\d+$/)?.[1] ?? territory.name;
        counts.set(group, (counts.get(group) ?? 0) + 1);
      }
      const groups = [...counts]
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => left.label.localeCompare(right.label, "ru", { numeric: true }));
      return { label: alliance.shortName, color: alliance.color, groups };
    })
    .filter(({ groups }) => groups.length > 0);
}

interface PngExportOptions {
  stage: Konva.Stage;
  worldGroup: Konva.Group;
  layer: Konva.Layer;
  map: MapData;
  state: PlannerState;
  plan: Plan;
  copyToClipboard: boolean;
  highQuality?: boolean;
  notify(message: string): void;
}

export async function exportMapPng(options: PngExportOptions): Promise<void> {
  const { stage, worldGroup, layer, map, state, plan, copyToClipboard, highQuality = false, notify } = options;
  const originalSize = stage.size();
  const originalPosition = worldGroup.position();
  const originalScale = worldGroup.scale();
  const sidebarWidth = 310;
  const bannerHeight = map.eventRules === "classic" ? 88 : 0;
  const exportWidth = map.width + sidebarWidth;
  const winterAllianceExport = map.id === "winter-2026";
  const summary = winterAllianceExport ? null : calculateScoreSummary(map, plan);
  const numberFormat = new Intl.NumberFormat("ru-RU");
  const playerColor = state.alliances.find(({ isPlayerAlliance }) => isPlayerAlliance)?.color ?? STATUS.captured.color;
  const overlay = new Konva.Group({ listening: false });
  const sidebar = new Konva.Group({ x: map.width, y: 0, listening: false });
  sidebar.add(new Konva.Text({ x: 24, y: 28, width: 262, text: "TILES CLASH PLANNER", fill: "#32d47b", fontSize: 13, fontStyle: "bold" }));
  sidebar.add(
    new Konva.Text({ x: 24, y: 53, width: 262, text: plan.name.toUpperCase(), fill: "#ffffff", fontSize: 22, fontStyle: "bold" }),
  );

  const addScoreCard = (y: number, title: string, value: number, details: string, color: string): void => {
    sidebar.add(
      new Konva.Rect({ x: 20, y, width: 270, height: 105, cornerRadius: 10, fill: "#151d18", stroke: "#344139", strokeWidth: 1 }),
    );
    sidebar.add(new Konva.Text({ x: 36, y: y + 17, width: 238, text: title, fill: "#9ba89f", fontSize: 11, fontStyle: "bold" }));
    sidebar.add(
      new Konva.Text({
        x: 36,
        y: y + 41,
        width: 238,
        text: numberFormat.format(value),
        fill: color,
        fontSize: 31,
        fontStyle: "bold",
      }),
    );
    sidebar.add(new Konva.Text({ x: 36, y: y + 80, width: 238, text: details, fill: "#718077", fontSize: 11 }));
  };
  let sidebarContentBottom = 118;
  if (winterAllianceExport) {
    sidebar.add(
      new Konva.Text({ x: 24, y: 112, width: 262, text: "СОЮЗЫ И ТЕРРИТОРИИ", fill: "#9ba89f", fontSize: 12, fontStyle: "bold" }),
    );
    let y = 142;
    const allianceSummaries = allianceTerritorySummariesForExport(map, plan, state);
    if (!allianceSummaries.length) {
      sidebar.add(new Konva.Text({ x: 24, y, width: 262, text: "Территории союзов не назначены", fill: "#eaf2ec", fontSize: 14 }));
      y += 24;
    }
    for (const alliance of allianceSummaries) {
      const territoryCounts = alliance.groups.map(({ label, count }) => `${label} — ${count} шт.`).join("; ");
      const row = new Konva.Text({
        x: 24,
        y,
        width: 262,
        text: `${alliance.label}: ${territoryCounts}`,
        fill: alliance.color,
        fontSize: 14,
        fontStyle: "bold",
        lineHeight: 1.35,
        wrap: "word",
      });
      sidebar.add(row);
      y += row.height() + 12;
    }
    sidebarContentBottom = y;
  } else {
    const score = summary!;
    addScoreCard(
      118,
      "УЖЕ ЗАХВАЧЕНО",
      score.capturedPoints,
      `${score.capturedCount} территорий · ${numberFormat.format(score.capturedCopperPerHour)} меди/ч`,
      playerColor,
    );
    addScoreCard(
      235,
      "С ПЛАНИРУЕМЫМИ ЦЕЛЯМИ",
      score.theoreticalPoints,
      `всего ${score.theoreticalCount} · план +${numberFormat.format(score.plannedPoints)} · ${numberFormat.format(score.theoreticalCopperPerHour)} меди/ч`,
      STATUS.priority.color,
    );
    sidebarContentBottom = 350;
  }

  if (!winterAllianceExport && state.settings.showLegend) {
    const entries = [
      { color: playerColor, label: "Захвачено" },
      { color: STATUS.hold.color, label: "Удержать" },
      { color: STATUS.priority.color, label: "Приоритет" },
      { color: STATUS.secondary.color, label: "Не бьём" },
      { color: STATUS.noAttack.color, label: "1 удар" },
    ];
    const legend = new Konva.Group({ x: 20, y: 380 });
    legend.add(new Konva.Text({ x: 4, y: 0, width: 262, text: "ЛЕГЕНДА", fill: "#9ba89f", fontSize: 12, fontStyle: "bold" }));
    entries.forEach((entry, index) => {
      legend.add(new Konva.Circle({ x: 12, y: 38 + index * 36, radius: 8, fill: entry.color, stroke: "#ffffff55", strokeWidth: 1 }));
      legend.add(
        new Konva.Text({ x: 32, y: 29 + index * 36, width: 220, text: entry.label, fill: "#eaf2ec", fontSize: 15, fontStyle: "bold" }),
      );
    });
    sidebar.add(legend);
    sidebarContentBottom = 580;

    const tagGroups = tagGroupsForExport(map, plan, state);
    if (tagGroups.length) {
      let y = sidebarContentBottom;
      sidebar.add(new Konva.Text({ x: 24, y, width: 262, text: "НАЗНАЧЕНИЯ", fill: "#9ba89f", fontSize: 12, fontStyle: "bold" }));
      y += 29;
      tagGroups.forEach((tagGroup) => {
        sidebar.add(new Konva.Circle({ x: 31, y: y + 7, radius: 6, fill: tagGroup.color, stroke: "#ffffff55", strokeWidth: 1 }));
        sidebar.add(new Konva.Text({ x: 46, y, width: 228, text: tagGroup.label, fill: tagGroup.color, fontSize: 14, fontStyle: "bold" }));
        y += 19;
        const territoryList = new Konva.Text({
          x: 46,
          y,
          width: 228,
          text: tagGroup.territories.map(({ name }) => name).join(" · "),
          fill: "#eaf2ec",
          fontSize: 12,
          lineHeight: 1.32,
          wrap: "word",
        });
        sidebar.add(territoryList);
        y += territoryList.height() + 13;
      });
      sidebarContentBottom = y;
    }
  }
  const sidebarHeight = Math.max(map.height, sidebarContentBottom + 54);
  const exportHeight = sidebarHeight + bannerHeight;
  const sidebarBackground = new Konva.Rect({
    width: sidebarWidth,
    height: sidebarHeight,
    fill: "#0e1410",
    stroke: "#344139",
    strokeWidth: 2,
  });
  sidebar.add(sidebarBackground);
  sidebarBackground.moveToBottom();
  sidebar.add(
    new Konva.Text({
      x: 24,
      y: sidebarHeight - 34,
      width: 262,
      align: "right",
      text: "© Задов Продакшн",
      fill: "#718077",
      fontSize: 12,
      fontStyle: "bold",
    }),
  );
  if (bannerHeight) {
    const banner = new Konva.Group({ y: -bannerHeight, listening: false });
    banner.add(new Konva.Rect({ width: exportWidth, height: bannerHeight, fill: "#f28c28" }));
    banner.add(
      new Konva.Text({
        x: 24,
        y: 23,
        width: exportWidth - 48,
        align: "center",
        text: EXPORT_WARNING,
        fill: "#160b02",
        fontSize: 36,
        fontStyle: "bold",
      }),
    );
    overlay.add(banner);
  }
  if (sidebarHeight > map.height)
    overlay.add(
      new Konva.Rect({ y: map.height, width: map.width, height: sidebarHeight - map.height, fill: map.backgroundColor ?? "#090d0b" }),
    );
  overlay.add(sidebar);
  worldGroup.add(overlay);
  stage.size({ width: exportWidth, height: exportHeight });
  worldGroup.position({ x: 0, y: bannerHeight });
  worldGroup.scale({ x: 1, y: 1 });
  layer.draw();
  const dataUrl = stage.toDataURL({
    x: 0,
    y: 0,
    width: exportWidth,
    height: exportHeight,
    // A separate HD export stays below 3600px on its largest side. This is
    // noticeably sharper while avoiding the memory spikes Safari gets at 4K+.
    pixelRatio: highQuality
      ? Math.min(3, 3600 / Math.max(exportWidth, exportHeight))
      : Math.min(2, 2400 / Math.max(exportWidth, exportHeight)),
    mimeType: "image/png",
  });
  overlay.destroy();
  stage.size(originalSize);
  worldGroup.position(originalPosition);
  worldGroup.scale(originalScale);
  layer.draw();
  const blob = await (await fetch(dataUrl)).blob();
  const download = (): void => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${plan.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    notify(highQuality ? "PNG высокого качества готов" : "PNG готов");
  };
  if (copyToClipboard && navigator.clipboard?.write && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      notify("Изображение скопировано");
    } catch {
      download();
    }
  } else download();
}
