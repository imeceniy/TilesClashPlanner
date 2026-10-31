import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { hashPassword, randomId, tokenHash, verifyPassword } from "./auth";
import { JsonStore } from "./store";
import type { ProjectRecord, ProjectRole, UserRecord } from "./types";

const SESSION_COOKIE = "planner_session";
const roleRank: Record<ProjectRole, number> = { MEMBER: 0, R4: 1, R5: 2 };
const now = (): string => new Date().toISOString();
const normalizeUsername = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 6_000_000) throw new HttpError(413, "Слишком большой запрос");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}
function cookies(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2),
  );
}
function publicUser(user: UserRecord) {
  return { id: user.id, username: user.username, displayName: user.displayName, createdAt: user.createdAt };
}
function validateState(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Некорректное состояние проекта");
  const state = value as Record<string, unknown>;
  if (typeof state.version !== "number" || !Array.isArray(state.plans) || !Array.isArray(state.alliances))
    throw new HttpError(400, "Состояние проекта не соответствует формату PlannerState");
}

export interface PlannerServerOptions {
  dataFile: string;
  staticDir?: string;
  sessionSecure?: boolean;
}

export async function createPlannerServer(options: PlannerServerOptions) {
  const store = new JsonStore(options.dataFile);
  await store.load();
  const streams = new Map<string, Set<ServerResponse>>();
  const eventPadding = `: ${" ".repeat(2048)}\n`;
  const emit = (projectId: string, event: string, payload: unknown): void => {
    for (const response of streams.get(projectId) ?? [])
      response.write(`${eventPadding}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const currentUser = (request: IncomingMessage): UserRecord | undefined => {
    const raw = cookies(request)[SESSION_COOKIE];
    if (!raw) return undefined;
    const session = store.data.sessions.find((item) => item.tokenHash === tokenHash(raw) && item.expiresAt > now());
    return session ? store.data.users.find((item) => item.id === session.userId) : undefined;
  };
  const requireUser = (request: IncomingMessage): UserRecord => {
    const user = currentUser(request);
    if (!user) throw new HttpError(401, "Требуется вход");
    return user;
  };
  const access = (projectId: string, userId: string, minimum: ProjectRole = "MEMBER") => {
    const member = store.data.members.find((item) => item.projectId === projectId && item.userId === userId);
    if (!member || roleRank[member.role] < roleRank[minimum]) throw new HttpError(403, "Недостаточно прав");
    return member;
  };
  const projectView = (project: ProjectRecord, userId: string) => {
    const member = access(project.id, userId);
    return { ...project, role: member.role, memberCount: store.data.members.filter((item) => item.projectId === project.id).length };
  };

  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const method = request.method ?? "GET";
    try {
      if (path === "/api/health") return json(response, 200, { ok: true, realtime: "sse" });
      if (path === "/api/auth/register" && method === "POST") {
        const input = await body(request);
        const username = normalizeUsername(input.username);
        const displayName = String(input.displayName ?? username)
          .trim()
          .slice(0, 60);
        const password = String(input.password ?? "");
        if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new HttpError(400, "Логин: 3–32 латинских символа");
        if (password.length < 8) throw new HttpError(400, "Пароль должен содержать минимум 8 символов");
        if (store.data.users.some((item) => item.username === username)) throw new HttpError(409, "Логин уже занят");
        const credentials = await hashPassword(password);
        const user: UserRecord = {
          id: randomId(),
          username,
          displayName: displayName || username,
          passwordHash: credentials.hash,
          passwordSalt: credentials.salt,
          createdAt: now(),
        };
        store.data.users.push(user);
        const token = randomId(32);
        store.data.sessions.push({
          tokenHash: tokenHash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
        });
        await store.save();
        response.setHeader(
          "set-cookie",
          `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${options.sessionSecure ? "; Secure" : ""}`,
        );
        return json(response, 201, { user: publicUser(user) });
      }
      if (path === "/api/auth/login" && method === "POST") {
        const input = await body(request);
        const user = store.data.users.find((item) => item.username === normalizeUsername(input.username));
        if (!user || !(await verifyPassword(String(input.password ?? ""), user.passwordSalt, user.passwordHash)))
          throw new HttpError(401, "Неверный логин или пароль");
        const token = randomId(32);
        store.data.sessions.push({
          tokenHash: tokenHash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
        });
        await store.save();
        response.setHeader(
          "set-cookie",
          `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${options.sessionSecure ? "; Secure" : ""}`,
        );
        return json(response, 200, { user: publicUser(user) });
      }
      if (path === "/api/auth/logout" && method === "POST") {
        const raw = cookies(request)[SESSION_COOKIE];
        if (raw) store.data.sessions = store.data.sessions.filter((item) => item.tokenHash !== tokenHash(raw));
        await store.save();
        response.setHeader("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        return json(response, 200, { ok: true });
      }
      if (path === "/api/auth/me" && method === "GET") {
        const user = currentUser(request);
        return json(response, 200, { user: user ? publicUser(user) : null });
      }
      if (path === "/api/projects" && method === "GET") {
        const user = requireUser(request);
        const projects = store.data.members
          .filter((item) => item.userId === user.id)
          .map((item) => store.data.projects.find((project) => project.id === item.projectId))
          .filter((item): item is ProjectRecord => Boolean(item))
          .map((item) => projectView(item, user.id));
        return json(response, 200, { projects });
      }
      if (path === "/api/projects" && method === "POST") {
        const user = requireUser(request);
        const input = await body(request);
        validateState(input.state);
        const timestamp = now();
        const project: ProjectRecord = {
          id: randomId(),
          name: String(input.name ?? "Общий проект")
            .trim()
            .slice(0, 80),
          mapId: String(input.mapId ?? "gene-clash"),
          state: input.state,
          revision: 1,
          createdBy: user.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        store.data.projects.push(project);
        store.data.members.push({ projectId: project.id, userId: user.id, role: "R5", joinedAt: timestamp });
        store.data.revisions.push({
          id: randomId(),
          projectId: project.id,
          revision: 1,
          state: project.state,
          authorId: user.id,
          summary: "Проект создан",
          createdAt: timestamp,
        });
        await store.save();
        emit(project.id, "revision", { revision: 1, authorId: user.id });
        return json(response, 201, { project: projectView(project, user.id) });
      }

      const publicMatch = path.match(/^\/api\/public\/([A-Za-z0-9_-]+)$/);
      if (publicMatch && method === "GET") {
        const share = store.data.shares.find((item) => item.id === publicMatch[1] && !item.revokedAt);
        const project = share && store.data.projects.find((item) => item.id === share.projectId);
        if (!share || !project) throw new HttpError(404, "Ссылка не найдена");
        return json(response, 200, {
          project: {
            id: project.id,
            name: project.name,
            mapId: project.mapId,
            state: project.state,
            revision: project.revision,
            updatedAt: project.updatedAt,
          },
        });
      }

      const match = path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
      if (match) {
        const projectId = match[1]!;
        const action = match[2] ?? "";
        const user = requireUser(request);
        const project = store.data.projects.find((item) => item.id === projectId);
        if (!project) throw new HttpError(404, "Проект не найден");
        if (!action && method === "GET") return json(response, 200, { project: projectView(project, user.id) });
        if (action === "events" && method === "GET") {
          access(projectId, user.id);
          response.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
            connection: "keep-alive",
          });
          response.flushHeaders();
          response.write(`${eventPadding}retry: 2000\nevent: ready\ndata: ${JSON.stringify({ revision: project.revision })}\n\n`);
          const clients = streams.get(projectId) ?? new Set<ServerResponse>();
          clients.add(response);
          streams.set(projectId, clients);
          const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 10_000);
          request.on("close", () => {
            clearInterval(heartbeat);
            clients.delete(response);
          });
          return;
        }
        if (action === "state" && method === "PUT") {
          access(projectId, user.id, "R4");
          const input = await body(request);
          validateState(input.state);
          if (Number(input.baseRevision) !== project.revision)
            throw new HttpError(409, "Проект уже изменён другим участником", { project: projectView(project, user.id) });
          project.state = input.state;
          project.revision += 1;
          project.updatedAt = now();
          store.data.revisions.push({
            id: randomId(),
            projectId,
            revision: project.revision,
            state: project.state,
            authorId: user.id,
            summary: String(input.summary ?? "Изменение плана").slice(0, 120),
            createdAt: project.updatedAt,
          });
          const history = store.data.revisions.filter((item) => item.projectId === projectId);
          if (history.length > 100)
            store.data.revisions = store.data.revisions.filter(
              (item) => item.projectId !== projectId || item.revision > project.revision - 100,
            );
          await store.save();
          emit(projectId, "revision", { revision: project.revision, authorId: user.id, updatedAt: project.updatedAt });
          return json(response, 200, { project: projectView(project, user.id) });
        }
        if (action === "history" && method === "GET") {
          access(projectId, user.id);
          const revisions = store.data.revisions
            .filter((item) => item.projectId === projectId)
            .sort((a, b) => b.revision - a.revision)
            .map((item) => ({
              id: item.id,
              projectId: item.projectId,
              revision: item.revision,
              authorId: item.authorId,
              summary: item.summary,
              createdAt: item.createdAt,
              author: publicUser(store.data.users.find((candidate) => candidate.id === item.authorId)!),
            }));
          return json(response, 200, { revisions });
        }
        const restoreMatch = action.match(/^history\/(\d+)\/restore$/);
        if (restoreMatch && method === "POST") {
          access(projectId, user.id, "R4");
          const source = store.data.revisions.find((item) => item.projectId === projectId && item.revision === Number(restoreMatch[1]));
          if (!source) throw new HttpError(404, "Версия не найдена");
          project.state = source.state;
          project.revision += 1;
          project.updatedAt = now();
          store.data.revisions.push({
            id: randomId(),
            projectId,
            revision: project.revision,
            state: project.state,
            authorId: user.id,
            summary: `Восстановлена версия ${source.revision}`,
            createdAt: project.updatedAt,
          });
          await store.save();
          emit(projectId, "revision", { revision: project.revision, authorId: user.id });
          return json(response, 200, { project: projectView(project, user.id) });
        }
        if (action === "members" && method === "GET") {
          access(projectId, user.id);
          const members = store.data.members
            .filter((item) => item.projectId === projectId)
            .map((item) => ({ ...item, user: publicUser(store.data.users.find((candidate) => candidate.id === item.userId)!) }));
          return json(response, 200, { members });
        }
        if (action === "members" && method === "POST") {
          access(projectId, user.id, "R5");
          const input = await body(request);
          const target = store.data.users.find((item) => item.username === normalizeUsername(input.username));
          if (!target) throw new HttpError(404, "Пользователь не найден");
          const role = String(input.role) as ProjectRole;
          if (!(role in roleRank)) throw new HttpError(400, "Неизвестная роль");
          const member = store.data.members.find((item) => item.projectId === projectId && item.userId === target.id);
          if (
            member?.role === "R5" &&
            role !== "R5" &&
            store.data.members.filter((item) => item.projectId === projectId && item.role === "R5").length === 1
          )
            throw new HttpError(400, "Нельзя понизить последнего R5");
          if (member) member.role = role;
          else store.data.members.push({ projectId, userId: target.id, role, joinedAt: now() });
          await store.save();
          emit(projectId, "members", { changed: true });
          return json(response, 200, { ok: true });
        }
        const memberMatch = action.match(/^members\/([^/]+)$/);
        if (memberMatch && method === "DELETE") {
          access(projectId, user.id, "R5");
          const targetId = memberMatch[1]!;
          const target = store.data.members.find((item) => item.projectId === projectId && item.userId === targetId);
          if (!target) throw new HttpError(404, "Участник не найден");
          if (target.role === "R5" && store.data.members.filter((item) => item.projectId === projectId && item.role === "R5").length === 1)
            throw new HttpError(400, "Нельзя удалить последнего R5");
          store.data.members = store.data.members.filter((item) => !(item.projectId === projectId && item.userId === targetId));
          await store.save();
          emit(projectId, "members", { changed: true });
          return json(response, 200, { ok: true });
        }
        if (action === "share" && method === "POST") {
          access(projectId, user.id, "R4");
          const existing = store.data.shares.find((item) => item.projectId === projectId && !item.revokedAt);
          const share = existing ?? { id: randomId(8), projectId, createdBy: user.id, createdAt: now() };
          if (!existing) store.data.shares.push(share);
          await store.save();
          return json(response, 200, { shareId: share.id, path: `/share/${share.id}` });
        }
        if (action === "share" && method === "DELETE") {
          access(projectId, user.id, "R4");
          for (const share of store.data.shares) if (share.projectId === projectId && !share.revokedAt) share.revokedAt = now();
          await store.save();
          return json(response, 200, { ok: true });
        }
      }

      if (options.staticDir && method === "GET") {
        const sharedAsset = path.match(/^\/share\/(assets\/.*|data\/.*|README\.md)$/);
        const requested = sharedAsset
          ? `/${sharedAsset[1]}`
          : path.startsWith("/share/")
            ? "/index.html"
            : path === "/"
              ? "/index.html"
              : path;
        const filename = join(options.staticDir, normalize(requested).replace(/^(\.\.(\/|\\|$))+/, ""));
        try {
          if ((await stat(filename)).isFile()) {
            const types: Record<string, string> = {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
              ".md": "text/markdown",
            };
            response.writeHead(200, { "content-type": `${types[extname(filename)] ?? "application/octet-stream"}; charset=utf-8` });
            response.end(await readFile(filename));
            return;
          }
        } catch {
          /* fall through */
        }
      }
      throw new HttpError(404, "Маршрут не найден");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      json(response, status, {
        error: error instanceof Error ? error.message : "Ошибка сервера",
        ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
      });
    }
  };
  const server = createServer((request, response) => void handler(request, response));
  const heartbeat = setInterval(() => {
    for (const clients of streams.values()) for (const response of clients) response.write(": heartbeat\n\n");
  }, 20_000);
  server.on("close", () => clearInterval(heartbeat));
  return { server, store };
}
