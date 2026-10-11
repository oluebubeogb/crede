"use client";

import { logout } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="mx-auto max-w-content space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted">Account and preferences.</p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Account</h2>
        <p className="text-sm text-muted">
          You are signed in with a Crede local account. Collab Accounts SSO can be re-enabled later via{" "}
          <code className="text-xs">AUTH_MODE=collab</code> on the API.
        </p>
        <button type="button" className="btn-secondary" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <div className="card space-y-2 opacity-70">
        <h2 className="font-semibold">Coming soon</h2>
        <p className="text-sm text-muted">Notifications · Privacy · Security · Billing · Connected apps</p>
      </div>
    </div>
  );
}
