"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Users, Briefcase, Plus, Home, Menu, Wand2, PenSquare, LogOut, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/me";
import { logout } from "@/lib/api";
import { Sheet, SoftIcon } from "@/components/ui/kit";
import { professionalNav, recruiterNav, accountNav, adminItem, isActive } from "@/components/nav";
import { useTheme } from "@/components/Sidebar";

/** Native-feeling tab bar for phones: Community · Home · Create · Jobs · More */
export function BottomNav() {
  const pathname = usePathname();
  const { me } = useMe();
  const { dark, toggle } = useTheme();
  const [more, setMore] = useState(false);
  const [create, setCreate] = useState(false);

  const tabs = [
    { href: "/feed", label: "Community", icon: Users },
    { href: "/dashboard", label: "Home", icon: Home },
    null,
    { href: "/opportunities", label: "Jobs", icon: Briefcase },
  ] as const;

  return (
    <>
      <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid h-[var(--nav-h)] max-w-md grid-cols-5 items-center px-2">
          {tabs.map((t, i) =>
            t ? (
              <Link key={t.href} href={t.href} aria-current={isActive(pathname, t.href) ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium transition-colors",
                  isActive(pathname, t.href) ? "text-foreground" : "text-muted")}>
                <t.icon className="h-[22px] w-[22px]" strokeWidth={isActive(pathname, t.href) ? 2.3 : 1.8} />
                {t.label}
              </Link>
            ) : (
              <div key={i} className="flex justify-center">
                <button type="button" onClick={() => setCreate(true)} aria-label="Create"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg transition active:scale-95">
                  <Plus className="h-5 w-5" strokeWidth={2.4} />
                </button>
              </div>
            )
          )}
          <button type="button" onClick={() => setMore(true)}
            className={cn("flex flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium", more ? "text-foreground" : "text-muted")}>
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.8} />
            More
          </button>
        </div>
      </nav>

      <Sheet open={create} onClose={() => setCreate(false)} title="Create">
        <div className="grid gap-2 pb-2">
          <Link href="/feed?compose=1" onClick={() => setCreate(false)} className="card card-hover group flex items-center gap-3 p-3">
            <SoftIcon icon={PenSquare} tint="violet" />
            <span><span className="block text-sm font-medium">Write a post</span><span className="block text-xs text-muted">Share a win, a question or an opening</span></span>
          </Link>
          <Link href="/generate" onClick={() => setCreate(false)} className="card card-hover group flex items-center gap-3 p-3">
            <SoftIcon icon={Wand2} tint="blue" />
            <span><span className="block text-sm font-medium">CV or cover letter</span><span className="block text-xs text-muted">Tailored to a job in under a minute</span></span>
          </Link>
        </div>
      </Sheet>

      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <div className="space-y-4 pb-2">
          {[
            { label: "Professional", items: professionalNav.filter((n) => !["/feed", "/dashboard", "/opportunities"].includes(n.href)) },
            { label: "Recruiting", items: recruiterNav.filter((n) => n.href !== "/orgs") },
            { label: "Account", items: [...accountNav, ...(me?.is_admin ? [adminItem] : [])] },
          ].map((g) => (
            <div key={g.label}>
              <p className="eyebrow mb-1.5 px-1">{g.label}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} onClick={() => setMore(false)}
                    className={cn("group flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-1 py-3 text-center text-[11.5px] leading-tight transition",
                      isActive(pathname, it.href) && "border-border-strong")}>
                    <SoftIcon icon={it.icon} tint={it.tint} size="sm" />
                    {it.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <button type="button" onClick={toggle} className="flex items-center gap-2 text-muted">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? "Light mode" : "Dark mode"}
            </button>
            <button type="button" onClick={async () => { await logout(); location.href = "/login"; }} className="flex items-center gap-2 text-muted">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
