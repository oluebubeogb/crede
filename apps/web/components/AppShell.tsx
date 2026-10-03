"use client";

import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-sidebar min-h-screen">
        <div className="mx-auto max-w-content px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
