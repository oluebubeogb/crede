"use client";

import Link from "next/link";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const professionalNav = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/timeline", label: "Career Timeline", icon: GitBranch },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/certifications", label: "Certifications", icon: Award },
  { href: "/verification", label: "Verification", icon: ShieldCheck },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/generate", label: "Generate CV", icon: FileText },
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

export function Sidebar() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("crede-theme");
    const preferDark =
      stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(preferDark);
    document.documentElement.classList.toggle("dark", preferDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("crede-theme", next ? "dark" : "light");
  }

  const isRecruiter = pathname.startsWith("/recruiter");

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-btn bg-accent text-sm font-bold text-white">
          C
        </div>
        <span className="text-lg font-semibold tracking-tight">Crede</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted">
          Professional
        </p>
        {professionalNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm transition",
                active ? "font-medium text-accent" : "text-muted nav-hover"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        {/* Segment divider between Settings and Recruiting */}
        <div className="my-4 px-3">
          <hr className="border-border" />
        </div>

        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted">
          Recruiting
        </p>
        <div className="space-y-0.5">
          {recruiterNav.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(item.href + "/") ||
              (isRecruiter && item.href === "/recruiter/dashboard" && pathname === "/recruiter");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm transition",
                  active ? "font-medium text-accent" : "text-muted nav-hover"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-sm text-muted nav-hover"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </aside>
  );
}
