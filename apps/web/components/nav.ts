import {
  Home, GitBranch, Sparkles, Award, ShieldCheck, FileText, Briefcase, User, Settings, Building2,
  Search, LayoutDashboard, History, Users, Wand2, Shield, Bell, type LucideIcon,
} from "lucide-react";
import type { Tint } from "@/components/ui/kit";

export type NavItem = { href: string; label: string; icon: LucideIcon; tint: Tint };

export const professionalNav: NavItem[] = [
  { href: "/feed", label: "Community", icon: Users, tint: "violet" },
  { href: "/dashboard", label: "Home", icon: Home, tint: "blue" },
  { href: "/timeline", label: "Career timeline", icon: GitBranch, tint: "sky" },
  { href: "/skills", label: "Skills", icon: Sparkles, tint: "amber" },
  { href: "/certifications", label: "Certifications", icon: Award, tint: "rose" },
  { href: "/verification", label: "Verification", icon: ShieldCheck, tint: "emerald" },
  { href: "/generate", label: "Create documents", icon: Wand2, tint: "violet" },
  { href: "/documents", label: "Documents", icon: FileText, tint: "blue" },
  { href: "/history", label: "Job analyses", icon: History, tint: "sky" },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase, tint: "amber" },
  { href: "/orgs", label: "Organisations", icon: Building2, tint: "emerald" },
];

export const accountNav: NavItem[] = [
  { href: "/notifications", label: "Notifications", icon: Bell, tint: "rose" },
  { href: "/profile", label: "Profile", icon: User, tint: "blue" },
  { href: "/settings", label: "Settings", icon: Settings, tint: "gray" },
];

export const recruiterNav: NavItem[] = [
  { href: "/recruiter/dashboard", label: "Recruiter home", icon: LayoutDashboard, tint: "blue" },
  { href: "/recruiter/candidates", label: "Candidates", icon: Search, tint: "violet" },
  { href: "/recruiter/jobs", label: "Jobs", icon: Briefcase, tint: "amber" },
  { href: "/orgs", label: "Organisations", icon: Building2, tint: "emerald" },
];

export const adminItem: NavItem = { href: "/admin", label: "Admin", icon: Shield, tint: "rose" };

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/") ||
    (href === "/feed" && pathname.startsWith("/post/")) ||
    (href === "/recruiter/dashboard" && pathname === "/recruiter");
}
