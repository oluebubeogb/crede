"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSession, logout, type CredeUser } from "@/lib/api";

type Prefs = {
  email_notifications: boolean;
  job_match_alerts: boolean;
  recruiter_contact: boolean;
  product_updates: boolean;
  is_public: boolean;
  show_email_on_profile: boolean;
  show_phone_on_profile: boolean;
};

const DEFAULT_PREFS: Prefs = {
  email_notifications: true,
  job_match_alerts: true,
  recruiter_contact: true,
  product_updates: false,
  is_public: true,
  show_email_on_profile: false,
  show_phone_on_profile: false,
};

const TABS = [
  { id: "account", label: "Account" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "security", label: "Security" },
  { id: "billing", label: "Billing" },
  { id: "connected", label: "Connected apps" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("account");
  const [user, setUser] = useState<CredeUser | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setUser).catch(() => setUser(null));
    api
      .get<{ preferences?: Prefs; username?: string; is_public?: boolean }>("/profile/me")
      .then((p) => {
        if (p.preferences) setPrefs({ ...DEFAULT_PREFS, ...p.preferences });
        if (typeof p.is_public === "boolean") {
          setPrefs((prev) => ({ ...prev, is_public: p.is_public as boolean }));
        }
        if (p.username) setUsername(p.username);
      })
      .catch(console.error);
  }, []);

  async function savePrefs(next: Prefs) {
    setSaving(true);
    setMsg(null);
    try {
      await api.patch("/profile/me", {
        preferences: next,
        is_public: next.is_public,
        username: username || undefined,
      });
      setPrefs(next);
      setMsg("Saved");
      setTimeout(() => setMsg(null), 2000);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const sourceLabel =
    user?.source === "collab"
      ? "Collab Accounts"
      : user?.source === "local"
        ? "Crede local account"
        : "Signed in";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted">Account and preferences for your Crede identity.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-btn px-3 py-2 text-sm transition ${
              tab === t.id
                ? "bg-accent font-medium text-white"
                : "text-muted nav-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-success">{msg}</p>}

      {tab === "account" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Account</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="font-medium">{user?.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Name</dt>
              <dd className="font-medium">{user?.display_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Sign-in</dt>
              <dd className="font-medium">{sourceLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Role</dt>
              <dd className="font-medium capitalize">{user?.role || "professional"}</dd>
            </div>
          </dl>
          {user?.source === "collab" && (
            <p className="text-sm text-muted">
              Password and email are managed in{" "}
              <a
                href={process.env.NEXT_PUBLIC_ACCOUNTS_URL || "https://accounts.collab.name.ng"}
                className="text-accent underline"
                target="_blank"
                rel="noreferrer"
              >
                Collab Accounts
              </a>
              .
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      )}

      {tab === "notifications" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Notifications</h2>
          {(
            [
              ["email_notifications", "Email notifications"],
              ["job_match_alerts", "Job match alerts"],
              ["recruiter_contact", "Recruiter contact requests"],
              ["product_updates", "Product updates"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => {
                  const next = { ...prefs, [key]: e.target.checked };
                  setPrefs(next);
                }}
                className="h-4 w-4 accent-blue-600"
              />
            </label>
          ))}
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={() => savePrefs(prefs)}
          >
            {saving ? "Saving…" : "Save notifications"}
          </button>
        </div>
      )}

      {tab === "privacy" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Privacy</h2>
          <div>
            <label className="label">Public username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="your-handle"
            />
            <p className="mt-1 text-xs text-muted">
              Public profile at /u/{username || "username"}
            </p>
          </div>
          {(
            [
              ["is_public", "Public profile visible"],
              ["show_email_on_profile", "Show email on public profile"],
              ["show_phone_on_profile", "Show phone on public profile"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                className="h-4 w-4 accent-blue-600"
              />
            </label>
          ))}
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={() => savePrefs(prefs)}
          >
            {saving ? "Saving…" : "Save privacy"}
          </button>
        </div>
      )}

      {tab === "security" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Security</h2>
          {user?.source === "collab" ? (
            <p className="text-sm text-muted">
              Change your password and manage sessions in{" "}
              <a
                href={
                  (process.env.NEXT_PUBLIC_ACCOUNTS_URL || "https://accounts.collab.name.ng") +
                  "/settings"
                }
                className="text-accent underline"
                target="_blank"
                rel="noreferrer"
              >
                Collab Accounts security settings
              </a>
              .
            </p>
          ) : (
            <p className="text-sm text-muted">
              Local accounts: use a strong unique password. Password change UI can be added when
              AUTH_MODE=local is primary; for production prefer Collab Accounts SSO.
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={handleLogout}>
            Sign out of this device
          </button>
        </div>
      )}

      {tab === "billing" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Billing</h2>
          <p className="text-sm text-muted">
            You are on the <span className="font-medium text-foreground">Free</span> plan.
          </p>
          <ul className="list-inside list-disc text-sm text-muted">
            <li>Career timeline & verification</li>
            <li>CV generation (fair use)</li>
            <li>Recruiter search (limited)</li>
          </ul>
          <p className="text-xs text-muted">Professional and Enterprise plans coming soon.</p>
        </div>
      )}

      {tab === "connected" && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Connected apps</h2>
          <div className="flex items-center justify-between rounded-btn border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Collab Accounts</p>
              <p className="text-xs text-muted">
                {user?.source === "collab" ? "Connected — identity provider" : "Not connected"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user?.source === "collab"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "badge-muted text-muted"
              }`}
            >
              {user?.source === "collab" ? "Active" : "Local only"}
            </span>
          </div>
          <p className="text-xs text-muted">
            More integrations (calendar, ATS, LinkedIn import) will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
