/**
 * Browser calls same-origin /backend/* (Next.js rewrite → Crede API).
 */
function apiBase(): string {
  if (typeof window !== "undefined") {
    return "/backend";
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";
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
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : res.statusText || "Login failed";
    throw new Error(msg);
  }
  const data = await res.json();
  return data.user as CredeUser;
}

/** Local signup */
export async function signup(email: string, password: string, fullName?: string): Promise<CredeUser> {
  const res = await fetch(`${apiBase()}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, full_name: fullName || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(typeof detail === "string" ? detail : "Signup failed");
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(typeof detail === "string" ? detail : res.statusText || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const API = typeof window !== "undefined" ? "/backend" : process.env.NEXT_PUBLIC_API_URL || "";

// Back-compat aliases
export const getAccountsSession = getSession;
export const loginWithCollab = login;
export type CollabUser = CredeUser;
