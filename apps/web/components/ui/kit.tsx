"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, X, type LucideIcon } from "lucide-react";
import { cn, initials, tintFor } from "@/lib/utils";

import { SoftIcon, type Tint } from "./soft-icon";
export { SoftIcon, type Tint };

/* ───────── Skeletons ───────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}
export function SkeletonCard({ lines = 3, avatar = false }: { lines?: number; avatar?: boolean }) {
  return (
    <div className="card space-y-3" aria-busy>
      {avatar && (
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
export function SkeletonList({ n = 3, avatar = false, lines = 3 }: { n?: number; avatar?: boolean; lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => <SkeletonCard key={i} avatar={avatar} lines={lines} />)}
    </div>
  );
}

/* ───────── Empty / error states ───────── */
export function EmptyState({
  icon, tint = "blue", title, body, action,
}: { icon: LucideIcon; tint?: Tint; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="animate-in flex flex-col items-center px-6 py-12 text-center">
      <SoftIcon icon={icon} tint={tint} size="lg" />
      <p className="mt-4 text-[15px] font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <span className="text-danger">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="link ml-2">Try again</button>
      )}
    </div>
  );
}

/* ───────── Page header ───────── */
export function PageHeader({
  title, lead, action, eyebrow,
}: { title: string; lead?: React.ReactNode; action?: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ───────── Avatar + badge ───────── */
export function Avatar({
  name, src, size = 40, className,
}: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name || ""} style={style} onError={() => setBroken(true)}
      className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", className)} />;
  }
  return (
    <span style={style} className={cn("soft-icon shrink-0 rounded-full font-semibold", tintFor(name), className)} aria-label={name || undefined}>
      {initials(name)}
    </span>
  );
}

export function VerifiedBadge({ level, className, size = 16 }: { level?: string | null; className?: string; size?: number }) {
  if (!level || level === "none") return null;
  const green = level === "green";
  return (
    <span title={green ? "Verified: identity and key claims confirmed by issuers" : "Identity verified by Crede"}
      className={cn("inline-flex shrink-0", className)}>
      <BadgeCheck style={{ width: size, height: size }} strokeWidth={2.2}
        className={green ? "text-success" : "text-muted"} fill={green ? "color-mix(in srgb, var(--success) 16%, transparent)" : "color-mix(in srgb, var(--muted) 14%, transparent)"} />
      <span className="sr-only">{green ? "Verified" : "Identity verified"}</span>
    </span>
  );
}

export function OrgMark({ name, src, size = 40 }: { name?: string | null; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover ring-1 ring-border" />;
  }
  return (
    <span style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn("soft-icon shrink-0 rounded-xl font-semibold", tintFor(name))}>
      {(name || "?").trim()[0]?.toUpperCase()}
    </span>
  );
}

/* ───────── Segmented tabs ───────── */
export function Tabs<T extends string>({
  value, onChange, items, className,
}: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button key={it.value} role="tab" aria-selected={active} type="button" onClick={() => onChange(it.value)}
            className={cn("relative shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors",
              active ? "bg-foreground text-background font-medium" : "text-muted hover:bg-surface-2 hover:text-foreground")}>
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className={cn("ml-1.5 tabular text-xs", active ? "opacity-70" : "text-muted")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── Sheet / modal (bottom sheet on mobile, dialog on desktop) ───────── */
export function Sheet({
  open, onClose, title, children, footer, wide = false,
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-in" onClick={onClose} />
      <div className={cn(
        "animate-in relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface md:rounded-3xl",
        wide ? "md:max-w-2xl" : "md:max-w-lg")} style={{ boxShadow: "var(--shadow-hover)" }}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border md:hidden" />
        {title && (
          <div className="flex items-center justify-between px-5 pb-2 pt-3 md:pt-5">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-muted nav-hover">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="safe-bottom border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ───────── Toast ───────── */
type ToastMsg = { id: number; text: string; tone?: "ok" | "error" };
let pushToast: ((t: Omit<ToastMsg, "id">) => void) | null = null;
export function toast(text: string, tone: "ok" | "error" = "ok") {
  pushToast?.({ text, tone });
}
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    pushToast = (t) => {
      const id = ++idRef.current;
      setItems((xs) => [...xs, { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3 safe-top">
      {items.map((t) => (
        <div key={t.id} role="status"
          className={cn("animate-in pointer-events-auto rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg",
            t.tone === "error" && "text-danger")}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ───────── Stat tile ───────── */
export function Stat({
  icon, tint, label, value, sub, href,
}: { icon: LucideIcon; tint: Tint; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const inner = (
    <>
      <SoftIcon icon={icon} tint={tint} size="sm" />
      <p className="mt-3 text-[22px] font-semibold tabular leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-xs text-muted">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card group block p-4">{inner}</Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}

/* ───────── Row link (list item that deepens on hover) ───────── */
export function RowLink({
  href, icon, tint = "blue", title, sub, right,
}: { href: string; icon: LucideIcon; tint?: Tint; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors nav-hover">
      <SoftIcon icon={icon} tint={tint} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {right}
    </Link>
  );
}

/* ───────── Switch ───────── */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[var(--success)]" : "bg-[color-mix(in_srgb,var(--muted)_35%,transparent)]")}>
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
