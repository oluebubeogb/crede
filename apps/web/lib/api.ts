const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";
const ACCOUNTS = process.env.NEXT_PUBLIC_ACCOUNTS_URL || "http://localhost:1997";

export function accountsLoginUrl(returnTo?: string) {
  const next = returnTo || (typeof window !== "undefined" ? window.location.href : "/dashboard");
  return `${ACCOUNTS}/?return_to=${encodeURIComponent(next)}`;
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
    if (typeof window !== "undefined") {
      window.location.href = accountsLoginUrl();
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export { API, ACCOUNTS };
