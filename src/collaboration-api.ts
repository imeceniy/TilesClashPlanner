import type { PlannerState } from "./types";
import { toSharedState } from "./persistence";

export type CloudRole = "R5" | "R4" | "MEMBER";
export interface CloudUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}
export interface CloudProject {
  id: string;
  name: string;
  mapId: string;
  state: PlannerState;
  revision: number;
  role: CloudRole;
  memberCount: number;
  updatedAt: string;
}
export interface CloudMember {
  projectId: string;
  userId: string;
  role: CloudRole;
  joinedAt: string;
  user: CloudUser;
}
export interface CloudRevision {
  id: string;
  projectId: string;
  revision: number;
  authorId: string;
  summary: string;
  createdAt: string;
  pinned?: boolean;
  label?: string;
  author: CloudUser;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const payload = (await response.json()) as { error?: string; details?: unknown } & T;
  if (!response.ok) {
    const error = new Error(payload.error ?? `HTTP ${response.status}`) as Error & { status: number; details?: unknown };
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  return payload;
}
const post = <T>(path: string, value?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(value ?? {}) });
const api = (path: string): string => `${import.meta.env.VITE_API_BASE ?? "/api"}${path}`;

export const collaborationApi = {
  me: () => request<{ user: CloudUser | null }>(api("/auth/me")),
  login: (username: string, password: string) => post<{ user: CloudUser }>(api("/auth/login"), { username, password }),
  register: (username: string, displayName: string, password: string) =>
    post<{ user: CloudUser }>(api("/auth/register"), { username, displayName, password }),
  logout: () => post<{ ok: true }>(api("/auth/logout")),
  projects: () => request<{ projects: CloudProject[] }>(api("/projects")),
  project: (id: string) => request<{ project: CloudProject }>(api(`/projects/${id}`)),
  createProject: (name: string, mapId: string, state: PlannerState) =>
    post<{ project: CloudProject }>(api("/projects"), { name, mapId, state: toSharedState(state) }),
  saveProject: (id: string, state: PlannerState, baseRevision: number, summary: string) =>
    request<{ project: CloudProject }>(api(`/projects/${id}/state`), {
      method: "PUT",
      body: JSON.stringify({ state: toSharedState(state), baseRevision, summary }),
      headers: { "content-type": "application/json" },
    }),
  history: (id: string) => request<{ revisions: CloudRevision[] }>(api(`/projects/${id}/history`)),
  pinRevision: (id: string, revision: number, label: string) =>
    post<{ revision: CloudRevision }>(api(`/projects/${id}/history/${revision}/pin`), { label }),
  restore: (id: string, revision: number) => post<{ project: CloudProject }>(api(`/projects/${id}/history/${revision}/restore`)),
  members: (id: string) => request<{ members: CloudMember[] }>(api(`/projects/${id}/members`)),
  addMember: (id: string, username: string, role: CloudRole) => post<{ ok: true }>(api(`/projects/${id}/members`), { username, role }),
  removeMember: (id: string, userId: string) => request<{ ok: true }>(api(`/projects/${id}/members/${userId}`), { method: "DELETE" }),
  share: (id: string) => post<{ shareId: string; path: string }>(api(`/projects/${id}/share`)),
  events: (id: string) => new EventSource(api(`/projects/${id}/events`)),
};

export async function readServerPublicView(): Promise<{ mapId: string; state: PlannerState; name: string } | null> {
  const match = location.pathname.match(/\/share\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) return null;
  const payload = await request<{ project: { mapId: string; state: PlannerState; name: string } }>(api(`/public/${match[1]}`));
  return payload.project;
}
