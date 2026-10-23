"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, Skeleton } from "@/components/ui/kit";

export type Notif = {
  id: number; kind: string; title: string; body?: string | null; link?: string | null; read: boolean; created_at: string;
  actor?: { id: number; name: string; avatar_url?: string | null } | null;
};

export function NotifRow({ n, onOpen }: { n: Notif; onOpen?: () => void }) {
  const inner = (
    <>
      <Avatar name={n.actor?.name || "Crede"} src={n.actor ? n.actor.avatar_url : "/icons/icon-192.png"} size={36} />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", !n.read && "font-medium")}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
        <span className="mt-1 block text-[11px] text-muted">{timeAgo(n.created_at)}</span>
      </span>
      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
    </>
  );
  const cls = "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors nav-hover";
  return n.link ? <Link href={n.link} onClick={onOpen} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function NotificationBell() {
  const { unread, setUnread } = useMe();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.get<{ items: Notif[]; unread: number }>("/notifications?limit=8").then((r) => setItems(r.items)).catch(() => setItems([]));
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function markAll() {
    await api.post("/notifications/read", { ids: null }).catch(() => {});
    setUnread(0);
    setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? xs);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted nav-hover">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="animate-pop absolute right-1 top-1 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-in absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-border bg-surface" style={{ boxShadow: "var(--shadow-hover)" }}>
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && <button type="button" onClick={markAll} className="link text-xs">Mark all read</button>}
          </div>
          <div className="max-h-[420px] overflow-y-auto p-1.5">
            {!items && <div className="space-y-3 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
            {items && items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>}
            {items?.map((n) => <NotifRow key={n.id} n={n} onOpen={() => setOpen(false)} />)}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-sm text-muted nav-hover">
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
