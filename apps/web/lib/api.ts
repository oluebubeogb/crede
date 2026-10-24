/**
 * Browser calls same-origin /backend/* (Next.js rewrite → Crede API).
 * Server-side uses NEXT_PUBLIC_API_URL.
 */

function apiBase(): string {
  if (typeof window !== "undefined") {
    return "/backend";
  }
  return process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export type CredeUser = {
  id: string;
  email: string;
  display_name?: string;
  role?: string;
  source?: string;
  products?: string[];
};

/** Current session via Crede API /auth/me */
export async function getSession(): Promise<CredeUser | null> {
  try {
    const res = await fetch(`${apiBase()}/api/auth/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Local (or hybrid) login against Crede API */
export async function login(email: string, password: string): Promise<CredeUser> {
  const res = await fetch(`${apiBase()}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(detailMessage(detail, res.statusText || "Login failed"));
  }
  const data = await res.json();
  return data.user as CredeUser;
}

/** Local signup */
export async function signup(
  email: string,
  password: string,
  fullName?: string
): Promise<CredeUser> {
  const res = await fetch(`${apiBase()}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(detailMessage(detail, "Signup failed"));
  }
  const data = await res.json();
  return data.user as CredeUser;
}

export async function logout(): Promise<void> {
  await fetch(`${apiBase()}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export const API =
  typeof window !== "undefined" ? "/backend" : process.env.NEXT_PUBLIC_API_URL || "";

// Back-compat aliases
export const getAccountsSession = getSession;
export const loginWithCollab = login;
export type CollabUser = CredeUser;

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(", ") || "Please check the form";
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; missing?: string[] };
    if (d.message) return d.missing?.length ? `${d.message}: ${d.missing.join(", ")}` : d.message;
  }
  return fallback || "Request failed";
}

/** Core request helper — paths may be "/api/..." or "/profile/me" (auto-prefixed with /api) */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isForm = false,
  init?: RequestInit
): Promise<T> {
  const base = apiBase();
  let url: string;
  if (path.startsWith("http")) {
    url = path;
  } else if (path.startsWith("/api/") || path.startsWith("/backend")) {
    url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  } else {
    // shorthand: "/profile/me" → "/backend/api/profile/me"
    url = `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (isForm) {
      payload = body as FormData;
      // let browser set multipart boundary
      delete headers["Content-Type"];
    } else if (typeof body === "string") {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      payload = body;
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: payload,
    ...init,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(detailMessage(err.detail, res.statusText), res.status, err.detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * Unified API client:
 *   await api<T>("/api/timeline")                    // GET
 *   await api("/api/timeline", { method: "POST", body: JSON.stringify(...) })
 *   await api.get<T>("/profile/me")
 *   await api.patch("/profile/me", { ... })
 *   await api.postForm("/verification/x/upload", formData)
 *   await api.delete("/documents/1")
 */
async function apiFn<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  let body: unknown = undefined;
  if (init?.body !== undefined && init.body !== null) {
    body = init.body;
  }
  return request<T>(method, path, body, false, init);
}

export const api = Object.assign(apiFn, {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  postForm: <T>(path: string, form: FormData) => request<T>("POST", path, form, true),
});
