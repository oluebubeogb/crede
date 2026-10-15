"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { getSession } from "@/lib/api";

/**
 * Two-column shell: collapsible sidebar + fluid main with global search bar.
 * Uses flex so content never sits under the sidebar.
 * Silently refreshes the session cookie on mount so active users stay signed in.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    getSession().catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <SearchBar />
        <main className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
