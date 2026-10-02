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

/**
 * Demo mode (in-memory fake data + demo logins) is ONLY allowed in the hosted
 * web preview. It is fully disabled in the Electron desktop app and on any
 * local machine (localhost / 127.0.0.1), where the real backend must be used.
 */
export function isDemoAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Electron/i.test(ua)) return false;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "") return false;
  return true;
}

export function loadAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AuthState) : null;
    // Purge any leftover demo session where demo mode is not allowed.
    if (parsed && !isDemoAllowed() && String(parsed.accessToken ?? "").startsWith("demo.")) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
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
  const demoOk = isDemoAllowed();
  if (demoOk && a && isDemoToken(a.accessToken)) {
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
    if (demoOk && a) {
      const out = demoHandle(path, init);
      if (out !== null) return out as T;
    }
    throw new ApiError(0, demoOk
      ? "Backend unreachable. Start NestJS at " + API_BASE_URL + " or sign in with a demo user (admin/admin, prer/prer, gaya/gaya)."
      : "Cannot reach the lab server at " + API_BASE_URL + ". Please make sure the backend is running.");
  }
  const tFetch = performance.now() - t0;
  const text = await res.text();
  const tTotal = performance.now() - t0;
  console.log(`${label} -> ${res.status} fetch=${tFetch.toFixed(0)}ms total=${tTotal.toFixed(0)}ms bytes=${text.length}`);
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("lab:auth-cleared"));
    }
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
