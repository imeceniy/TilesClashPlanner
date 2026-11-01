import {
  collaborationApi,
  type CloudMember,
  type CloudProject,
  type CloudRevision,
  type CloudRole,
  type CloudUser,
} from "./collaboration-api";
import type { PlannerState } from "./types";
import { SyncEngine, summarizeProjectChanges, type SyncStatus } from "./sync-engine";

interface CollaborationHooks {
  getState(): PlannerState;
  getMapId(): string;
  applyState(state: PlannerState, mapId: string): void | Promise<void>;
  applyRemoteState?(state: PlannerState, mapId: string): void | Promise<void>;
  leaveCloudProject?(): void | Promise<void>;
  setRole(role: CloudRole | null): void;
  setSyncStatus?(status: string): void;
  notify(message: string): void;
}

const escape = (value: string): string => {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
};
const element = <T extends Element = HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Не найден элемент ${selector}`);
  return found;
};
export class CollaborationPanel {
  private user: CloudUser | null = null;
  private projects: CloudProject[] = [];
  private current: CloudProject | null = null;
  private events: EventSource | null = null;
  private syncEngine: SyncEngine | null = null;
  private unresolved: CloudProject | null = null;
  private registration = false;
  constructor(private readonly hooks: CollaborationHooks) {}

  async init(): Promise<void> {
    element("#collaborationBtn").addEventListener("click", () => this.open());
    element("#collaborationBtnMobile").addEventListener("click", () => this.open());
    element("#closeCollaboration").addEventListener("click", () => this.close());
    element("#collaborationModal").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.close();
    });
    element("#loginTab").addEventListener("click", () => this.setRegistration(false));
    element("#registerTab").addEventListener("click", () => this.setRegistration(true));
    element<HTMLFormElement>("#authForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.authenticate();
    });
    element("#logoutBtn").addEventListener("click", () => void this.logout());
    element("#createCloudProject").addEventListener("click", () => void this.createProject());
    const rememberedProjectId = localStorage.getItem("tiles-clash-planner:active-cloud-project");
    try {
      this.user = (await collaborationApi.me()).user;
      if (this.user) {
        await this.refreshProjects();
        if (rememberedProjectId && this.projects.some(({ id }) => id === rememberedProjectId)) {
          try {
            await this.selectProject(rememberedProjectId);
          } catch {
            localStorage.removeItem("tiles-clash-planner:active-cloud-project");
            this.hooks.notify("Не удалось восстановить общий проект. Открыт локальный план.");
          }
        } else if (rememberedProjectId) {
          localStorage.removeItem("tiles-clash-planner:active-cloud-project");
          this.hooks.notify("Общий проект больше недоступен. Открыт локальный план.");
        }
      }
    } catch {
      /* backend is optional */
      if (rememberedProjectId) {
        localStorage.removeItem("tiles-clash-planner:active-cloud-project");
        this.hooks.notify("Нет связи с общим проектом. Открыт локальный план.");
      }
    }
    this.renderSession();
  }

  open(): void {
    element<HTMLElement>("#collaborationModal").hidden = false;
    this.renderSession();
  }
  close(): void {
    element<HTMLElement>("#collaborationModal").hidden = true;
  }
  isConnected(): boolean {
    return Boolean(this.current);
  }
  leaveProject(): void {
    this.events?.close();
    this.events = null;
    this.syncEngine?.stop();
    this.syncEngine = null;
    this.current = null;
    this.unresolved = null;
    this.hooks.setRole(null);
    localStorage.removeItem("tiles-clash-planner:active-cloud-project");
    void this.hooks.leaveCloudProject?.();
    this.renderProjects();
  }

  onLocalChange(): void {
    this.syncEngine?.localChange();
  }

  async createShortShare(): Promise<string | null> {
    if (!this.current) return null;
    const share = await collaborationApi.share(this.current.id);
    return new URL(share.path, location.origin).toString();
  }
  private createSyncEngine(project: CloudProject, baseState: PlannerState): void {
    if (!this.user) return;
    this.syncEngine = new SyncEngine({
      api: {
        getProject: async (id) => (await collaborationApi.project(id)).project,
        saveProject: async (id, state, revision, summary) => (await collaborationApi.saveProject(id, state, revision, summary)).project,
      },
      getState: () => this.hooks.getState(),
      applyRemote: (state, mapId) => this.applyRemote(state, mapId),
      saveBackup: (state) => localStorage.setItem(`tiles-clash-planner:conflict:${project.id}:${Date.now()}`, JSON.stringify(state)),
      onProject: (value) => {
        this.current = value;
        this.renderProjects();
      },
      onStatus: (status) => this.hooks.setSyncStatus?.(this.syncStatusLabel(status)),
      onConflict: (remote) => {
        this.unresolved = remote;
        void this.renderDetails();
      },
      onRemoteApplied: async (remote) => {
        const history = await collaborationApi.history(remote.id);
        const revision = history.revisions.find((item) => item.revision === remote.revision);
        this.hooks.notify(revision ? `${revision.author.displayName} обновил план` : `Получена версия ${remote.revision}`);
      },
      onUpdate: () => this.renderDetails(),
      notify: (message) => this.hooks.notify(message),
      userId: this.user.id,
      summarize: summarizeProjectChanges,
    });
    this.syncEngine.start(project, baseState);
  }
  private syncStatusLabel(status: SyncStatus): string {
    return {
      idle: "сохранено",
      dirty: "есть несохранённые правки",
      pushing: "сохраняем…",
      conflict: "есть конфликт",
      offline: "офлайн",
      readonly: "только просмотр",
    }[status];
  }

  private setRegistration(value: boolean): void {
    this.registration = value;
    element("#loginTab").classList.toggle("active", !value);
    element("#registerTab").classList.toggle("active", value);
    element<HTMLElement>("#displayNameField").hidden = !value;
    element<HTMLButtonElement>("#authSubmit").textContent = value ? "Создать аккаунт" : "Войти";
    element("#authError").textContent = "";
  }
  private async authenticate(): Promise<void> {
    const username = element<HTMLInputElement>("#authUsername").value;
    const password = element<HTMLInputElement>("#authPassword").value;
    const displayName = element<HTMLInputElement>("#authDisplayName").value;
    try {
      this.user = this.registration
        ? (await collaborationApi.register(username, displayName, password)).user
        : (await collaborationApi.login(username, password)).user;
      await this.refreshProjects();
      this.renderSession();
      this.hooks.notify(`Выполнен вход: ${this.user.displayName}`);
    } catch (error) {
      element("#authError").textContent = error instanceof Error ? error.message : "Ошибка входа";
    }
  }
  private async logout(): Promise<void> {
    await collaborationApi.logout();
    this.events?.close();
    this.events = null;
    this.syncEngine?.stop();
    this.syncEngine = null;
    this.user = null;
    this.current = null;
    this.projects = [];
    this.hooks.setRole(null);
    localStorage.removeItem("tiles-clash-planner:active-cloud-project");
    await this.hooks.leaveCloudProject?.();
    this.renderSession();
  }
  private async refreshProjects(): Promise<void> {
    this.projects = (await collaborationApi.projects()).projects;
    this.renderProjects();
  }
  private renderSession(): void {
    element<HTMLElement>("#authSection").hidden = Boolean(this.user);
    element<HTMLElement>("#cloudSection").hidden = !this.user;
    if (!this.user) return;
    element("#cloudUserName").textContent = this.user.displayName;
    element("#cloudUserLogin").textContent = `@${this.user.username}`;
    this.renderProjects();
  }
  private renderProjects(): void {
    const list = element("#cloudProjectList");
    list.replaceChildren();
    for (const project of this.projects) {
      const button = document.createElement("button");
      button.className = `cloud-project${project.id === this.current?.id ? " active" : ""}`;
      button.innerHTML = `<strong>${escape(project.name)}</strong><small>${project.role} · версия ${project.revision}</small>`;
      button.addEventListener("click", () => void this.selectProject(project.id));
      list.append(button);
    }
    if (!this.projects.length) list.innerHTML = '<p class="empty-cloud">Общих проектов пока нет.</p>';
  }
  private async createProject(): Promise<void> {
    const name = prompt("Название общего проекта", "Общий план")?.trim();
    if (!name) return;
    this.current = (await collaborationApi.createProject(name, this.hooks.getMapId(), this.hooks.getState())).project;
    await this.refreshProjects();
    await this.selectProject(this.current.id);
    this.hooks.notify("Общий проект создан");
  }
  private async selectProject(id: string): Promise<void> {
    this.current = (await collaborationApi.project(id)).project;
    this.syncEngine?.stop();
    this.syncEngine = null;
    this.hooks.setRole(this.current.role);
    localStorage.setItem("tiles-clash-planner:active-cloud-project", id);
    await this.hooks.applyState(this.current.state, this.current.mapId);
    const baseState = this.withLocalSettings(this.current.state, this.hooks.getState());
    this.unresolved = null;
    this.createSyncEngine(this.current, baseState);
    this.connectEvents();
    await this.renderDetails();
    this.renderProjects();
    this.hooks.notify(`Открыт общий проект «${this.current.name}»`);
  }
  private connectEvents(): void {
    this.events?.close();
    if (!this.current) return;
    this.events = collaborationApi.events(this.current.id);
    const receiveRevision = (event: Event): void => {
      const update = JSON.parse((event as MessageEvent).data) as { revision: number; authorId?: string };
      this.syncEngine?.receiveRevision(update.revision, update.authorId);
    };
    this.events.addEventListener("ready", receiveRevision);
    this.events.addEventListener("revision", receiveRevision);
    this.events.addEventListener("members", () => {
      if (!this.current) return;
      void collaborationApi
        .project(this.current.id)
        .then(({ project }) => {
          this.current = project;
          this.hooks.setRole(project.role);
          this.syncEngine?.setRole(project.role);
          return this.renderDetails();
        })
        .catch((error) => {
          const status = (error as Error & { status?: number }).status;
          if (status === 401 || status === 403 || status === 404) {
            this.leaveProject();
            this.hooks.notify("Доступ к общему проекту отозван.");
          }
        });
    });
    this.events.onerror = () => {
      element("#collaborationBtn").classList.add("offline");
      this.syncEngine?.setOffline();
    };
    this.events.onopen = () => {
      element("#collaborationBtn").classList.remove("offline");
      this.syncEngine?.reconnect();
    };
  }
  private withLocalSettings(remote: PlannerState, local: PlannerState): PlannerState {
    return { ...structuredClone(remote), settings: structuredClone(local.settings) };
  }
  private async applyRemote(state: PlannerState, mapId: string): Promise<void> {
    if (this.hooks.applyRemoteState) await this.hooks.applyRemoteState(state, mapId);
    else await this.hooks.applyState(state, mapId);
  }
  private async renderDetails(): Promise<void> {
    if (!this.current) return;
    const [history, members] = await Promise.all([collaborationApi.history(this.current.id), collaborationApi.members(this.current.id)]);
    const root = element("#cloudProjectDetails");
    const canEdit = this.current.role !== "MEMBER";
    const isR5 = this.current.role === "R5";
    root.innerHTML = `<header class="cloud-project-header"><div><strong>${escape(this.current.name)}</strong><small>${this.current.role} · версия ${this.current.revision}</small></div><div><button id="pullCloud" class="secondary-button">Загрузить</button>${canEdit ? '<button id="pushCloud" class="primary-button">Сохранить в общий</button>' : ""}<button id="shortShare" class="secondary-button">Короткая ссылка</button></div></header>${this.unresolved ? '<aside class="sync-conflict"><strong>Остались конфликтующие изменения.</strong><div><button id="keepLocalChanges" class="primary-button">Оставить мои правки поверх версии команды</button><button id="takeRemoteChanges" class="secondary-button">Взять версию команды</button></div></aside>' : ""}<section><h3>Участники</h3><div id="cloudMembers"></div>${isR5 ? '<form id="addCloudMember" class="member-form"><input id="memberUsername" placeholder="Логин"><select id="memberRole"><option>R4</option><option>MEMBER</option><option>R5</option></select><button class="secondary-button">Добавить</button></form>' : ""}</section><section><h3>История</h3><div id="cloudHistory"></div></section>`;
    element("#pullCloud").addEventListener("click", () => void this.selectProject(this.current!.id));
    document.querySelector("#pushCloud")?.addEventListener("click", () => void this.syncEngine?.push("Ручное сохранение"));
    element("#shortShare").addEventListener("click", () => void this.copyShare());
    document.querySelector("#keepLocalChanges")?.addEventListener("click", () => {
      void this.syncEngine?.keepLocal();
    });
    document.querySelector("#takeRemoteChanges")?.addEventListener("click", () => void this.takeRemoteChanges());
    this.renderMembers(members.members, isR5);
    this.renderHistory(history.revisions, canEdit);
    if (isR5)
      element<HTMLFormElement>("#addCloudMember").addEventListener("submit", (event) => {
        event.preventDefault();
        void this.addMember();
      });
  }
  private async takeRemoteChanges(): Promise<void> {
    if (!this.unresolved || !confirm("Ваши несохранённые правки будут заменены версией команды. Продолжить?")) return;
    await this.syncEngine?.takeRemote();
  }
  private renderMembers(members: CloudMember[], editable: boolean): void {
    const root = element("#cloudMembers");
    root.innerHTML = members
      .map(
        (member) =>
          `<div class="member-row"><span><strong>${escape(member.user.displayName)}</strong><small>@${escape(member.user.username)}</small></span>${
            editable
              ? `<select data-member-role="${member.userId}" data-username="${escape(member.user.username)}" aria-label="Роль ${escape(member.user.displayName)}"><option${member.role === "R5" ? " selected" : ""}>R5</option><option${member.role === "R4" ? " selected" : ""}>R4</option><option${member.role === "MEMBER" ? " selected" : ""}>MEMBER</option></select>`
              : `<b>${member.role}</b>`
          }${editable ? `<button data-remove-member="${member.userId}" title="Удалить">×</button>` : ""}</div>`,
      )
      .join("");
    root.querySelectorAll<HTMLSelectElement>("[data-member-role]").forEach((select) =>
      select.addEventListener("change", () => {
        void this.changeMemberRole(select.dataset.username!, select.value as CloudRole);
      }),
    );
    root
      .querySelectorAll<HTMLButtonElement>("[data-remove-member]")
      .forEach((button) => button.addEventListener("click", () => void this.removeMember(button.dataset.removeMember!)));
  }
  private async changeMemberRole(username: string, role: CloudRole): Promise<void> {
    if (!this.current) return;
    try {
      await collaborationApi.addMember(this.current.id, username, role);
      await this.renderDetails();
      this.hooks.notify(`Роль @${username} изменена на ${role}`);
    } catch (error) {
      await this.renderDetails();
      this.hooks.notify(error instanceof Error ? error.message : "Не удалось изменить роль");
    }
  }
  private renderHistory(revisions: CloudRevision[], canRestore: boolean): void {
    const root = element("#cloudHistory");
    root.innerHTML = revisions
      .map(
        (revision) =>
          `<div class="history-row"><span><strong>v${revision.revision} · ${revision.label ? `${escape(revision.label)} · ` : ""}${escape(revision.summary)}${revision.pinned ? " · Закреплена" : ""}</strong><small>${escape(revision.author.displayName)} · ${new Date(revision.createdAt).toLocaleString("ru-RU")}</small></span>${canRestore ? `${revision.pinned ? "" : `<button data-pin="${revision.revision}" class="secondary-button">Закрепить</button>`}<button data-restore="${revision.revision}" class="secondary-button">Вернуть</button>` : ""}</div>`,
      )
      .join("");
    root
      .querySelectorAll<HTMLButtonElement>("[data-restore]")
      .forEach((button) => button.addEventListener("click", () => void this.restore(Number(button.dataset.restore))));
    root
      .querySelectorAll<HTMLButtonElement>("[data-pin]")
      .forEach((button) => button.addEventListener("click", () => void this.pin(Number(button.dataset.pin))));
  }
  private async pin(revision: number): Promise<void> {
    if (!this.current) return;
    const label = prompt("Название для закреплённой версии", "Итог дня")?.trim();
    if (!label) return;
    await collaborationApi.pinRevision(this.current.id, revision, label);
    await this.renderDetails();
  }
  private async addMember(): Promise<void> {
    if (!this.current) return;
    await collaborationApi.addMember(
      this.current.id,
      element<HTMLInputElement>("#memberUsername").value,
      element<HTMLSelectElement>("#memberRole").value as CloudRole,
    );
    await this.renderDetails();
  }
  private async removeMember(userId: string): Promise<void> {
    if (!this.current || !confirm("Удалить участника из проекта?")) return;
    await collaborationApi.removeMember(this.current.id, userId);
    await this.renderDetails();
  }
  private async restore(revision: number): Promise<void> {
    if (!this.current || !confirm(`Восстановить версию ${revision}?`)) return;
    this.current = (await collaborationApi.restore(this.current.id, revision)).project;
    await this.hooks.applyState(this.current.state, this.current.mapId);
    this.syncEngine?.start(this.current, this.withLocalSettings(this.current.state, this.hooks.getState()));
    await this.renderDetails();
  }
  private async copyShare(): Promise<void> {
    const url = await this.createShortShare();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    this.hooks.notify("Короткая ссылка скопирована");
  }
}
