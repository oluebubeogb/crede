"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, Sun, PanelLeft, User, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/me";
import { logout } from "@/lib/api";
import { Avatar, VerifiedBadge } from "@/components/ui/kit";
import { professionalNav, recruiterNav, accountNav, adminItem, isActive, type NavItem } from "@/components/nav";

type Mode = "professional" | "recruiting";

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("crede-theme", next ? "dark" : "light");
  }
  return { dark, toggle };
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined}
      className={cn("group flex items-center gap-3 rounded-xl text-[14px] transition-colors",
        collapsed ? "h-10 w-10 justify-center" : "px-2 py-1.5",
        active ? "bg-surface font-medium text-foreground shadow-[var(--shadow)] ring-1 ring-border" : "text-muted nav-hover")}>
      <span className={cn("soft-icon h-7 w-7 rounded-lg", `tint-${item.tint}`, !active && "bg-transparent")}>
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { me } = useMe();
  const { dark, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<Mode>("professional");

  useEffect(() => {
    if (localStorage.getItem("crede-sidebar-collapsed") === "true") setCollapsed(true);
  }, []);
  useEffect(() => {
    if (pathname.startsWith("/recruiter")) setMode("recruiting");
  }, [pathname]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("crede-sidebar-collapsed", String(next));
  }

  const items = mode === "professional" ? professionalNav : recruiterNav;
  const extra = [...accountNav, ...(me?.is_admin ? [adminItem] : [])];

  return (
    <aside className={cn("sticky top-0 z-40 hidden h-[100dvh] shrink-0 flex-col border-r border-border bg-background transition-[width] duration-300 md:flex",
      collapsed ? "w-[72px]" : "w-[248px]")}>
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
        {!collapsed && (
          <Link href="/feed" className="flex items-center gap-2">
            <Image src="/icons/logo-64.png" alt="" width={26} height={26} priority />
            <span className="text-[15px] font-semibold tracking-tight">Crede</span>
          </Link>
        )}
        <button type="button" title={collapsed ? "Expand" : "Collapse"} onClick={toggleCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted nav-hover">
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <div className={cn("shrink-0 pb-2", collapsed ? "flex flex-col items-center gap-1" : "px-3")}>
        <div className={cn("flex rounded-xl bg-surface-2 p-0.5", collapsed && "flex-col")}>
          {([["professional", "Professional", User], ["recruiting", "Recruiting", Users]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" title={label} onClick={() => setMode(m)}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-xs font-medium transition",
                collapsed && "h-8 w-8 flex-none",
                mode === m ? "bg-surface text-foreground shadow-[var(--shadow)]" : "text-muted hover:text-foreground")}>
              <Icon className="h-3.5 w-3.5" />
              {!collapsed && label}
            </button>
          ))}
        </div>
      </div>

      <nav className={cn("flex-1 space-y-0.5 overflow-y-auto pb-3", collapsed ? "flex flex-col items-center px-2" : "px-3")}>
        {items.map((it) => <NavLink key={it.href} item={it} active={isActive(pathname, it.href)} collapsed={collapsed} />)}
        <div className={cn("my-2 border-t border-border", collapsed ? "w-8" : "mx-2")} />
        {extra.map((it) => <NavLink key={it.href} item={it} active={isActive(pathname, it.href)} collapsed={collapsed} />)}
      </nav>

      <div className={cn("shrink-0 border-t border-border p-3", collapsed && "flex flex-col items-center gap-2")}>
        {me && !collapsed && (
          <Link href="/profile" className="mb-2 flex items-center gap-2.5 rounded-xl p-1.5 nav-hover">
            <Avatar name={me.full_name || me.email} src={me.avatar_url} size={32} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 truncate text-sm font-medium">
                <span className="truncate">{me.full_name || me.email}</span>
                <VerifiedBadge level={me.badge_level} size={14} />
              </span>
              <span className="block truncate text-xs text-muted">{me.claims?.label || me.headline}</span>
            </span>
          </Link>
        )}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "justify-between")}>
          <button type="button" onClick={toggle} title={dark ? "Light mode" : "Dark mode"}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted nav-hover">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed && (dark ? "Light" : "Dark")}
          </button>
          <button type="button" title="Sign out" onClick={async () => { await logout(); location.href = "/login"; }}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted nav-hover">
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
