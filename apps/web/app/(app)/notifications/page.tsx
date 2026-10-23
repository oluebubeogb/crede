"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { EmptyState, ErrorNote, PageHeader, SkeletonList, Tabs } from "@/components/ui/kit";
import { NotifRow, type Notif } from "@/components/NotificationBell";

export default function NotificationsPage() {
  const { setUnread } = useMe();
  const [items, setItems] = useState<Notif[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const load = () => api.get<{ items: Notif[]; unread: number }>("/notifications?limit=100")
    .then((r) => { setItems(r.items); setUnread(r.unread); }).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function markAll() {
    await api.post("/notifications/read", { ids: null });
    setItems((xs) => xs?.map((n) => ({ ...n, read: true })) || null);
    setUnread(0);
  }
  async function open(n: Notif) {
    if (n.read) return;
    api.post("/notifications/read", { ids: [n.id] }).catch(() => {});
    setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) || null);
    setUnread((u: number) => Math.max(0, u - 1));
  }

  const shown = items?.filter((n) => tab === "all" || !n.read);
  const unreadN = items?.filter((n) => !n.read).length || 0;

  return (
    <div className="mx-auto max-w-feed">
      <PageHeader title="Notifications" action={
        <div className="flex items-center gap-1">
          {unreadN > 0 && <button type="button" onClick={markAll} className="btn btn-soft btn-sm"><CheckCheck className="h-4 w-4" />Mark all read</button>}
          <Link href="/settings#notifications" aria-label="Notification settings" className="flex h-9 w-9 items-center justify-center rounded-full text-muted nav-hover"><Settings2 className="h-[18px] w-[18px]" /></Link>
        </div>
      } />
      <Tabs className="mb-3" value={tab} onChange={setTab} items={[{ value: "all", label: "All" }, { value: "unread", label: "Unread", count: unreadN }]} />
      {error && <ErrorNote message={error} onRetry={load} />}
      {!items && !error && <SkeletonList n={5} avatar lines={1} />}
      {shown?.length === 0 && <EmptyState icon={Bell} tint="sky" title={tab === "unread" ? "You're all caught up" : "No notifications yet"} body="Likes, comments, verification updates and badge decisions show up here." />}
      {shown && shown.length > 0 && (
        <div className="card stagger divide-y divide-border overflow-hidden p-1">
          {shown.map((n) => <NotifRow key={n.id} n={n} onOpen={() => open(n)} />)}
        </div>
      )}
    </div>
  );
}
