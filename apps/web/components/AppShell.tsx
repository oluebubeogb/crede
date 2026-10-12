"use client";

import { Sidebar } from "./Sidebar";

/**
 * Two-column shell: fixed-width sidebar + fluid main.
 * Uses flex (not fixed+margin) so content never sits under the sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="min-h-screen min-w-0 flex-1">
        <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
