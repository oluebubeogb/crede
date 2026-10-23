// Server-safe (no "use client") so marketing pages can render it statically.
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────── Soft tinted icon tile ───────── */
export type Tint = "blue" | "violet" | "sky" | "amber" | "rose" | "emerald" | "gray";
export function SoftIcon({
  icon: Icon, tint = "blue", size = "md", className,
}: { icon: LucideIcon; tint?: Tint; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-2xl" : "h-10 w-10";
  const ic = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-[18px] w-[18px]";
  return (
    <span className={cn("soft-icon", `tint-${tint}`, box, className)}>
      <Icon className={ic} strokeWidth={1.9} />
    </span>
  );
}

