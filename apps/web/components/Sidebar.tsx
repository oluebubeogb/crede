"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  GitBranch,
  Sparkles,
  Award,
  ShieldCheck,
  FileText,
  Briefcase,
  User,
  Settings,
  Moon,
  Sun,
  Building2,
  Search,
  LayoutDashboard,
  PanelLeft,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { TextAction } from "@/components/ui/TextAction";

const professionalNav = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/timeline", label: "Career Timeline", icon: GitBranch },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/certifications", label: "Certifications", icon: Award },
  { href: "/verification", label: "Verification", icon: ShieldCheck },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/generate", label: "Generate Files", icon: FileText },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

const recruiterNav = [
  { href: "/recruiter/dashboard", label: "Recruiter home", icon: LayoutDashboard },
  { href: "/recruiter/candidates", label: "Candidates", icon: Search },
  { href: "/recruiter/jobs", label: "Jobs", icon: Briefcase },
  { href: "/recruiter/organizations", label: "Organizations", icon: Building2 },
];

type Mode = "professional" | "recruiting";

export function Sidebar() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<Mode>("professional");

  useEffect(() => {
    const stored = localStorage.getItem("crede-theme");
    const preferDark =
      stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(preferDark);
    document.documentElement.classList.toggle("dark", preferDark);

    const storedCollapsed = localStorage.getItem("crede-sidebar-collapsed");
    if (storedCollapsed === "true") setCollapsed(true);

    // Prefer mode from path
    if (pathname.startsWith("/recruiter")) {
      setMode("recruiting");
    }
  }, [pathname]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("crede-theme", next ? "dark" : "light");
  }

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("crede-sidebar-collapsed", String(next));
  }

  const navItems = mode === "professional" ? professionalNav : recruiterNav;
  const sectionLabel = mode === "professional" ? "Professional" : "Recruiting";

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-border bg-background transition-all duration-300 ease-in-out",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar"
      )}
    >
      {/* Line 1: Logo + Crede | mode icons + collapse */}
      <div
        className={cn(
          "relative flex h-14 shrink-0 items-center border-b border-border",
          collapsed ? "flex-col justify-center gap-1 px-1 py-2 h-auto min-h-14" : "justify-between px-3"
        )}
      >
        <div className={cn("flex items-center gap-2 min-w-0", collapsed && "justify-center")}>
          <Image
            src="/icons/logo-128.png"
            alt="Crede"
            width={32}
            height={32}
            className="shrink-0"
            priority
            quality={100}
          />
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight text-foreground truncate">
              Crede
            </span>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              title="Professional"
              onClick={() => setMode("professional")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-card transition",
                mode === "professional"
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-border/50 hover:text-foreground"
              )}
            >
              <User className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Recruiting"
              onClick={() => setMode("recruiting")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-card transition",
                mode === "recruiting"
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-border/50 hover:text-foreground"
              )}
            >
              <Users className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Collapse sidebar"
              onClick={toggleCollapse}
              className="flex h-8 w-8 items-center justify-center rounded-card text-muted transition hover:bg-border/50 hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        )}

        {collapsed && (
          <button
            type="button"
            title="Expand sidebar"
            onClick={toggleCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-card text-muted transition hover:bg-border/50 hover:text-foreground"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Line 2: Section heading */}
      {!collapsed && (
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {sectionLabel}
          </h2>
          <div className="mt-2 border-b border-border" />
        </div>
      )}

      {/* Collapsed mode switcher */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 py-3 border-b border-border">
          <button
            type="button"
            title="Professional"
            onClick={() => setMode("professional")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-card transition",
              mode === "professional"
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-border/50 hover:text-foreground"
            )}
          >
            <User className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Recruiting"
            onClick={() => setMode("recruiting")}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-card transition",
              mode === "recruiting"
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-border/50 hover:text-foreground"
            )}
          >
            <Users className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Nav items */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto",
          collapsed ? "px-1.5 py-2 space-y-1" : "space-y-0.5 px-3 pb-3"
        )}
      >
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + "/") ||
            (mode === "recruiting" &&
              item.href === "/recruiter/dashboard" &&
              pathname === "/recruiter");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-card text-sm transition",
                collapsed
                  ? "justify-center h-10 w-full"
                  : "px-3 py-2.5",
                active ? "font-medium text-accent bg-accent/10" : "text-muted nav-hover"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: theme toggle */}
      <div
        className={cn(
          "shrink-0 border-t border-border",
          collapsed ? "p-2 flex justify-center" : "p-3"
        )}
      >
        <TextAction
          type="button"
          variant="muted"
          onClick={toggleTheme}
          title={dark ? "Light mode" : "Dark mode"}
          className={cn(
            "flex items-center gap-3 no-underline hover:no-underline",
            collapsed
              ? "h-10 w-10 justify-center rounded-card"
              : "w-full px-3 py-2.5"
          )}
        >
          {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && (dark ? "Light mode" : "Dark mode")}
        </TextAction>
      </div>
    </aside>
  );
}
