import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { hashPassword, randomId, tokenHash, verifyPassword } from "./auth";
import { JsonStore } from "./store";
import type { Database, ProjectRecord, ProjectRole, UserRecord } from "./types";
import { migrateProject, toSharedState, validateProjectMapReferences } from "../src/persistence";

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
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
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
function trimHistory(revisions: Database["revisions"], projectId: string): void {
  const projectHistory = revisions.filter((item) => item.projectId === projectId).sort((a, b) => a.revision - b.revision);
  let excess = projectHistory.length - 100;
  for (const revision of projectHistory) {
    if (excess <= 0) break;
    if (revision.pinned) continue;
    const index = revisions.indexOf(revision);
    if (index >= 0) revisions.splice(index, 1);
    excess--;
  }
}
const validationDefaults = {
  version: 6 as const,
  currentPlanId: "",
  plans: [],
  alliances: [],
  settings: {
    showNames: true,
    showValues: true,
    showEnemies: true,
    showNeutral: true,
    showArrows: true,
    showConnections: true,
    showLabels: true,
    showMarkers: true,
    showLegend: true,
    showStrategic: false,
    viewBox: null,
  },
};
interface MapReferenceData {
  territories: Array<{ id: string }>;
  bases: Array<{ id: string }>;
}
function validateState(value: unknown, mapId: string, maps: Map<string, MapReferenceData>): unknown {
  if (Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > 2_000_000) throw new HttpError(413, "Состояние проекта превышает 2 МБ");
  const map = maps.get(mapId);
  if (!map) throw new HttpError(400, "Неизвестная карта проекта");
  try {
    const state = migrateProject(value, validationDefaults);
    validateProjectMapReferences(state, map);
    return toSharedState(state);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Некорректное состояние проекта");
  }
}
async function loadMapReferences(catalogPath: string, root: string): Promise<Map<string, MapReferenceData>> {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as Array<{ id: string; dataUrl: string }>;
  const maps = new Map<string, MapReferenceData>();
  for (const entry of catalog) {
    const filenames = [resolve(root, entry.dataUrl), resolve(root, "New event", basename(entry.dataUrl))];
    try {
      let rawText: string | undefined;
      for (const filename of filenames) {
        try {
          rawText = await readFile(filename, "utf8");
          break;
        } catch {
          // Try the next supported data location.
        }
      }
      if (!rawText) continue;
      const raw = JSON.parse(rawText) as {
        territories?: Array<{ id: string }>;
        bases?: Array<{ id: string }>;
        regions?: Array<{ id: string; interactive?: boolean }>;
      };
      maps.set(entry.id, {
        territories: raw.territories ?? raw.regions?.filter(({ interactive }) => interactive).map(({ id }) => ({ id })) ?? [],
        bases: raw.bases ?? [],
      });
    } catch {
      // A missing optional map must not prevent auth and collaboration APIs from starting.
    }
  }
  return maps;
}

export interface PlannerServerOptions {
  dataFile: string;
  staticDir?: string;
  sessionSecure?: boolean;
  authRateLimit?: { maxRequests: number; windowMs: number; trustProxy?: boolean };
  trustProxy?: boolean;
}

export async function createPlannerServer(options: PlannerServerOptions) {
  const store = new JsonStore(options.dataFile);
  await store.load();
  const liveSessions = store.data.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  if (liveSessions.length !== store.data.sessions.length) {
    store.data.sessions = liveSessions;
    await store.save();
  }
  const catalogPath = join(options.staticDir ?? process.cwd(), "data/map-catalog.json");
  let maps: Map<string, MapReferenceData>;
  try {
    maps = await loadMapReferences(catalogPath, options.staticDir ?? process.cwd());
  } catch {
    maps = await loadMapReferences(join(process.cwd(), "data/map-catalog.json"), process.cwd());
  }
  const streams = new Map<string, Set<{ response: ServerResponse; userId: string }>>();
  const authBuckets = new Map<string, { count: number; resetAt: number }>();
  const emit = (projectId: string, event: string, payload: unknown): void => {
    for (const stream of streams.get(projectId) ?? []) stream.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const closeUserStreams = (projectId: string, userId: string): void => {
    const clients = streams.get(projectId);
    if (!clients) return;
    for (const stream of clients) {
      if (stream.userId !== userId) continue;
      clients.delete(stream);
      stream.response.end();
    }
    if (!clients.size) streams.delete(projectId);
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
      if (["POST", "PUT", "DELETE"].includes(method) && request.headers.origin) {
        let originHost = "";
        try {
          originHost = new URL(request.headers.origin).host.toLowerCase();
        } catch {
          throw new HttpError(403, "Недопустимый источник запроса");
        }
        const trustedProxy = options.trustProxy ?? process.env.PLANNER_TRUST_PROXY === "true";
        const forwardedHostHeader = trustedProxy ? request.headers["x-forwarded-host"] : undefined;
        const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader;
        const requestHost = forwardedHost || request.headers.host || "";
        if (originHost !== String(requestHost).toLowerCase()) throw new HttpError(403, "Источник запроса не совпадает с хостом");
      }
      if (method === "POST" && /^\/api\/auth\/(?:login|register)$/.test(path)) {
        const policy = options.authRateLimit ?? {
          maxRequests: Number(process.env.PLANNER_AUTH_MAX_REQUESTS ?? 30),
          windowMs: Number(process.env.PLANNER_AUTH_WINDOW_MS ?? 60_000),
          trustProxy: process.env.PLANNER_TRUST_PROXY === "true",
        };
        const forwardedHeader = request.headers["x-forwarded-for"];
        const forwardedValue = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
        const forwarded = policy.trustProxy ? forwardedValue?.split(",")[0]?.trim() : undefined;
        const ip = forwarded || request.socket.remoteAddress || "unknown";
        const timestamp = Date.now();
        for (const [key, bucket] of authBuckets) if (bucket.resetAt <= timestamp) authBuckets.delete(key);
        const bucket = authBuckets.get(ip);
        if (bucket && bucket.count >= policy.maxRequests) throw new HttpError(429, "Слишком много попыток входа. Попробуйте позже.");
        if (!bucket || bucket.resetAt <= timestamp) authBuckets.set(ip, { count: 1, resetAt: timestamp + policy.windowMs });
        else bucket.count++;
      }
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
        // Password hashing yields to other requests, so uniqueness must be
        // checked again immediately before the synchronous insertion.
        if (store.data.users.some((item) => item.username === username)) throw new HttpError(409, "Логин уже занят");
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
        const mapId = String(input.mapId ?? "gene-clash-oil-clash-season-5");
        const validState = validateState(input.state, mapId, maps);
        const timestamp = now();
        const project: ProjectRecord = {
          id: randomId(),
          name: String(input.name ?? "Общий проект")
            .trim()
            .slice(0, 80),
          mapId,
          state: validState,
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
        const plans = (project.state as { plans?: Array<{ id: string }> }).plans ?? [];
        const planId = share.planId || (project.state as { currentPlanId?: string }).currentPlanId || plans[0]?.id;
        const plan = plans.find(({ id }) => id === planId);
        if (!plan) throw new HttpError(410, "План по этой ссылке удалён");
        const sharedState = toSharedState(migrateProject(project.state, validationDefaults));
        return json(response, 200, {
          project: {
            name: project.name,
            mapId: project.mapId,
            state: { ...sharedState, plans: [plan], currentPlanId: planId },
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
            "x-content-type-options": "nosniff",
            connection: "keep-alive",
          });
          response.flushHeaders();
          response.write(`retry: 2000\nevent: ready\ndata: ${JSON.stringify({ revision: project.revision })}\n\n`);
          const clients = streams.get(projectId) ?? new Set<{ response: ServerResponse; userId: string }>();
          const stream = { response, userId: user.id };
          clients.add(stream);
          streams.set(projectId, clients);
          request.on("close", () => {
            clients.delete(stream);
            if (!clients.size) streams.delete(projectId);
          });
          return;
        }
        if (action === "state" && method === "PUT") {
          access(projectId, user.id, "R4");
          const input = await body(request);
          const validState = validateState(input.state, project.mapId, maps);
          if (Number(input.baseRevision) !== project.revision)
            throw new HttpError(409, "Проект уже изменён другим участником", { project: projectView(project, user.id) });
          project.state = validState;
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
          const previous = history.filter((item) => item.revision < project.revision).sort((a, b) => b.revision - a.revision)[0];
          if (
            previous &&
            previous.authorId === user.id &&
            !previous.pinned &&
            Date.now() - new Date(previous.createdAt).getTime() <= 5 * 60_000
          )
            store.data.revisions = store.data.revisions.filter((item) => item.id !== previous.id);
          trimHistory(store.data.revisions, projectId);
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
              ...(item.pinned ? { pinned: true } : {}),
              ...(item.label ? { label: item.label } : {}),
              author: publicUser(store.data.users.find((candidate) => candidate.id === item.authorId)!),
            }));
          return json(response, 200, { revisions });
        }
        const pinMatch = action.match(/^history\/(\d+)\/pin$/);
        if (pinMatch && method === "POST") {
          access(projectId, user.id, "R4");
          const revision = store.data.revisions.find((item) => item.projectId === projectId && item.revision === Number(pinMatch[1]));
          if (!revision) throw new HttpError(404, "Версия не найдена");
          const input = await body(request);
          const label = String(input.label ?? "")
            .trim()
            .slice(0, 80);
          if (!label) throw new HttpError(400, "Укажите название закреплённой версии");
          revision.pinned = true;
          revision.label = label;
          await store.save();
          return json(response, 200, { revision });
        }
        const restoreMatch = action.match(/^history\/(\d+)\/restore$/);
        if (restoreMatch && method === "POST") {
          access(projectId, user.id, "R4");
          const source = store.data.revisions.find((item) => item.projectId === projectId && item.revision === Number(restoreMatch[1]));
          if (!source) throw new HttpError(404, "Версия не найдена");
          project.state = structuredClone(validateState(source.state, project.mapId, maps));
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
          trimHistory(store.data.revisions, projectId);
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
          const previousRole = member?.role;
          if (member) member.role = role;
          else store.data.members.push({ projectId, userId: target.id, role, joinedAt: now() });
          await store.save();
          emit(projectId, "members", { changed: true });
          if (previousRole && roleRank[role] < roleRank[previousRole]) closeUserStreams(projectId, target.id);
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
          closeUserStreams(projectId, targetId);
          return json(response, 200, { ok: true });
        }
        if (action === "share" && method === "POST") {
          access(projectId, user.id, "R4");
          const existing = store.data.shares.find((item) => item.projectId === projectId && !item.revokedAt);
          const currentPlanId = (project.state as { currentPlanId?: string }).currentPlanId;
          const share = existing ?? {
            id: randomId(8),
            projectId,
            planId: currentPlanId ?? "",
            createdBy: user.id,
            createdAt: now(),
          };
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
        const sharedAsset = path.match(/^\/share\/(assets\/.*|data\/.*|docs\/USER_GUIDE\.md|README\.md)$/);
        const requested = sharedAsset
          ? `/${sharedAsset[1]}`
          : path.startsWith("/share/")
            ? "/index.html"
            : path === "/"
              ? "/index.html"
              : path;
        let decoded: string;
        try {
          decoded = decodeURIComponent(requested);
        } catch {
          throw new HttpError(404, "Файл не найден");
        }
        const root = resolve(options.staticDir);
        const filename = resolve(root, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
        if (filename !== root && !filename.startsWith(`${root}${sep}`)) throw new HttpError(404, "Файл не найден");
        try {
          if ((await stat(filename)).isFile()) {
            const types: Record<string, string> = {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
              ".md": "text/markdown",
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".svg": "image/svg+xml",
              ".webp": "image/webp",
              ".woff": "font/woff",
              ".woff2": "font/woff2",
              ".ico": "image/x-icon",
            };
            const headers: Record<string, string> = {
              "content-type": types[extname(filename)] ?? "application/octet-stream",
              "x-content-type-options": "nosniff",
            };
            if (extname(filename) === ".html")
              headers["content-security-policy"] =
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
            if (decoded.startsWith("/assets/") && /[.-][A-Za-z0-9_-]{8,}\./.test(filename))
              headers["cache-control"] = "public, max-age=31536000, immutable";
            response.writeHead(200, headers);
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
        error: error instanceof HttpError ? error.message : "Ошибка сервера",
        ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
      });
    }
  };
  const server = createServer((request, response) => void handler(request, response));
  const sessionCleanup = setInterval(() => {
    const active = store.data.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
    if (active.length === store.data.sessions.length) return;
    store.data.sessions = active;
    void store.save().catch((error) => console.error("Could not persist expired-session cleanup", error));
  }, 60 * 60_000);
  const heartbeat = setInterval(() => {
    for (const clients of streams.values()) for (const stream of clients) stream.response.write(": heartbeat\n\n");
  }, 20_000);
  server.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(sessionCleanup);
  });
  return { server, store };
}
