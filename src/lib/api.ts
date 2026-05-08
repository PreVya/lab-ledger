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
  if (auth) {
    const a = loadAuth();
    if (a) h.set("Authorization", `Bearer ${a.accessToken}`);
  }
  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...rest, headers: h });
  const text = await res.text();
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
