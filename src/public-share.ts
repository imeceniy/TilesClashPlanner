import type { PlannerState } from "./types";

interface PublicSharePayload {
  format: 1;
  mapId: string;
  createdAt: string;
  state: PlannerState;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createPublicViewUrl(state: PlannerState, mapId: string): Promise<string> {
  const currentPlan = state.plans.find(({ id }) => id === state.currentPlanId) ?? state.plans[0];
  if (!currentPlan) throw new Error("Нет плана для публикации");
  const publicState: PlannerState = {
    ...structuredClone(state),
    plans: [structuredClone(currentPlan)],
    currentPlanId: currentPlan.id,
  };
  const payload: PublicSharePayload = { format: 1, mapId, createdAt: new Date().toISOString(), state: publicState };
  const bytes = textEncoder.encode(JSON.stringify(payload));
  const canCompress = typeof CompressionStream !== "undefined";
  const encoded = `${canCompress ? "g" : "j"}.${bytesToBase64Url(canCompress ? await gzip(bytes) : bytes)}`;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `view=${encoded}`;
  return url.toString();
}

export async function readPublicViewFromHash(): Promise<PublicSharePayload | null> {
  const match = window.location.hash.match(/^#view=([gj])\.([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const bytes = base64UrlToBytes(match[2]!);
  const decoded = textDecoder.decode(match[1] === "g" ? await gunzip(bytes) : bytes);
  const payload = JSON.parse(decoded) as PublicSharePayload;
  if (payload.format !== 1 || typeof payload.mapId !== "string" || !payload.state) throw new Error("Некорректная публичная ссылка");
  return payload;
}
