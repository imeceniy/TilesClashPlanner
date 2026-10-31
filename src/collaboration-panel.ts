import {
  collaborationApi,
  type CloudMember,
  type CloudProject,
  type CloudRevision,
  type CloudRole,
  type CloudUser,
} from "./collaboration-api";
import type { PlannerState } from "./types";

interface CollaborationHooks {
  getState(): PlannerState;
  getMapId(): string;
  applyState(state: PlannerState, mapId: string): void | Promise<void>;
  setRole(role: CloudRole | null): void;
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
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private localDirty = false;
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
    try {
      this.user = (await collaborationApi.me()).user;
      if (this.user) await this.refreshProjects();
    } catch {
      /* backend is optional */
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
    this.current = null;
    this.localDirty = false;
    clearTimeout(this.saveTimer);
    this.hooks.setRole(null);
    this.renderProjects();
  }

  onLocalChange(): void {
    if (!this.current || this.current.role === "MEMBER") return;
    this.localDirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.push("Автосохранение"), 900);
  }

  async createShortShare(): Promise<string | null> {
    if (!this.current) return null;
    const share = await collaborationApi.share(this.current.id);
    return new URL(share.path, location.origin).toString();
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
    this.user = null;
    this.current = null;
    this.projects = [];
    this.hooks.setRole(null);
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
    this.localDirty = false;
    this.hooks.setRole(this.current.role);
    await this.hooks.applyState(this.current.state, this.current.mapId);
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
      const update = JSON.parse((event as MessageEvent).data) as { revision: number };
      if (update.revision > (this.current?.revision ?? 0)) void this.pullRemote(update.revision);
    };
    this.events.addEventListener("ready", receiveRevision);
    this.events.addEventListener("revision", receiveRevision);
    this.events.onerror = () => {
      element("#collaborationBtn").classList.add("offline");
    };
    this.events.onopen = () => {
      element("#collaborationBtn").classList.remove("offline");
    };
  }
  private async pullRemote(revision: number): Promise<void> {
    if (!this.current) return;
    if (this.localDirty) {
      this.hooks.notify("Есть удалённые изменения — откройте панель команды для разрешения конфликта");
      return;
    }
    const remote = (await collaborationApi.project(this.current.id)).project;
    if (remote.revision < revision) return;
    this.current = remote;
    await this.hooks.applyState(remote.state, remote.mapId);
    await this.renderDetails();
    this.hooks.notify(`Получена версия ${remote.revision}`);
  }
  private async push(summary: string): Promise<void> {
    if (!this.current || this.current.role === "MEMBER") return;
    try {
      this.current = (await collaborationApi.saveProject(this.current.id, this.hooks.getState(), this.current.revision, summary)).project;
      this.localDirty = false;
      await this.renderDetails();
    } catch (error) {
      this.hooks.notify(
        (error as Error & { status?: number }).status === 409
          ? "Конфликт версий: сначала загрузите изменения команды"
          : `Ошибка синхронизации: ${error instanceof Error ? error.message : "неизвестно"}`,
      );
    }
  }
  private async renderDetails(): Promise<void> {
    if (!this.current) return;
    const [history, members] = await Promise.all([collaborationApi.history(this.current.id), collaborationApi.members(this.current.id)]);
    const root = element("#cloudProjectDetails");
    const canEdit = this.current.role !== "MEMBER";
    const isR5 = this.current.role === "R5";
    root.innerHTML = `<header class="cloud-project-header"><div><strong>${escape(this.current.name)}</strong><small>${this.current.role} · версия ${this.current.revision}</small></div><div><button id="pullCloud" class="secondary-button">Загрузить</button>${canEdit ? '<button id="pushCloud" class="primary-button">Сохранить в общий</button>' : ""}<button id="shortShare" class="secondary-button">Короткая ссылка</button></div></header><section><h3>Участники</h3><div id="cloudMembers"></div>${isR5 ? '<form id="addCloudMember" class="member-form"><input id="memberUsername" placeholder="Логин"><select id="memberRole"><option>R4</option><option>MEMBER</option><option>R5</option></select><button class="secondary-button">Добавить</button></form>' : ""}</section><section><h3>История</h3><div id="cloudHistory"></div></section>`;
    element("#pullCloud").addEventListener("click", () => void this.selectProject(this.current!.id));
    document.querySelector("#pushCloud")?.addEventListener("click", () => void this.push("Ручное сохранение"));
    element("#shortShare").addEventListener("click", () => void this.copyShare());
    this.renderMembers(members.members, isR5);
    this.renderHistory(history.revisions, canEdit);
    if (isR5)
      element<HTMLFormElement>("#addCloudMember").addEventListener("submit", (event) => {
        event.preventDefault();
        void this.addMember();
      });
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
          `<div class="history-row"><span><strong>v${revision.revision} · ${escape(revision.summary)}</strong><small>${escape(revision.author.displayName)} · ${new Date(revision.createdAt).toLocaleString("ru-RU")}</small></span>${canRestore ? `<button data-restore="${revision.revision}" class="secondary-button">Вернуть</button>` : ""}</div>`,
      )
      .join("");
    root
      .querySelectorAll<HTMLButtonElement>("[data-restore]")
      .forEach((button) => button.addEventListener("click", () => void this.restore(Number(button.dataset.restore))));
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
    this.localDirty = false;
    await this.hooks.applyState(this.current.state, this.current.mapId);
    await this.renderDetails();
  }
  private async copyShare(): Promise<void> {
    const url = await this.createShortShare();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    this.hooks.notify("Короткая ссылка скопирована");
  }
}
