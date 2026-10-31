import Konva from "konva";
import { readServerPublicView } from "./collaboration-api";
import { CollaborationPanel } from "./collaboration-panel";
import {
  assignedBaseForAlliance as findAssignedBase,
  currentAlliance as findCurrentAlliance,
  currentEnemyAlliance as findCurrentEnemy,
  removeAllianceReferences,
  setBaseAssignment as updateBaseAssignment,
} from "./alliances";
import { exportMapPng, exportProjectJson } from "./export";
import { baseIndex, renderMapScene, renderStaticMapScene } from "./map-renderer";
import { loadMapCatalog, loadMapEntry, territoryTypeLabel } from "./map-catalog";
import { blankPlan as createBlankPlanData, currentPlan as findCurrentPlan, resetPlan as clearPlan } from "./plans";
import {
  loadState as loadPersistedState,
  parseProject,
  saveState as savePersistedState,
  STORAGE_VERSION,
  validateProjectMapReferences,
} from "./persistence";
import { assignTerritoryStatus, clonePlanForDay, findTerritories, PlannerHistory } from "./planner-store";
import { createPublicViewUrl, readPublicViewFromHash } from "./public-share";
import { calculateScoreSummary } from "./score-summary";
import { findStrategicRoute, recommendTargets, routePathToArrows, STATUS } from "./tools";
import type {
  Alliance,
  GameConfig,
  MapBase,
  MapData,
  MapCatalogEntry,
  MapLabel,
  Plan,
  PlanArrow,
  PlannerSnapshot,
  PlannerState,
  RouteResult,
  RouteAlternative,
  Territory,
  TerritoryState,
  TerritoryStatus,
  ToolName,
  ViewBox,
} from "./types";

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
};
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = <T>(value: T): T => structuredClone(value);
const today = (): string => new Date().toISOString().slice(0, 10);
const lowPowerMode = matchMedia("(max-width: 720px), (pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const MAP_SELECTION_KEY = "tiles-clash-planner:selected-map";

interface PanState {
  x: number;
  y: number;
  box: ViewBox;
  moved: boolean;
}
interface PinchState {
  distance: number;
  centerX: number;
  centerY: number;
  box: ViewBox;
}

let mapData!: MapData;
let gameConfig!: GameConfig;
let mapCatalog: MapCatalogEntry[] = [];
let state!: PlannerState;
let tool: ToolName = "select";
let activeAllianceId = "ust";
let routeStart: string | null = null;
const history = new PlannerHistory();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let spaceDown = false;
let pan: PanState | null = null;
let pinch: PinchState | null = null;
let activeBaseId: string | null = null;
let startSelectionAllianceId: string | null = null;
let stage!: Konva.Stage;
let sceneLayer!: Konva.Layer;
let worldGroup!: Konva.Group;
let staticMapGroup!: Konva.Group;
let mapContentGroup!: Konva.Group;
let staticConnections!: Konva.Group;
let searchHitId: string | null = null;
let viewBox: ViewBox = { x: 0, y: 0, width: 1280, height: 1246 };
let routePreview: RouteResult | null = null;
let routeTargetId: string | null = null;
let readOnlyMode = false;
let publicViewMode = false;
let pendingGestureViewBox: ViewBox | null = null;
let gestureFrame = 0;
let suppressMapClickUntil = 0;
let recommendationTimer: ReturnType<typeof setTimeout> | undefined;
let collaboration: CollaborationPanel | undefined;

function blankPlan(name = "День 1"): Plan {
  return createBlankPlanData(id(), name, today());
}

function defaultState(map = mapData): PlannerState {
  const plan = blankPlan("День 1");
  return {
    version: STORAGE_VERSION,
    currentPlanId: plan.id,
    plans: [plan],
    alliances: [
      { id: "ust", name: "Ваш союз", shortName: "UST", color: "#32d47b", isPlayerAlliance: true },
      { id: "enemy-abc", name: "Северный альянс", shortName: "ABC", color: "#7367e8", isPlayerAlliance: false },
      { id: "enemy-xyz", name: "Западный альянс", shortName: "XYZ", color: "#e47b4f", isPlayerAlliance: false },
    ],
    settings: {
      showNames: map?.variant !== "polygon",
      showValues: false,
      showEnemies: true,
      showNeutral: true,
      showArrows: true,
      showConnections: map?.variant !== "polygon",
      showLabels: true,
      showMarkers: true,
      showLegend: true,
      showStrategic: false,
      viewBox: null,
    },
  };
}

function mapStorageScope(): string | undefined {
  return mapData.eventRules === "classic" ? undefined : mapData.id;
}
function loadState(): PlannerState {
  return loadPersistedState(localStorage, defaultState(), mapStorageScope());
}
function currentPlan(): Plan {
  return findCurrentPlan(state);
}
function currentAlliance(): Alliance {
  return findCurrentAlliance(state.alliances, activeAllianceId);
}
function currentEnemyAlliance(): Alliance | undefined {
  return findCurrentEnemy(state.alliances, activeAllianceId);
}

function scheduleSave(): void {
  if (readOnlyMode) return;
  const indicator = $("#saveState");
  indicator.classList.add("saving");
  if (indicator.lastChild) indicator.lastChild.textContent = " Сохраняем…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    savePersistedState(localStorage, state, mapStorageScope());
    collaboration?.onLocalChange();
    indicator.classList.remove("saving");
    if (indicator.lastChild) indicator.lastChild.textContent = " Сохранено";
  }, 450);
}

function pushHistory(): void {
  if (readOnlyMode) return;
  history.push(state);
  updateUndoButtons();
}

function restoreSnapshot(snapshot: PlannerSnapshot): void {
  state.plans = snapshot.plans;
  state.alliances = snapshot.alliances;
  state.currentPlanId = snapshot.currentPlanId;
  routeStart = null;
  startSelectionAllianceId = null;
  tool = "select";
  renderAll();
  scheduleSave();
}

function undo(): void {
  const snapshot = history.undo(state);
  if (!snapshot) return;
  restoreSnapshot(snapshot);
  updateUndoButtons();
}

function redo(): void {
  const snapshot = history.redo(state);
  if (!snapshot) return;
  restoreSnapshot(snapshot);
  updateUndoButtons();
}

function updateUndoButtons(): void {
  $("#undoBtn").toggleAttribute("disabled", !history.past.length);
  $("#redoBtn").toggleAttribute("disabled", !history.future.length);
}

function commit(message?: string): void {
  currentPlan().updatedAt = Date.now();
  renderMap();
  renderPlanControls();
  scheduleSave();
  if (message) showToast(message);
}

function showToast(message: string): void {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2300);
}

function getTerritory(idValue: string): Territory | undefined {
  return mapData.territories.find((territory) => territory.id === idValue);
}

function territoryState(territoryId: string): TerritoryState {
  return currentPlan().territories[territoryId] || { territoryId, status: "neutral" };
}

function isCopperMap(): boolean {
  return mapData.eventRules === "copper";
}

function territoryMetrics(territory: Territory): string {
  const parts = [`${territory.value} очков`];
  if (isCopperMap()) parts.push(`${territory.copperPerHour ?? 0} меди/ч`);
  return parts.join(" · ");
}

function renderMap(): void {
  const plan = currentPlan();
  renderScoreSummary(plan);
  renderMapScene({
    group: mapContentGroup,
    layer: sceneLayer,
    stage,
    map: mapData,
    gameConfig,
    plan,
    alliances: state.alliances,
    settings: state.settings,
    tool,
    searchHitId,
    selectingStart: tool === "allianceStart" && Boolean(startSelectionAllianceId),
    routePreview,
    routeTargetId,
    readOnly: readOnlyMode,
    lowPowerMode,
    callbacks: {
      territoryState,
      onTerritoryClick,
      onTerritoryContext: openTerritoryMenu,
      onArrowEdit: editArrow,
      onArrowRemove: removeArrow,
      onLabelHistory: pushHistory,
      onLabelMove: (label, x, y) => {
        label.x = x;
        label.y = y;
        scheduleSave();
      },
      onLabelEdit: editLabel,
      onMarkerHistory: pushHistory,
      onMarkerMove: (markerId, x, y) => {
        const marker = plan.markers.find(({ id }) => id === markerId);
        if (marker) {
          marker.x = x;
          marker.y = y;
          scheduleSave();
        }
      },
      onMarkerRemove: removeMarker,
      onBaseClick: (event, base) => {
        if (performance.now() < suppressMapClickUntil) return;
        if (tool === "allianceStart" && startSelectionAllianceId) assignStartBase(base.id, startSelectionAllianceId);
        else openBasePicker(event, base);
      },
    },
  });
  staticConnections.visible(state.settings.showConnections);
  applyViewBox();
  $("#planTitle").textContent = plan.name.toUpperCase();
  $("#mapCaptionName").textContent = mapData.name.toUpperCase();
  $("#mapCanvas").setAttribute("aria-label", `Интерактивная карта «${mapData.name}» на Konva Canvas`);
  $("#territoryCount").textContent = `${mapData.territories.length} объектов`;
  updateRouteHint();
  updateStartHint();
}

function renderScoreSummary(plan: Plan): void {
  const summary = calculateScoreSummary(mapData, plan);
  const points = new Intl.NumberFormat("ru-RU");
  $("#capturedScore").textContent = points.format(summary.capturedPoints);
  $("#theoreticalScore").textContent = points.format(summary.theoreticalPoints);
  $("#capturedScoreDetails").textContent = `${summary.capturedCount} территорий · ${points.format(summary.capturedCopperPerHour)} меди/ч`;
  $("#theoreticalScoreDetails").textContent =
    `всего ${summary.theoreticalCount} · план +${points.format(summary.plannedPoints)} · ${points.format(summary.theoreticalCopperPerHour)} меди/ч`;
}
type StartNode = MapBase | Territory;

function assignedBaseForAlliance(allianceId: string): StartNode | undefined {
  const fixedBase = findAssignedBase(currentPlan(), mapData.bases, allianceId);
  if (fixedBase) return fixedBase;
  const entry = Object.entries(currentPlan().baseAssignments).find(([, idValue]) => idValue === allianceId);
  return entry ? mapData.territories.find(({ id: territoryId }) => territoryId === entry[0]) : undefined;
}

function startNodeLabel(node: StartNode): string {
  return "defaultColor" in node ? baseIndex(node) : node.name;
}

function setBaseAssignment(baseId: string, allianceId: string | null): void {
  updateBaseAssignment(currentPlan(), baseId, allianceId);
}

function openBasePicker(event: MouseEvent, base: MapBase): void {
  event.preventDefault();
  event.stopPropagation();
  activeBaseId = base.id;
  hideContextMenu();
  const picker = $("#basePicker");
  const select = $<HTMLSelectElement>("#baseAllianceSelect");
  $("#basePickerTitle").textContent = base.name;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— Не назначена —";
  select.append(empty);
  state.alliances.forEach((alliance) => {
    const option = document.createElement("option");
    option.value = alliance.id;
    option.textContent = `${alliance.shortName} · ${alliance.isPlayerAlliance ? "Ваш союз" : "Противник"}`;
    select.append(option);
  });
  select.value = currentPlan().baseAssignments?.[base.id] || "";
  picker.hidden = false;
  picker.style.left = `${Math.min(event.clientX + 8, innerWidth - 290)}px`;
  picker.style.top = `${Math.min(event.clientY + 8, innerHeight - 190)}px`;
  requestAnimationFrame(() => select.focus());
}

function assignBase(allianceId: string): void {
  if (!activeBaseId) return;
  pushHistory();
  setBaseAssignment(activeBaseId, allianceId);
  $("#basePicker").hidden = true;
  renderAlliances();
  renderRouteRecommendations();
  commit(
    allianceId ? `База назначена союзу ${state.alliances.find((item) => item.id === allianceId)?.shortName}` : "Назначение базы снято",
  );
}

function assignStartBase(baseId: string, allianceId: string): void {
  const alliance = state.alliances.find((item) => item.id === allianceId);
  const base = mapData.bases.find((item) => item.id === baseId) ?? mapData.territories.find((item) => item.id === baseId);
  if (!alliance || !base) return;
  pushHistory();
  setBaseAssignment(base.id, alliance.id);
  startSelectionAllianceId = null;
  setTool("select");
  renderAlliances();
  renderRouteRecommendations();
  commit(`Старт союза ${alliance.shortName}: ${startNodeLabel(base)}`);
}

function onTerritoryClick(event: Event, territory: Territory): void {
  event.stopPropagation();
  if (performance.now() < suppressMapClickUntil) return;
  hideContextMenu();
  $("#selectionInfo").textContent = `${territory.name} · ${territoryTypeLabel(territory)} · ${territoryMetrics(territory)}`;
  if (readOnlyMode) return;
  if (tool === "routeTarget") {
    $<HTMLSelectElement>("#routeTargetSelect").value = territory.id;
    setTool("select");
    calculateStrategicRoute(territory.id);
    return;
  }
  if (tool === "allianceStart" && startSelectionAllianceId) {
    if (!mapData.bases.length) assignStartBase(territory.id, startSelectionAllianceId);
    else showToast("Выберите одну из цветных стартовых точек по краям карты");
    return;
  }
  if (tool === "allianceTag") {
    toggleAllianceTag(territory.id, currentAlliance().id);
    return;
  }
  if (tool === "refusalTag") {
    toggleRefusalTag(territory.id);
    return;
  }
  if ((["captured", "hold", "priority", "secondary", "noAttack", "neutral", "ignore", "enemy"] as ToolName[]).includes(tool)) {
    const status = tool as TerritoryStatus;
    pushHistory();
    assignTerritoryStatus(currentPlan(), territory.id, status, status === "enemy" ? (currentEnemyAlliance()?.id ?? null) : null);
    renderRouteRecommendations();
    commit(`${territory.name}: ${STATUS[status].label}`);
    return;
  }
  if (tool === "arrow") {
    if (!routeStart) {
      routeStart = territory.id;
    } else if (routeStart !== territory.id) {
      pushHistory();
      currentPlan().arrows.push({
        id: id(),
        fromTerritoryId: routeStart,
        toTerritoryId: territory.id,
        color: "#ff5a5f",
        width: 8,
        dashed: false,
      });
      routeStart = territory.id;
      commit("Участок маршрута добавлен");
    }
    updateRouteHint();
    return;
  }
  if (tool === "select") openTerritoryMenu(event as MouseEvent, territory);
}

function setTerritoryStatus(territoryId: string, status: TerritoryStatus): void {
  pushHistory();
  assignTerritoryStatus(currentPlan(), territoryId, status, status === "enemy" ? currentEnemyAlliance()?.id : null);
  hideContextMenu();
  renderRouteRecommendations();
  commit();
}

function openTerritoryMenu(event: MouseEvent, territory: Territory): void {
  if (readOnlyMode) return;
  event.preventDefault();
  event.stopPropagation();
  const menu = $("#contextMenu");
  const item = territoryState(territory.id);
  menu.innerHTML = `<header><strong>${territory.name}</strong><small>${territoryTypeLabel(territory)} ${territory.size === "—" ? "" : territory.size} · ${territoryMetrics(territory)}</small></header>`;
  if (isCopperMap()) {
    const tags = currentPlan().territoryTags.filter(({ territoryId }) => territoryId === territory.id);
    state.alliances.forEach((alliance) => {
      const assigned = tags.some((tag) => tag.kind === "alliance" && tag.allianceId === alliance.id);
      const button = document.createElement("button");
      button.innerHTML = `<i style="--c:${alliance.color}"></i>${assigned ? "✓ " : ""}Союз: ${escapeHtml(alliance.shortName)}`;
      button.addEventListener("click", () => toggleAllianceTag(territory.id, alliance.id));
      menu.append(button);
    });
    const refused = tags.some((tag) => tag.kind === "refusal");
    const refusalButton = document.createElement("button");
    refusalButton.innerHTML = `<i style="--c:#e85d75"></i>${refused ? "✓ " : ""}Отказ`;
    refusalButton.addEventListener("click", () => toggleRefusalTag(territory.id));
    menu.append(refusalButton);
  }
  for (const status of ["captured", "hold", "priority", "secondary", "noAttack", "enemy", "neutral", "ignore"] as TerritoryStatus[]) {
    const button = document.createElement("button");
    const statusColor =
      status === "captured"
        ? (state.alliances.find(({ isPlayerAlliance }) => isPlayerAlliance)?.color ?? STATUS.captured.color)
        : STATUS[status].color;
    button.innerHTML = `<i style="--c:${statusColor}"></i>${item.status === status ? "✓ " : ""}${STATUS[status].label}`;
    button.addEventListener("click", () => setTerritoryStatus(territory.id, status));
    menu.append(button);
  }
  const arrowButton = document.createElement("button");
  arrowButton.textContent = "➜ Начать маршрут отсюда";
  arrowButton.addEventListener("click", () => {
    setTool("arrow");
    routeStart = territory.id;
    hideContextMenu();
    updateRouteHint();
  });
  menu.append(arrowButton);
  const emphasizeButton = document.createElement("button");
  emphasizeButton.textContent = `${item.emphasized ? "✓ " : ""}Aa Крупное название`;
  emphasizeButton.addEventListener("click", () => toggleTerritoryEmphasis(territory));
  menu.append(emphasizeButton);
  const noteButton = document.createElement("button");
  noteButton.textContent = item.note ? "📝 Изменить заметку" : "📝 Добавить заметку";
  noteButton.addEventListener("click", () => editTerritoryNote(territory));
  menu.append(noteButton);
  const infoButton = document.createElement("button");
  infoButton.textContent = "ⓘ Информация";
  infoButton.addEventListener("click", () => {
    hideContextMenu();
    const config = territory.type === "lair" ? gameConfig.lairs[territory.size] : gameConfig.workbenches[territory.size];
    alert(
      `${territory.name}\n${territoryTypeLabel(territory)}${territory.size === "—" ? "" : ` · ${territory.size}`}\nДаёт очков: ${territory.value}${isCopperMap() ? `\nДобыча меди: ${territory.copperPerHour ?? 0}/ч` : ""}${config?.efficiency ? `\nЭффективность: ×${config.efficiency.toFixed(2)}` : ""}${item.note ? `\nЗаметка: ${item.note}` : ""}`,
    );
  });
  menu.append(infoButton);
  menu.hidden = false;
  const left = Math.min(event.clientX, innerWidth - 230);
  const top = Math.min(event.clientY, innerHeight - 365);
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function toggleTerritoryEmphasis(territory: Territory): void {
  const previous = territoryState(territory.id);
  pushHistory();
  if (previous.emphasized) {
    if (previous.status === "neutral" && !previous.note) delete currentPlan().territories[territory.id];
    else {
      currentPlan().territories[territory.id] = { ...previous };
      delete currentPlan().territories[territory.id]!.emphasized;
    }
  } else currentPlan().territories[territory.id] = { ...previous, territoryId: territory.id, emphasized: true };
  hideContextMenu();
  commit(previous.emphasized ? `${territory.name}: обычное название` : `${territory.name}: крупное название`);
}

function editTerritoryNote(territory: Territory): void {
  const previous = territoryState(territory.id);
  const note = prompt(`Заметка для ${territory.name}`, previous.note || "");
  if (note === null) return;
  pushHistory();
  if (note.trim()) currentPlan().territories[territory.id] = { ...previous, territoryId: territory.id, note: note.trim() };
  else if (previous.status === "neutral" && !previous.emphasized) delete currentPlan().territories[territory.id];
  else delete currentPlan().territories[territory.id]!.note;
  hideContextMenu();
  commit(note.trim() ? "Заметка сохранена" : "Заметка удалена");
}

function hideContextMenu(): void {
  $("#contextMenu").hidden = true;
}

function hideBasePicker(): void {
  $("#basePicker").hidden = true;
}

function setTool(nextTool: ToolName): void {
  if (!isCopperMap() && (nextTool === "allianceTag" || nextTool === "refusalTag")) return;
  if (nextTool !== "allianceStart") startSelectionAllianceId = null;
  if (nextTool === "enemy" && currentAlliance()?.isPlayerAlliance) {
    const enemy = state.alliances.find((alliance) => !alliance.isPlayerAlliance);
    if (enemy) {
      activeAllianceId = enemy.id;
      renderAlliances();
      showToast(`Противник: ${enemy.shortName}`);
    }
  }
  tool = nextTool;
  routeStart = nextTool === "arrow" ? routeStart : null;
  document.querySelectorAll<HTMLButtonElement>(".tool").forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateToolGuidance();
  $("#finishRoute").hidden = tool !== "arrow";
  if (stage)
    stage.container().style.cursor = ["label", "marker", "allianceStart", "routeTarget", "allianceTag", "refusalTag"].includes(tool)
      ? "crosshair"
      : "default";
  updateRouteHint();
  updateStartHint();
}

function updateToolGuidance(): void {
  const guidance: Partial<Record<ToolName, string>> = {
    select: "Выбор: нажмите территорию, чтобы открыть её меню. Перетаскивайте карту пальцем или мышью.",
    allianceTag: `Союз: ${currentAlliance().shortName}. Нажмите точку для назначения; повторное нажатие снимает метку.`,
    refusalTag: "Отказ: нажмите точку, чтобы поставить или снять метку. Она не заменяет метки союзов.",
    enemy: `Противник: выбран ${currentEnemyAlliance()?.shortName ?? "союз не выбран"}. Нажмите территории противника.`,
    arrow: "Маршрут: последовательно нажимайте точки, затем завершите маршрут.",
    label: "Текст: нажмите свободное место на карте и введите подпись.",
    marker: `Маркер: нажмите свободное место, чтобы поставить маркер ${currentAlliance().shortName}.`,
    allianceStart: "Старт союза: нажмите стартовую точку на карте.",
    routeTarget: "Автомаршрут: нажмите конечную территорию на карте.",
  };
  $("#toolGuidance").textContent =
    guidance[tool] ?? `${STATUS[tool as TerritoryStatus]?.label ?? "Инструмент"}: нажимайте территории на карте.`;
}

function toggleAllianceTag(territoryId: string, allianceId: string): void {
  if (!isCopperMap()) return;
  const plan = currentPlan();
  const existing = plan.territoryTags.find(
    (tag) => tag.territoryId === territoryId && tag.kind === "alliance" && tag.allianceId === allianceId,
  );
  pushHistory();
  if (existing) plan.territoryTags = plan.territoryTags.filter(({ id: tagId }) => tagId !== existing.id);
  else plan.territoryTags.push({ id: id(), territoryId, kind: "alliance", allianceId });
  hideContextMenu();
  renderTerritoryAssignments();
  const territory = getTerritory(territoryId);
  const alliance = state.alliances.find(({ id: candidateId }) => candidateId === allianceId);
  commit(existing ? `${territory?.name}: союз снят` : `${territory?.name}: ${alliance?.shortName}`);
}

function toggleRefusalTag(territoryId: string): void {
  if (!isCopperMap()) return;
  const plan = currentPlan();
  const existing = plan.territoryTags.find((tag) => tag.territoryId === territoryId && tag.kind === "refusal");
  pushHistory();
  if (existing) plan.territoryTags = plan.territoryTags.filter(({ id: tagId }) => tagId !== existing.id);
  else plan.territoryTags.push({ id: id(), territoryId, kind: "refusal" });
  hideContextMenu();
  renderTerritoryAssignments();
  const territory = getTerritory(territoryId);
  commit(existing ? `${territory?.name}: отказ снят` : `${territory?.name}: отказ`);
}

function updateRouteHint(): void {
  const hint = $("#routeHint");
  hint.hidden = tool !== "arrow";
  if (tool === "arrow") {
    const current = routeStart && getTerritory(routeStart);
    const text = hint.querySelector("span");
    if (text) text.textContent = current ? `${current.name} → выберите следующую территорию` : "Выберите первую территорию";
  }
}

function finishRoute(): void {
  routeStart = null;
  setTool("select");
  showToast("Маршрут завершён");
}

function beginAllianceStart(allianceId: string): void {
  const alliance = state.alliances.find((item) => item.id === allianceId);
  if (!alliance) return;
  activeAllianceId = alliance.id;
  startSelectionAllianceId = alliance.id;
  setTool("allianceStart");
  renderAlliances();
  showToast(
    mapData.bases.length
      ? `Выберите цветную стартовую точку для ${alliance.shortName}`
      : `Выберите стартовую территорию для ${alliance.shortName}`,
  );
}

function cancelAllianceStart(): void {
  const wasSelecting = tool === "allianceStart";
  startSelectionAllianceId = null;
  setTool("select");
  renderAlliances();
  if (wasSelecting) showToast("Выбор старта отменён");
}

function clearAllianceStart(allianceId: string): void {
  const plan = currentPlan();
  const base = assignedBaseForAlliance(allianceId);
  if (!base) return;
  const alliance = state.alliances.find((item) => item.id === allianceId);
  pushHistory();
  delete plan.baseAssignments[base.id];
  if (startSelectionAllianceId === allianceId) {
    startSelectionAllianceId = null;
    setTool("select");
  }
  renderAlliances();
  renderRouteRecommendations();
  commit(`Старт союза ${alliance?.shortName || ""} снят`);
}

function updateStartHint(): void {
  const hint = $("#startHint");
  if (!hint) return;
  const alliance = state.alliances.find((item) => item.id === startSelectionAllianceId);
  hint.hidden = tool !== "allianceStart" || !alliance;
  const text = hint.querySelector("span");
  if (alliance && text)
    text.textContent = mapData.bases.length
      ? `Выберите точку NW, NE, W, E, SW, SE, SSW или SSE для ${alliance.shortName}`
      : `Выберите любую активную территорию для ${alliance.shortName}`;
}

function removeArrow(arrowId: string): void {
  if (!confirm("Удалить стрелку?")) return;
  pushHistory();
  currentPlan().arrows = currentPlan().arrows.filter((arrow) => arrow.id !== arrowId);
  commit("Стрелка удалена");
}

function editArrow(arrow: PlanArrow): void {
  const currentFrom = getTerritory(arrow.fromTerritoryId);
  const currentTo = getTerritory(arrow.toTerritoryId);
  const fromText = prompt("Начальная территория: название или ID", currentFrom?.name || arrow.fromTerritoryId);
  if (fromText === null) return;
  const toText = prompt("Конечная территория: название или ID", currentTo?.name || arrow.toTerritoryId);
  if (toText === null) return;
  const resolveTerritory = (value: string, fallback: Territory | undefined): Territory | undefined =>
    mapData.territories.find((territory) => territory.id.toUpperCase() === value.trim().toUpperCase()) ||
    mapData.territories.find((territory) => territory.name.toUpperCase() === value.trim().toUpperCase()) ||
    fallback;
  const from = resolveTerritory(fromText, currentFrom);
  const to = resolveTerritory(toText, currentTo);
  if (!from || !to || from.id === to.id) {
    alert("Не удалось определить разные начальную и конечную территории");
    return;
  }
  const color = prompt("Цвет стрелки (HEX)", arrow.color || "#ff5a5f");
  if (color === null) return;
  const widthText = prompt("Толщина стрелки (2–20)", String(arrow.width || 8));
  if (widthText === null) return;
  const dashedText = prompt("Пунктирная линия? да / нет", arrow.dashed ? "да" : "нет");
  if (dashedText === null) return;
  const label = prompt("Подпись стрелки (можно оставить пустой)", arrow.label || "");
  if (label === null) return;
  const width = Math.min(20, Math.max(2, Number(widthText) || 8));
  pushHistory();
  arrow.fromTerritoryId = from.id;
  arrow.toTerritoryId = to.id;
  if (/^#[0-9a-f]{6}$/i.test(color.trim())) arrow.color = color.trim();
  arrow.width = width;
  arrow.dashed = /^(да|yes|1|true)$/i.test(dashedText.trim());
  arrow.label = label.trim();
  commit("Стрелка изменена");
}

function editLabel(label: MapLabel): void {
  const text = prompt("Текст подписи", label.text);
  if (!text?.trim()) return;
  const sizeText = prompt("Размер текста (14–72)", String(label.size || 36));
  if (sizeText === null) return;
  const color = prompt("Цвет текста (HEX)", label.color || "#ffffff");
  if (color === null) return;
  pushHistory();
  label.text = text.trim();
  label.size = Math.min(72, Math.max(14, Number(sizeText) || 36));
  if (/^#[0-9a-f]{6}$/i.test(color.trim())) label.color = color.trim();
  commit();
}

function removeMarker(markerId: string): void {
  if (!confirm("Удалить маркер?")) return;
  pushHistory();
  currentPlan().markers = currentPlan().markers.filter((marker) => marker.id !== markerId);
  commit();
}

function stagePoint(): { x: number; y: number } {
  const pointer = stage.getPointerPosition();
  if (!pointer) return { x: mapData.width / 2, y: mapData.height / 2 };
  return worldGroup.getAbsoluteTransform().copy().invert().point(pointer);
}

function addMarker(x: number, y: number): void {
  const alliance = currentAlliance();
  pushHistory();
  currentPlan().markers.push({ id: id(), x, y, allianceId: alliance.id });
  commit(`База ${alliance.shortName} добавлена`);
  setTool("select");
}

function onMapClick(): void {
  hideContextMenu();
  const point = stagePoint();
  if (tool === "label") {
    const text = prompt("Подпись на карте", "Главный удар");
    if (!text?.trim()) return;
    pushHistory();
    currentPlan().labels.push({ id: id(), x: point.x, y: point.y, text: text.trim(), size: 36, color: "#ffffff" });
    commit("Подпись добавлена");
    setTool("select");
  } else if (tool === "marker") {
    addMarker(point.x, point.y);
  }
}

function renderPlanControls(): void {
  for (const select of [$<HTMLSelectElement>("#planSelect"), $<HTMLSelectElement>("#mobilePlanSelect")]) {
    select.replaceChildren();
    state.plans.forEach((plan) => {
      const option = document.createElement("option");
      option.value = plan.id;
      option.textContent = plan.name;
      option.selected = plan.id === state.currentPlanId;
      select.append(option);
    });
  }
  $("#planTitle").textContent = currentPlan().name.toUpperCase();
}

function renderRouteControls(): void {
  const select = $<HTMLSelectElement>("#routeTargetSelect");
  const selected = select.value || routeTargetId || "";
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Выберите территорию —";
  select.append(placeholder);
  const sorted = [...mapData.territories].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ru"));
  for (const territory of sorted) {
    const option = document.createElement("option");
    option.value = territory.id;
    const efficiency = territory.type === "workbench" ? gameConfig.workbenches[territory.size]?.efficiency : undefined;
    option.textContent = `${territory.name} · ${territoryTypeLabel(territory)} · ${territoryMetrics(territory)}${efficiency ? ` · ×${efficiency.toFixed(2)}` : ""}`;
    select.append(option);
  }
  if (sorted.some(({ id }) => id === selected)) select.value = selected;
  updateRouteResult();
  renderRouteRecommendations();
}

function routeNodeName(nodeId: string): string {
  return (
    mapData.bases
      .find(({ id }) => id === nodeId)
      ?.id.replace("base-", "")
      .toUpperCase() ??
    getTerritory(nodeId)?.name ??
    nodeId
  );
}

function routeSummary(route: RouteAlternative): string {
  return [`${route.uncapturedCount} новых`, `${route.enemyCount} вражеских`].join(" · ");
}

function renderRouteAlternatives(): void {
  const container = $("#routeAlternatives");
  container.replaceChildren();
  const alternatives = routePreview?.alternatives ?? [];
  container.hidden = alternatives.length < 2;
  alternatives.forEach((alternative, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", alternative.path.join(">") === routePreview?.path.join(">"));
    button.innerHTML = `<strong>Вариант ${index + 1}</strong><br>${escapeHtml(routeSummary(alternative))}`;
    button.addEventListener("click", () => {
      if (!routePreview) return;
      routePreview = { ...routePreview, ...alternative };
      const sequence = alternative.path.map(routeNodeName).join(" → ");
      updateRouteResult(`${sequence}\n${routeSummary(alternative)}`, true);
      renderRouteAlternatives();
      renderMap();
    });
    container.append(button);
  });
}

function renderRouteRecommendations(): void {
  const container = $("#routeRecommendations");
  clearTimeout(recommendationTimer);
  container.replaceChildren();
  const base = assignedBaseForAlliance(activeAllianceId);
  if (!base) {
    container.textContent = "Сначала назначьте старт союза.";
    return;
  }
  if (readOnlyMode) return;
  container.textContent = "Рассчитываем…";
  const planId = currentPlan().id;
  recommendationTimer = setTimeout(
    () => {
      if (currentPlan().id !== planId) return;
      const recommendations = recommendTargets(mapData, base.id, currentPlan(), gameConfig);
      container.replaceChildren();
      for (const recommendation of recommendations) {
        const territory = getTerritory(recommendation.territoryId);
        if (!territory) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = `<strong>${escapeHtml(territory.name)} · ×${recommendation.efficiency.toFixed(2)}</strong><br>${recommendation.uncapturedCount} новых территорий`;
        button.addEventListener("click", () => {
          $<HTMLSelectElement>("#routeTargetSelect").value = territory.id;
          calculateStrategicRoute(territory.id);
        });
        container.append(button);
      }
    },
    lowPowerMode ? 180 : 30,
  );
}

function calculateStrategicRoute(targetId = $<HTMLSelectElement>("#routeTargetSelect").value): void {
  routeTargetId = targetId || null;
  routePreview = null;
  if (!routeTargetId) {
    updateRouteResult("Выберите конечную цель.", false);
    renderRouteAlternatives();
    renderMap();
    return;
  }
  const base = assignedBaseForAlliance(activeAllianceId);
  if (!base) {
    updateRouteResult(`Для союза ${currentAlliance().shortName} не назначена стартовая точка.`, false);
    renderRouteAlternatives();
    renderMap();
    return;
  }
  routePreview = findStrategicRoute(mapData, base.id, routeTargetId, currentPlan(), gameConfig);
  if (!routePreview.reachable) updateRouteResult(routePreview.reason ?? "Доступный путь не найден.", false);
  else {
    const sequence = routePreview.path.map(routeNodeName).join(" → ");
    updateRouteResult(`${sequence}\n${routeSummary(routePreview as RouteAlternative)}`, true);
  }
  renderRouteAlternatives();
  renderMap();
}

function updateRouteResult(message?: string, success?: boolean): void {
  const result = $("#routeResult");
  if (message !== undefined) result.textContent = message;
  result.classList.toggle("success", success === true);
  result.classList.toggle("error", success === false);
  $<HTMLButtonElement>("#addCalculatedRoute").disabled = !routePreview?.reachable;
}

function addCalculatedRoute(): void {
  if (!routePreview?.reachable) return;
  const arrows = routePathToArrows(routePreview.path, mapData, id);
  if (!arrows.length) {
    showToast("Цель напрямую соединена со стартовой базой");
    return;
  }
  pushHistory();
  currentPlan().arrows.push(...arrows);
  commit(`Маршрут добавлен: ${arrows.length} участков`);
}

function markdownToHtml(markdown: string): string {
  const inline = (value: string): string =>
    escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inCode = false;
  let inList = false;
  const closeList = (): void => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const list = line.match(/^[-*]\s+(.+)$/);
    if (list) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(list[1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim()) html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) html.push("</code></pre>");
  return html.join("");
}

async function openHelp(): Promise<void> {
  const modal = $("#helpModal");
  modal.hidden = false;
  const content = $("#helpContent");
  if (!content.dataset.loaded) {
    try {
      const response = await fetch("./README.md");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      content.innerHTML = markdownToHtml(await response.text());
      content.dataset.loaded = "true";
    } catch (error: unknown) {
      content.textContent = `Не удалось загрузить справку: ${error instanceof Error ? error.message : "неизвестная ошибка"}`;
    }
  }
}

function closeHelp(): void {
  $("#helpModal").hidden = true;
}

function nextDayName(): string {
  const used = new Set(state.plans.map(({ name }) => name.trim().toLocaleLowerCase("ru")));
  let day = 1;
  while (used.has(`день ${day}`)) day += 1;
  return `День ${day}`;
}

function clonePlan(): void {
  const source = currentPlan();
  const suggested = nextDayName();
  const name = prompt("Название нового плана", suggested);
  if (!name?.trim()) return;
  pushHistory();
  const next = clonePlanForDay(source, id(), name.trim(), today());
  state.plans.push(next);
  state.currentPlanId = next.id;
  renderAll();
  scheduleSave();
  showToast(`${next.name} создан из ${source.name}`);
}

function createBlankPlan(): void {
  const name = prompt("Название нового плана", nextDayName())?.trim();
  if (!name) return;
  pushHistory();
  const plan = blankPlan(name);
  state.plans.push(plan);
  state.currentPlanId = plan.id;
  setTool("select");
  renderAll();
  scheduleSave();
  showToast(`Создан пустой план «${name}»`);
}

function renameCurrentPlan(): void {
  const plan = currentPlan();
  const name = prompt("Новое название плана", plan.name)?.trim();
  if (!name || name === plan.name) return;
  pushHistory();
  plan.name = name;
  plan.updatedAt = Date.now();
  renderPlanControls();
  scheduleSave();
  showToast("План переименован");
}

function deleteCurrentPlan(): void {
  if (state.plans.length === 1) {
    alert("Нельзя удалить единственный план. Можно очистить его или создать новый.");
    return;
  }
  const plan = currentPlan();
  if (!confirm(`Удалить план «${plan.name}»?`)) return;
  pushHistory();
  const index = state.plans.findIndex((item) => item.id === plan.id);
  state.plans.splice(index, 1);
  state.currentPlanId = state.plans[Math.max(0, index - 1)].id;
  renderAll();
  scheduleSave();
  showToast("План удалён");
}

function renderAlliances(): void {
  const list = $("#allianceList");
  list.replaceChildren();
  const playerColor = state.alliances.find(({ isPlayerAlliance }) => isPlayerAlliance)?.color ?? STATUS.captured.color;
  document.documentElement.style.setProperty("--captured-color", playerColor);
  state.alliances.forEach((alliance) => {
    const startBase = assignedBaseForAlliance(alliance.id);
    const item = document.createElement("div");
    item.className = `alliance${alliance.id === activeAllianceId ? " active" : ""}${startSelectionAllianceId === alliance.id ? " choosing-start" : ""}`;
    item.style.setProperty("--alliance", alliance.color);
    item.innerHTML = `<div class="alliance-badge">${escapeHtml(alliance.shortName)}</div><div class="alliance-info"><strong>${escapeHtml(alliance.shortName)}</strong><small>${alliance.isPlayerAlliance ? "Ваш союз" : "Противник"}</small><small class="alliance-start-label">${startBase ? `Старт: ${escapeHtml(startNodeLabel(startBase))}` : "Старт не выбран"}</small></div><div class="alliance-actions"><button class="start-point-button" type="button" title="${startBase ? "Изменить старт" : "Выбрать старт"}">${startSelectionAllianceId === alliance.id ? "Выберите точку на карте…" : startBase ? "Изменить" : "Выбрать старт"}</button>${startBase ? '<button class="clear-start-button" type="button" title="Снять старт">×</button>' : ""}<button class="edit-alliance-button" type="button" title="Переименовать союз" aria-label="Переименовать союз ${escapeHtml(alliance.shortName)}">✎</button><label class="alliance-color-control" title="Изменить цвет"><input class="alliance-color-input" type="color" value="${alliance.color}" aria-label="Цвет союза ${escapeHtml(alliance.shortName)}"><span></span></label><button class="delete-alliance-button" type="button" title="Удалить союз" aria-label="Удалить союз ${escapeHtml(alliance.shortName)}">×</button></div>`;
    item.title = "Выбрать союз для кисти и маркера";
    item.addEventListener("click", () => {
      activeAllianceId = alliance.id;
      renderAlliances();
      updateToolGuidance();
      if (routeTargetId) calculateStrategicRoute(routeTargetId);
      else renderRouteRecommendations();
    });
    if (!readOnlyMode) {
      item.addEventListener("dblclick", () => editAllianceName(alliance));
      item.querySelector(".alliance-actions")?.addEventListener("dblclick", (event) => event.stopPropagation());
      item.querySelector(".start-point-button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        beginAllianceStart(alliance.id);
      });
      item.querySelector(".clear-start-button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        clearAllianceStart(alliance.id);
      });
      item.querySelector(".edit-alliance-button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        editAllianceName(alliance);
      });
      const colorInput = item.querySelector<HTMLInputElement>(".alliance-color-input");
      colorInput?.addEventListener("click", (event) => event.stopPropagation());
      colorInput?.addEventListener("change", (event) => {
        event.stopPropagation();
        changeAllianceColor(alliance, colorInput.value);
      });
      item.querySelector(".delete-alliance-button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteAlliance(alliance);
      });
    }
    list.append(item);
  });
}

function territoryAssignmentName(territory: Territory): string {
  return territory.bastionLevel && territory.bastionIndex ? territory.name : territory.name;
}

function territoryAssignmentOrder(left: Territory, right: Territory): number {
  const leftLevel = left.bastionLevel ?? Number.MAX_SAFE_INTEGER;
  const rightLevel = right.bastionLevel ?? Number.MAX_SAFE_INTEGER;
  return leftLevel - rightLevel || (left.bastionIndex ?? 0) - (right.bastionIndex ?? 0) || left.name.localeCompare(right.name, "ru");
}

function renderTerritoryAssignments(): void {
  const section = $("#territoryAssignmentsSection");
  const list = $("#territoryAssignmentsList");
  section.hidden = !isCopperMap();
  list.replaceChildren();
  if (!isCopperMap()) return;
  const tags = currentPlan().territoryTags;
  const byId = new Map(mapData.territories.map((territory) => [territory.id, territory]));
  const addGroup = (title: string, color: string, groupTags: typeof tags): void => {
    const territories = groupTags
      .map((tag) => ({ tag, territory: byId.get(tag.territoryId) }))
      .filter((entry): entry is { tag: (typeof tags)[number]; territory: Territory } => Boolean(entry.territory))
      .sort((a, b) => territoryAssignmentOrder(a.territory, b.territory));
    if (!territories.length) return;
    const group = document.createElement("div");
    group.className = "assignment-group";
    group.innerHTML = `<strong style="--assignment-color:${color}">${escapeHtml(title)} <small>${territories.length}</small></strong>`;
    territories.forEach(({ tag, territory }) => {
      const row = document.createElement("div");
      row.className = "assignment-row";
      const focus = document.createElement("button");
      focus.className = "assignment-focus";
      focus.textContent = territoryAssignmentName(territory);
      focus.title = `Показать ${territory.name} на карте`;
      focus.addEventListener("click", () => focusTerritory(territory));
      row.append(focus);
      if (!readOnlyMode) {
        const remove = document.createElement("button");
        remove.className = "assignment-remove";
        remove.textContent = "×";
        remove.title = "Снять метку";
        remove.addEventListener("click", () => {
          pushHistory();
          currentPlan().territoryTags = currentPlan().territoryTags.filter(({ id: tagId }) => tagId !== tag.id);
          renderTerritoryAssignments();
          commit(`Метка снята: ${territory.name}`);
        });
        row.append(remove);
      }
      group.append(row);
    });
    list.append(group);
  };
  state.alliances.forEach((alliance) =>
    addGroup(
      alliance.shortName,
      alliance.color,
      tags.filter((tag) => tag.kind === "alliance" && tag.allianceId === alliance.id),
    ),
  );
  addGroup(
    "ОТКАЗ",
    "#e85d75",
    tags.filter((tag) => tag.kind === "refusal"),
  );
  if (!list.childElementCount) list.innerHTML = '<p class="assignment-empty">Пока нет назначений. Выберите союз и инструмент «Союз».</p>';
}

function addAlliance(): void {
  const shortName = prompt("Короткое название союза (до 6 символов)", "NEW")?.trim().toUpperCase().slice(0, 6);
  if (!shortName) return;
  const colors = ["#35a7ff", "#f28f3b", "#c855e5", "#45c5b1", "#e85d75"];
  pushHistory();
  const alliance: Alliance = {
    id: id(),
    name: shortName,
    shortName,
    color: colors[state.alliances.length % colors.length] ?? "#35a7ff",
    isPlayerAlliance: false,
  };
  state.alliances.push(alliance);
  activeAllianceId = alliance.id;
  renderAlliances();
  scheduleSave();
}

function editAllianceName(alliance: Alliance): void {
  const shortName = prompt("Название союза", alliance.shortName)?.trim().toUpperCase().slice(0, 6);
  if (!shortName || shortName === alliance.shortName) return;
  pushHistory();
  alliance.shortName = shortName;
  alliance.name = shortName;
  renderAll();
  scheduleSave();
  showToast(`Союз переименован: ${shortName}`);
}

function changeAllianceColor(alliance: Alliance, color: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(color) || color.toLowerCase() === alliance.color.toLowerCase()) return;
  pushHistory();
  alliance.color = color;
  renderAll();
  scheduleSave();
  showToast(`Цвет союза ${alliance.shortName} изменён`);
}

function deleteAlliance(alliance: Alliance): void {
  if (state.alliances.length === 1) {
    alert("Нельзя удалить единственный союз.");
    return;
  }
  if (!confirm(`Удалить союз «${alliance.shortName}»? Его базы, территории и маркеры будут очищены во всех планах.`)) return;

  pushHistory();
  state.alliances = state.alliances.filter((item) => item.id !== alliance.id);
  for (const plan of state.plans) {
    removeAllianceReferences(plan, alliance.id);
    plan.updatedAt = Date.now();
  }

  const fallback = state.alliances.find(({ isPlayerAlliance }) => isPlayerAlliance) ?? state.alliances[0]!;
  if (alliance.isPlayerAlliance && !state.alliances.some(({ isPlayerAlliance }) => isPlayerAlliance)) fallback.isPlayerAlliance = true;
  if (activeAllianceId === alliance.id) activeAllianceId = fallback.id;
  if (startSelectionAllianceId === alliance.id) {
    startSelectionAllianceId = null;
    setTool("select");
  }

  renderAll();
  scheduleSave();
  showToast(`Союз ${alliance.shortName} удалён`);
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function applySettings(): void {
  const keys = [
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
  ] as const;
  for (const key of keys) {
    const input = $<HTMLInputElement>(`#${key}`);
    input.checked = state.settings[key];
  }
}

function searchTerritories(query: string): void {
  const normalized = query.trim().toUpperCase();
  const results = $("#searchResults");
  if (!normalized) {
    results.hidden = true;
    return;
  }
  const matches = findTerritories(mapData.territories, normalized);
  results.replaceChildren();
  matches.forEach((territory) => {
    const button = document.createElement("button");
    button.innerHTML = `<strong>${territory.name}</strong><small>${territoryTypeLabel(territory)} · ${territoryMetrics(territory)}</small>`;
    button.addEventListener("click", () => focusTerritory(territory));
    results.append(button);
  });
  if (!matches.length) results.innerHTML = `<button disabled>Объект не найден</button>`;
  results.hidden = false;
}

function focusTerritory(territory: Territory): void {
  const ratio = stage.width() / stage.height();
  const height = 360;
  const width = height * ratio;
  viewBox = constrainViewBox({ x: territory.x - width / 2, y: territory.y - height / 2, width, height });
  searchHitId = territory.id;
  applyViewBox();
  renderMap();
  $("#searchResults").hidden = true;
  setTimeout(() => {
    if (searchHitId === territory.id) {
      searchHitId = null;
      renderMap();
    }
  }, 3000);
}

function setViewBox(next: ViewBox): void {
  const minWidth = 180;
  const maxWidth = mapData.width * 3;
  if (next.width < minWidth || next.width > maxWidth) return;
  viewBox = constrainViewBox(next);
  if (state?.settings) state.settings.viewBox = clone(viewBox);
  applyViewBox();
  $("#zoomValue").textContent = `${Math.round((mapData.width / viewBox.width) * 100)}%`;
  if (state) scheduleSave();
}

function constrainViewBox(next: ViewBox): ViewBox {
  const x = next.width >= mapData.width ? (mapData.width - next.width) / 2 : Math.min(mapData.width - next.width, Math.max(0, next.x));
  const y =
    next.height >= mapData.height ? (mapData.height - next.height) / 2 : Math.min(mapData.height - next.height, Math.max(0, next.y));
  return { ...next, x, y };
}

function queueGestureViewBox(next: ViewBox): void {
  if (next.width < 180 || next.width > mapData.width * 3) return;
  pendingGestureViewBox = constrainViewBox(next);
  if (gestureFrame) return;
  gestureFrame = requestAnimationFrame(() => {
    gestureFrame = 0;
    if (!pendingGestureViewBox) return;
    viewBox = pendingGestureViewBox;
    pendingGestureViewBox = null;
    applyViewBox(true);
    $("#zoomValue").textContent = `${Math.round((mapData.width / viewBox.width) * 100)}%`;
  });
}

function finishGestureViewBox(): void {
  if (gestureFrame) cancelAnimationFrame(gestureFrame);
  gestureFrame = 0;
  if (pendingGestureViewBox) viewBox = pendingGestureViewBox;
  pendingGestureViewBox = null;
  if (state?.settings) state.settings.viewBox = clone(viewBox);
  applyViewBox();
  if (state) scheduleSave();
}

function applyViewBox(sceneOnly = false): void {
  if (!stage || !worldGroup) return;
  const scale = Math.min(stage.width() / viewBox.width, stage.height() / viewBox.height);
  worldGroup.position({ x: -viewBox.x * scale, y: -viewBox.y * scale });
  worldGroup.scale({ x: scale, y: scale });
  if (sceneOnly) sceneLayer?.drawScene();
  else sceneLayer?.batchDraw();
}

function fitMap(): void {
  resizeStage();
  const viewportRatio = stage.width() / stage.height();
  const mapRatio = mapData.width / mapData.height;
  if (viewportRatio > mapRatio) {
    const width = mapData.height * viewportRatio;
    viewBox = { x: -(width - mapData.width) / 2, y: 0, width, height: mapData.height };
  } else {
    const height = mapData.width / viewportRatio;
    viewBox = { x: 0, y: -(height - mapData.height) / 2, width: mapData.width, height };
  }
  setViewBox(viewBox);
}

function actualSize(): void {
  resizeStage();
  const width = stage.width();
  const height = stage.height();
  setViewBox({ x: (mapData.width - width) / 2, y: (mapData.height - height) / 2, width, height });
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
  const rect = stage.container().getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  const worldX = viewBox.x + px * viewBox.width;
  const worldY = viewBox.y + py * viewBox.height;
  const width = viewBox.width * factor;
  const height = viewBox.height * factor;
  setViewBox({ x: worldX - px * width, y: worldY - py * height, width, height });
}

function setupPanZoom(): void {
  stage.on("wheel", (konvaEvent) => {
    const event = konvaEvent.evt;
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1.12 : 0.89);
  });
  stage.on("mousedown touchstart", (konvaEvent) => {
    const event = konvaEvent.evt;
    if (event.touches?.length === 2) {
      event.preventDefault();
      const [a, b] = event.touches;
      pinch = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        centerX: (a.clientX + b.clientX) / 2,
        centerY: (a.clientY + b.clientY) / 2,
        box: clone(viewBox),
      };
      pan = null;
      return;
    }
    const touchGesture = Boolean(event.touches?.length);
    const draggableTarget = konvaEvent.target.draggable() || konvaEvent.target.getParent()?.draggable();
    if (touchGesture && draggableTarget) return;
    if (!touchGesture && konvaEvent.target !== stage && konvaEvent.target !== worldGroup && konvaEvent.target.name() !== "background")
      return;
    // On touch devices a short tap still operates the active tool, while a drag
    // always pans. This keeps the map movable even with the "Союз" or "Отказ" tool selected.
    if (!touchGesture && !(spaceDown || event.button === 1 || tool === "select")) return;
    pan = {
      x: event.clientX ?? event.touches?.[0]?.clientX,
      y: event.clientY ?? event.touches?.[0]?.clientY,
      box: clone(viewBox),
      moved: false,
    };
    stage.container().classList.add("panning");
  });
  stage.on("mousemove touchmove", (konvaEvent) => {
    const event = konvaEvent.evt;
    if (pinch && event.touches?.length === 2) {
      event.preventDefault();
      const [a, b] = event.touches;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      const rect = stage.container().getBoundingClientRect();
      const px = (pinch.centerX - rect.left) / rect.width;
      const py = (pinch.centerY - rect.top) / rect.height;
      const worldX = pinch.box.x + px * pinch.box.width;
      const worldY = pinch.box.y + py * pinch.box.height;
      const width = (pinch.box.width * pinch.distance) / distance;
      const height = (pinch.box.height * pinch.distance) / distance;
      queueGestureViewBox({ x: worldX - px * width, y: worldY - py * height, width, height });
      return;
    }
    if (!pan) return;
    const x = event.clientX ?? event.touches?.[0]?.clientX;
    const y = event.clientY ?? event.touches?.[0]?.clientY;
    if (!pan.moved && Math.hypot(x - pan.x, y - pan.y) < 7) return;
    pan.moved = true;
    if (event.touches) event.preventDefault();
    queueGestureViewBox({
      ...pan.box,
      x: pan.box.x - ((x - pan.x) * pan.box.width) / stage.width(),
      y: pan.box.y - ((y - pan.y) * pan.box.height) / stage.height(),
    });
  });
  stage.on("mouseup touchend touchcancel", () => {
    const changed = Boolean(pan?.moved || pinch || pendingGestureViewBox);
    if (pan?.moved || pinch) suppressMapClickUntil = performance.now() + 300;
    pan = null;
    pinch = null;
    stage.container().classList.remove("panning");
    if (changed) finishGestureViewBox();
  });
  stage.on("click tap", (event) => {
    if (performance.now() < suppressMapClickUntil) return;
    if (event.target === stage || event.target === worldGroup || !event.target.getParent()?.hasName("territory")) onMapClick();
  });
  $("#zoomIn").addEventListener("click", () => zoomAt(innerWidth / 2, innerHeight / 2, 0.8));
  $("#zoomOut").addEventListener("click", () => zoomAt(innerWidth / 2, innerHeight / 2, 1.25));
  $("#fitMap").addEventListener("click", fitMap);
  $("#actualSize").addEventListener("click", actualSize);
  window.addEventListener("resize", () => {
    resizeStage();
    applyViewBox();
  });
  const mapCanvas = $("#mapCanvas");
  // Safari does not consistently honour touch-action on a canvas. A non-passive
  // listener prevents the browser from claiming a drag as page navigation/scroll.
  mapCanvas.addEventListener(
    "touchmove",
    (event) => {
      if (event.cancelable) event.preventDefault();
    },
    { capture: true, passive: false },
  );
  new ResizeObserver(() => {
    const width = mapCanvas.clientWidth;
    const height = mapCanvas.clientHeight;
    if (width === stage.width() && height === stage.height()) return;
    resizeStage();
    applyViewBox();
  }).observe(mapCanvas);
}

function resizeStage(): void {
  if (!stage) return;
  const container = $("#mapCanvas");
  stage.size({ width: Math.max(1, container.clientWidth), height: Math.max(1, container.clientHeight) });
}

function exportProject(): void {
  exportProjectJson(state, mapData.id, today());
  showToast("Проект экспортирован");
}

async function sharePublicView(): Promise<void> {
  try {
    const url = (await collaboration?.createShortShare()) ?? (await createPublicViewUrl(state, mapData.id));
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast("Ссылка для просмотра скопирована");
    } else prompt("Скопируйте ссылку для просмотра", url);
  } catch (error: unknown) {
    alert(`Не удалось создать ссылку: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
  }
}

function applyReadOnlyMode(): void {
  document.body.classList.toggle("readonly", readOnlyMode);
  $("#readOnlyBadge").hidden = !readOnlyMode;
  document.title = readOnlyMode ? `${currentPlan().name} · Tiles Clash Planner · просмотр` : "Tiles Clash Planner";
}

async function importProject(file: File): Promise<void> {
  try {
    const text = await file.text();
    const envelope = JSON.parse(text) as unknown;
    const importedMapId =
      typeof envelope === "object" && envelope !== null && "mapId" in envelope && typeof envelope.mapId === "string"
        ? envelope.mapId
        : mapData.id;
    const entry = mapCatalog.find(({ id: entryId }) => entryId === importedMapId);
    if (!entry) throw new Error(`Файл предназначен для неизвестной карты (${importedMapId})`);
    const importedMap = importedMapId === mapData.id ? mapData : (await loadMapEntry(entry)).map;
    const importedDefaults = defaultState(importedMap);
    const imported = parseProject(text, importedDefaults);
    validateProjectMapReferences(imported, importedMap);
    const changesMap = importedMapId !== mapData.id;
    const warning = changesMap ? ` и переключит карту на «${entry.name}»` : "";
    if (!confirm(`Импортировать проект с ${imported.plans.length} планами${warning}? Текущий проект будет заменён.`)) return;
    if (changesMap) {
      collaboration?.leaveProject();
      await activateMap(importedMapId, imported);
      localStorage.setItem(MAP_SELECTION_KEY, importedMapId);
    } else {
      pushHistory();
      state = imported;
    }
    startSelectionAllianceId = null;
    tool = "select";
    activeAllianceId = state.alliances[0]!.id;
    routePreview = null;
    routeTargetId = null;
    renderAll();
    scheduleSave();
    showToast("Проект импортирован");
  } catch (error: unknown) {
    alert(`Не удалось импортировать файл: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
  }
}

async function exportPng(copyToClipboard = false, highQuality = false): Promise<void> {
  await exportMapPng({
    stage,
    worldGroup,
    layer: sceneLayer,
    map: mapData,
    state,
    plan: currentPlan(),
    copyToClipboard,
    highQuality,
    notify: showToast,
  });
}
function resetPlan(): void {
  if (!confirm(`Сбросить все статусы, стрелки и подписи в плане «${currentPlan().name}»?`)) return;
  pushHistory();
  clearPlan(currentPlan());
  renderRouteRecommendations();
  commit("План очищен");
}

function bindUi(): void {
  const changeMap = (event: Event): void => void switchMap((event.currentTarget as HTMLSelectElement).value);
  $<HTMLSelectElement>("#mapSelect").addEventListener("change", changeMap);
  $<HTMLSelectElement>("#mobileMapSelect").addEventListener("change", changeMap);
  const settingKeys = [
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
  ] as const;
  for (const key of settingKeys) {
    const input = $<HTMLInputElement>(`#${key}`);
    input.addEventListener("change", () => {
      state.settings[key] = input.checked;
      renderMap();
      scheduleSave();
    });
  }
  document
    .querySelectorAll<HTMLButtonElement>(".tool")
    .forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool as ToolName)));
  $("#finishRoute").addEventListener("click", finishRoute);
  $("#cancelRoute").addEventListener("click", finishRoute);
  $("#cancelStart").addEventListener("click", cancelAllianceStart);
  $("#undoBtn").addEventListener("click", undo);
  $("#redoBtn").addEventListener("click", redo);
  $("#clonePlan").addEventListener("click", clonePlan);
  $("#clonePlanMobile").addEventListener("click", clonePlan);
  $("#newPlan").addEventListener("click", createBlankPlan);
  $("#renamePlan").addEventListener("click", renameCurrentPlan);
  $("#deletePlan").addEventListener("click", deleteCurrentPlan);
  const changePlan = (event: Event): void => {
    state.currentPlanId = (event.currentTarget as HTMLSelectElement).value;
    routeStart = null;
    startSelectionAllianceId = null;
    routePreview = null;
    routeTargetId = null;
    tool = "select";
    renderAll();
    scheduleSave();
  };
  $<HTMLSelectElement>("#planSelect").addEventListener("change", changePlan);
  $<HTMLSelectElement>("#mobilePlanSelect").addEventListener("change", changePlan);
  $("#addAlliance").addEventListener("click", addAlliance);
  const searchInput = $<HTMLInputElement>("#searchInput");
  searchInput.addEventListener("input", () => searchTerritories(searchInput.value));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const exact =
        mapData.territories.find((territory) => territory.name === searchInput.value.trim().toUpperCase()) ||
        mapData.territories.find((territory) => territory.name.includes(searchInput.value.trim().toUpperCase()));
      if (exact) focusTerritory(exact);
    }
  });
  $("#exportJson").addEventListener("click", exportProject);
  const importFile = $<HTMLInputElement>("#importFile");
  $("#importJson").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files?.[0];
    if (file) void importProject(file);
    importFile.value = "";
  });
  $("#exportPng").addEventListener("click", () => exportPng(false));
  $("#copyPng").addEventListener("click", () => exportPng(true));
  $("#exportPngHigh").addEventListener("click", () => exportPng(false, true));
  $("#shareView").addEventListener("click", () => void sharePublicView());
  $("#resetPlan").addEventListener("click", resetPlan);
  const baseSelect = $<HTMLSelectElement>("#baseAllianceSelect");
  baseSelect.addEventListener("change", () => assignBase(baseSelect.value));
  $<HTMLSelectElement>("#routeTargetSelect").addEventListener("change", (event) =>
    calculateStrategicRoute((event.currentTarget as HTMLSelectElement).value),
  );
  $("#calculateRoute").addEventListener("click", () => calculateStrategicRoute());
  $("#pickRouteTarget").addEventListener("click", () => {
    setTool("routeTarget");
    showToast("Выберите конечную территорию на карте");
  });
  $("#addCalculatedRoute").addEventListener("click", addCalculatedRoute);
  $("#helpBtn").addEventListener("click", () => void openHelp());
  $("#helpBtnMobile").addEventListener("click", () => void openHelp());
  $("#closeHelp").addEventListener("click", closeHelp);
  $("#helpModal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeHelp();
  });
  $("#mobileSidebarToggle").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("#contextMenu")) hideContextMenu();
    if (!target?.closest("#basePicker")) hideBasePicker();
    if (!target?.closest(".search-section")) $("#searchResults").hidden = true;
    if (innerWidth <= 720 && !target?.closest(".sidebar") && !target?.closest("#mobileSidebarToggle"))
      $(".sidebar").classList.remove("open");
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : document.body;
    if (event.code === "Space" && !["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
      spaceDown = true;
      event.preventDefault();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
    if (event.key === "Escape") {
      if (!$("#helpModal").hidden) closeHelp();
      else if (tool === "allianceStart") cancelAllianceStart();
      else finishRoute();
      hideContextMenu();
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") spaceDown = false;
  });
  setupPanZoom();
}

function renderAll(): void {
  document.querySelectorAll<HTMLElement>(".copper-only").forEach((element) => {
    element.hidden = !isCopperMap();
  });
  renderPlanControls();
  renderAlliances();
  updateToolGuidance();
  renderTerritoryAssignments();
  renderRouteControls();
  renderMap();
  updateUndoButtons();
}

function renderMapSelectors(): void {
  for (const select of [$<HTMLSelectElement>("#mapSelect"), $<HTMLSelectElement>("#mobileMapSelect")]) {
    select.replaceChildren();
    for (const entry of mapCatalog) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      option.selected = entry.id === mapData.id;
      select.append(option);
    }
    select.disabled = publicViewMode;
  }
}

async function loadMapAssets(mapId: string): Promise<void> {
  const entry = mapCatalog.find(({ id: entryId }) => entryId === mapId);
  if (!entry) throw new Error(`Карта ${mapId} отсутствует в каталоге`);
  const loaded = await loadMapEntry(entry);
  mapData = loaded.map;
  gameConfig = loaded.config;
}

function resetMapInteraction(): void {
  routePreview = null;
  routeTargetId = null;
  routeStart = null;
  startSelectionAllianceId = null;
  searchHitId = null;
  activeBaseId = null;
  tool = "select";
  history.clear();
  updateUndoButtons();
}

async function activateMap(mapId: string, incomingState?: PlannerState): Promise<void> {
  clearTimeout(saveTimer);
  if (mapData && state && incomingState === undefined && !readOnlyMode) savePersistedState(localStorage, state, mapStorageScope());
  await loadMapAssets(mapId);
  state = incomingState ? parseProject(JSON.stringify(incomingState), defaultState()) : loadState();
  if (!state.plans.some((plan) => plan.id === state.currentPlanId)) state.currentPlanId = state.plans[0]!.id;
  activeAllianceId = state.alliances.find(({ isPlayerAlliance }) => isPlayerAlliance)?.id ?? state.alliances[0]!.id;
  resetMapInteraction();
  staticConnections = renderStaticMapScene(staticMapGroup, mapData);
  document.querySelectorAll<HTMLElement>(".copper-only").forEach((element) => {
    element.hidden = !isCopperMap();
  });
  renderMapSelectors();
  applySettings();
  renderAll();
  const savedView = state.settings.viewBox;
  if (savedView && Number.isFinite(savedView.x) && Number.isFinite(savedView.width)) {
    viewBox = constrainViewBox(clone(savedView));
    applyViewBox();
    $("#zoomValue").textContent = `${Math.round((mapData.width / viewBox.width) * 100)}%`;
  } else fitMap();
}

async function switchMap(mapId: string): Promise<void> {
  if (mapId === mapData.id || publicViewMode) {
    renderMapSelectors();
    return;
  }
  if (collaboration?.isConnected()) {
    const confirmed = confirm("Переключение карты закроет текущий общий проект. Продолжить?");
    if (!confirmed) {
      renderMapSelectors();
      return;
    }
    collaboration.leaveProject();
  }
  try {
    await activateMap(mapId);
    localStorage.setItem(MAP_SELECTION_KEY, mapId);
    showToast(`Открыта карта «${mapData.name}»`);
  } catch (error) {
    renderMapSelectors();
    alert(`Не удалось переключить карту: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
  }
}

export async function startPlanner(): Promise<void> {
  try {
    mapCatalog = await loadMapCatalog();
    if (!mapCatalog.length) throw new Error("Каталог карт пуст");
    const serverPublicView = await readServerPublicView();
    const publicView = serverPublicView ?? (await readPublicViewFromHash());
    const storedMapId = localStorage.getItem(MAP_SELECTION_KEY);
    const initialMapId = publicView?.mapId ?? mapCatalog.find(({ id: mapId }) => mapId === storedMapId)?.id ?? mapCatalog[0]!.id;
    await loadMapAssets(initialMapId);
    Konva.pixelRatio = lowPowerMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    Konva.hitOnDragEnabled = false;
    stage = new Konva.Stage({ container: "mapCanvas", width: 1, height: 1 });
    sceneLayer = new Konva.Layer();
    worldGroup = new Konva.Group();
    staticMapGroup = new Konva.Group({ listening: false });
    mapContentGroup = new Konva.Group();
    staticConnections = renderStaticMapScene(staticMapGroup, mapData);
    worldGroup.add(staticMapGroup);
    worldGroup.add(mapContentGroup);
    sceneLayer.add(worldGroup);
    stage.add(sceneLayer);
    resizeStage();
    viewBox = { x: 0, y: 0, width: mapData.width, height: mapData.height };
    if (publicView) {
      state = parseProject(JSON.stringify(publicView.state), defaultState());
      readOnlyMode = true;
      publicViewMode = true;
    } else state = loadState();
    if (!state.plans.some((plan) => plan.id === state.currentPlanId)) state.currentPlanId = state.plans[0]!.id;
    activeAllianceId = state.alliances.find(({ isPlayerAlliance }) => isPlayerAlliance)?.id ?? state.alliances[0]!.id;
    applyReadOnlyMode();
    applySettings();
    bindUi();
    renderMapSelectors();
    renderAll();
    if (!readOnlyMode) {
      collaboration = new CollaborationPanel({
        getState: () => clone(state),
        getMapId: () => mapData.id,
        applyState: async (remoteState, mapId) => {
          await activateMap(mapId, remoteState);
          if (!readOnlyMode) savePersistedState(localStorage, state, mapStorageScope());
          localStorage.setItem(MAP_SELECTION_KEY, mapId);
        },
        setRole: (role) => {
          readOnlyMode = role === "MEMBER";
          applyReadOnlyMode();
        },
        notify: showToast,
      });
      await collaboration.init();
    }
    requestAnimationFrame(() => {
      const savedView = state.settings.viewBox;
      if (savedView && Number.isFinite(savedView.x) && Number.isFinite(savedView.width)) {
        viewBox = constrainViewBox(clone(savedView));
        applyViewBox();
        $("#zoomValue").textContent = `${Math.round((mapData.width / viewBox.width) * 100)}%`;
      } else fitMap();
      $("#mapEmpty").remove();
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    $("#mapEmpty").innerHTML = `<strong>Не удалось открыть карту</strong><small>${escapeHtml(message)}</small>`;
    console.error(error);
  }
}
