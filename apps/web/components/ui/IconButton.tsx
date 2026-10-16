"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  active?: boolean;
  href?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/**
 * Icon-only control with hover/focus label tooltip.
 */
export function IconButton({
  label,
  children,
  className,
  danger,
  active,
  href,
  ...props
}: Props) {
  const classes = cn(
    "group relative inline-flex h-9 w-9 items-center justify-center rounded-card text-muted transition",
    "hover:bg-border/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    "disabled:pointer-events-none disabled:opacity-40",
    danger && "hover:text-danger",
    active && "text-accent bg-accent/10",
    className
  );

  const tip = (
    <span
      className={cn(
        "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1",
        "bg-foreground text-[11px] font-medium text-background opacity-0 shadow-sm transition",
        "group-hover:opacity-100 group-focus-visible:opacity-100"
      )}
    >
      {label}
    </span>
  );

  if (href) {
    const external = href.startsWith("/backend") || href.startsWith("http");
    if (external) {
      return (
        <a href={href} className={classes} title={label} aria-label={label}>
          {children}
          {tip}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} title={label} aria-label={label}>
        {children}
        {tip}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} title={label} aria-label={label} {...props}>
      {children}
      {tip}
    </button>
  );
}
