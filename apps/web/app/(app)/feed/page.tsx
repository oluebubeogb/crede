"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare, Search, X, TrendingUp, ShieldCheck, FileText, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";
import { EmptyState, ErrorNote, SkeletonList, SoftIcon, Tabs } from "@/components/ui/kit";
import { Composer } from "@/components/community/Composer";
import { PostCard } from "@/components/community/PostCard";
import type { Post } from "@/components/community/types";

type Tab = "latest" | "top" | "saved" | "mine";
type Topic = { name: string; count: number };

function FeedInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useMe();
  const tab = (sp.get("tab") as Tab) || "latest";
  const topic = sp.get("topic") || "";
  const [q, setQ] = useState(sp.get("q") || "");
  const dq = useDebounced(q.trim(), 350);
  const [items, setItems] = useState<Post[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    p.delete("compose");
    router.replace(`/feed${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };

  const query = useCallback((before?: number | null) => {
    const p = new URLSearchParams({ tab, limit: "15" });
    if (topic) p.set("topic", topic);
    if (dq) p.set("q", dq);
    if (before) p.set("before_id", String(before));
    return api.get<{ items: Post[]; next_before_id: number | null }>(`/community/feed?${p}`);
  }, [tab, topic, dq]);

  useEffect(() => {
    let alive = true;
    setItems(null); setError(null);
    query().then((r) => { if (alive) { setItems(r.items); setNext(r.next_before_id); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [query]);

  useEffect(() => { api.get<Topic[]>("/community/topics").then(setTopics).catch(() => {}); }, []);

  const loadMore = useCallback(async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await query(next);
      setItems((xs) => [...(xs || []), ...r.items.filter((p) => !xs?.some((x) => x.id === p.id))]);
      setNext(r.next_before_id);
    } finally {
      setLoadingMore(false);
    }
  }, [next, loadingMore, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const firstName = (me?.full_name || "").split(" ")[0];

  return (
    <div className="mx-auto flex max-w-[1000px] gap-8">
      <div className="min-w-0 max-w-feed flex-1">
        <div className="mb-4 hidden md:block">
          <h1 className="page-title">{firstName ? `Hi ${firstName}` : "Community"}</h1>
          <p className="page-lead">Ask, share and celebrate with professionals across Nigeria.</p>
        </div>

        <Composer autoFocus={sp.get("compose") === "1"} onPosted={(p) => setItems((xs) => [p, ...(xs || [])])} />

        <div className="sticky top-[var(--topbar-h,56px)] z-10 -mx-4 mt-4 bg-background/85 px-4 pb-2 pt-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-0">
          <div className="flex items-center gap-3">
            <Tabs value={tab} onChange={(v) => setParam("tab", v === "latest" ? null : v)} items={[
              { value: "latest", label: "Latest" }, { value: "top", label: "Top" }, { value: "saved", label: "Saved" }, { value: "mine", label: "Mine" },
            ]} />
          </div>
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto lg:hidden">
            {topic && <button type="button" onClick={() => setParam("topic", null)} className="chip chip-active shrink-0">#{topic}<X className="h-3 w-3" /></button>}
            {topics.filter((t) => t.name !== topic).slice(0, 12).map((t) => (
              <button key={t.name} type="button" onClick={() => setParam("topic", t.name)} className="chip shrink-0">#{t.name}</button>
            ))}
          </div>
        </div>

        {(topic || dq) && (
          <p className="mt-2 text-sm text-muted">
            Showing {topic && <>posts in <span className="font-medium text-foreground">#{topic}</span></>}{topic && dq && " matching "}{dq && <>“<span className="text-foreground">{dq}</span>”</>}
            {" · "}<button type="button" className="link" onClick={() => { setQ(""); setParam("topic", null); }}>Clear</button>
          </p>
        )}

        <div className="mt-3 space-y-3">
          {error && <ErrorNote message={error} onRetry={() => setParam("tab", tab)} />}
          {!items && !error && <SkeletonList n={3} avatar lines={3} />}
          {items?.length === 0 && (
            <EmptyState icon={tab === "saved" ? FileText : MessagesSquare} tint={tab === "saved" ? "amber" : "blue"}
              title={tab === "saved" ? "Nothing saved yet" : tab === "mine" ? "You haven't posted yet" : "No posts here yet"}
              body={tab === "saved" ? "Tap the bookmark on any post to keep it for later." : "Start the conversation — share a win or ask a question."} />
          )}
          <div className="stagger space-y-3">
            {items?.map((p) => <PostCard key={p.id} post={p} onRemoved={(id) => setItems((xs) => xs?.filter((x) => x.id !== id) || null)} />)}
          </div>
          <div ref={sentinel} />
          {loadingMore && <SkeletonList n={1} avatar lines={2} />}
          {items && items.length > 0 && !next && <p className="py-6 text-center text-xs text-muted">You&apos;re all caught up</p>}
        </div>
      </div>

      <aside className="sticky top-24 hidden h-fit w-[300px] shrink-0 space-y-4 lg:block">
        <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3.5 focus-within:border-border-strong">
          <Search className="h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>

        <section className="card p-4">
          <h2 className="section-title flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted" />Topics</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topics.slice(0, 14).map((t) => (
              <button key={t.name} type="button" onClick={() => setParam("topic", topic === t.name ? null : t.name)} className={cn("chip", topic === t.name && "chip-active")}>
                #{t.name}{t.count > 0 && <span className="tabular text-[11px] opacity-60">{t.count}</span>}
              </button>
            ))}
          </div>
        </section>

        {me && (me.badge_level || "none") === "none" && (
          <Link href="/verification" className="card card-hover flex gap-3 p-4">
            <SoftIcon icon={ShieldCheck} tint="emerald" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Get verified</span>
              <span className="block text-[13px] text-muted">{me.claims?.label || "Verify your claims"} — verified profiles get more replies.</span>
            </span>
          </Link>
        )}
        <Link href="/generate" className="card card-hover flex gap-3 p-4">
          <SoftIcon icon={Sparkles} tint="violet" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Tailor a CV in minutes</span>
            <span className="block text-[13px] text-muted">Paste a job description and get a matched CV and cover letter.</span>
          </span>
        </Link>
        <p className="px-1 text-xs text-muted">Be kind. Posts that break the rules can be reported from the ··· menu.</p>
      </aside>
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<SkeletonList n={3} avatar />}>
      <FeedInner />
    </Suspense>
  );
}
