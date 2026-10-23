"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { MeProvider } from "@/lib/me";
import { Toaster } from "@/components/ui/kit";
import { getSession } from "@/lib/api";

/** Desktop: sidebar + top bar. Mobile: app bar + bottom tab bar. */
export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    getSession().catch(() => {});
  }, []);

  return (
    <MeProvider>
      <div className="flex min-h-[100dvh] bg-background">
        <Sidebar />
        <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-content px-4 pb-nav pt-5 sm:px-6 md:pb-12 md:pt-8">{children}</div>
          </main>
        </div>
        <BottomNav />
        <Toaster />
      </div>
    </MeProvider>
  );
}
