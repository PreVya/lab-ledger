import { z } from "zod";

const STORAGE_KEY = "lab.auth";

export const RoleSchema = z.enum(["admin", "receptionist", "technician", "doctor"]);
export type Role = z.infer<typeof RoleSchema>;

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

export interface AuthState {
  accessToken: string;
  user: AuthUser;
}

export function loadAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function saveAuth(s: AuthState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearAuth() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
  "http://localhost:3000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const h = new Headers(headers);
  if (!h.has("Content-Type") && rest.body) h.set("Content-Type", "application/json");
  const a = auth ? loadAuth() : null;
  if (a) h.set("Authorization", `Bearer ${a.accessToken}`);

  // Demo-mode short-circuit: if signed in with a demo token, serve from in-memory store.
  const { isDemoToken, demoHandle } = await import("./demo-mode");
  if (a && isDemoToken(a.accessToken)) {
    const out = demoHandle(path, init);
    if (out !== null) return out as T;
  }

  let res: Response;
  const method = (rest.method ?? "GET").toUpperCase();
  const label = `[perf] FE ${method} ${path}`;
  const t0 = performance.now();
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, { ...rest, headers: h });
  } catch (netErr) {
    console.log(`${label} -> NETWORK ERROR in ${(performance.now() - t0).toFixed(0)}ms`);
    if (a) {
      const out = demoHandle(path, init);
      if (out !== null) return out as T;
    }
    throw new ApiError(0, "Backend unreachable. Start NestJS at " + API_BASE_URL + " or sign in with a demo user (admin/admin, prer/prer, gaya/gaya).");
  }
  const tFetch = performance.now() - t0;
  const text = await res.text();
  const tTotal = performance.now() - t0;
  console.log(`${label} -> ${res.status} fetch=${tFetch.toFixed(0)}ms total=${tTotal.toFixed(0)}ms bytes=${text.length}`);
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) clearAuth();
    const msg =
      (body && typeof body === "object" && "message" in body && (body as any).message) ||
      res.statusText ||
      "Request failed";
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(", ") : String(msg), body);
  }
  return body as T;
}

function safeJson(t: string) {
  try { return JSON.parse(t); } catch { return t; }
}
