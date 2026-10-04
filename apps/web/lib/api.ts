const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";
const ACCOUNTS = process.env.NEXT_PUBLIC_ACCOUNTS_URL || "http://localhost:1997";

export type CollabUser = {
  id: string;
  email: string;
  display_name?: string;
  products?: string[];
};

/** Check existing Collab session (shared .collab.name.ng cookies). */
export async function getAccountsSession(): Promise<CollabUser | null> {
  try {
    const res = await fetch(`${ACCOUNTS}/auth/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Login against Collab Accounts — sets access_token / refresh_token cookies. */
export async function loginWithCollab(email: string, password: string): Promise<CollabUser> {
  const res = await fetch(`${ACCOUNTS}/auth/login`, {
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
  return data.user as CollabUser;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
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
    throw new Error(typeof detail === "string" ? detail : res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export { API, ACCOUNTS };
