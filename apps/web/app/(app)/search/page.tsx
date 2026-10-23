"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, Users, Building2, MessagesSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { Avatar, EmptyState, OrgMark, SkeletonList, Tabs, VerifiedBadge } from "@/components/ui/kit";
import { PostCard } from "@/components/community/PostCard";
import type { Author, Post } from "@/components/community/types";

type Org = { id: number; name: string; org_type: string; location?: string; can_verify: boolean; member_count?: number; logo_url?: string };
type Kind = "all" | "people" | "orgs" | "posts";

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get("q") || "");
  const [kind, setKind] = useState<Kind>("all");
  const dq = useDebounced(q.trim(), 300);
  const [res, setRes] = useState<{ people: Author[]; orgs: Org[]; posts: Post[] } | null>(null);

  useEffect(() => {
    router.replace(dq ? `/search?q=${encodeURIComponent(dq)}` : "/search", { scroll: false });
    if (!dq) { setRes(null); return; }
    let alive = true;
    setRes(null);
    Promise.all([
      api.get<Author[]>(`/community/people?q=${encodeURIComponent(dq)}&limit=10`).catch(() => []),
      api.get<Org[]>(`/organizations?q=${encodeURIComponent(dq)}`).catch(() => []),
      api.get<{ items: Post[] }>(`/community/feed?q=${encodeURIComponent(dq)}&limit=10`).then((r) => r.items).catch(() => []),
    ]).then(([people, orgs, posts]) => alive && setRes({ people, orgs: (orgs as Org[]).slice(0, 10), posts }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const show = (k: Kind) => kind === "all" || kind === k;
  const empty = res && !res.people.length && !res.orgs.length && !res.posts.length;

  return (
    <div className="mx-auto max-w-feed">
      <label className="flex h-12 items-center gap-2.5 rounded-full border border-border bg-surface px-4 focus-within:border-border-strong" style={{ boxShadow: "var(--shadow)" }}>
        <SearchIcon className="h-[18px] w-[18px] text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="People, organisations, posts" className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
      </label>
      {dq && (
        <Tabs className="mt-4" value={kind} onChange={setKind} items={[
          { value: "all", label: "All" }, { value: "people", label: "People", count: res?.people.length },
          { value: "orgs", label: "Organisations", count: res?.orgs.length }, { value: "posts", label: "Posts", count: res?.posts.length },
        ]} />
      )}
      <div className="mt-4 space-y-6">
        {!dq && <EmptyState icon={SearchIcon} tint="sky" title="Search Crede" body="Find professionals, schools, companies and certification issuers, or posts on any topic." />}
        {dq && !res && <SkeletonList n={3} avatar lines={1} />}
        {empty && <EmptyState icon={SearchIcon} tint="gray" title={`No results for “${dq}”`} body="Try a shorter word or a different spelling." />}
        {res && show("people") && res.people.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />People</h2>
            <div className="card divide-y divide-border p-1">
              {res.people.map((p) => (
                <Link key={p.id} href={p.username ? `/u/${p.username}` : "#"} className="flex items-center gap-3 rounded-xl px-3 py-2.5 nav-hover">
                  <Avatar name={p.name} src={p.avatar_url} size={40} />
                  <span className="min-w-0"><span className="flex items-center gap-1 text-sm font-medium">{p.name}<VerifiedBadge level={p.badge_level} size={14} /></span>
                    <span className="block truncate text-xs text-muted">{p.headline || (p.username && `@${p.username}`)}</span></span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {res && show("orgs") && res.orgs.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Organisations</h2>
            <div className="card divide-y divide-border p-1">
              {res.orgs.map((o) => (
                <Link key={o.id} href={`/orgs/${o.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 nav-hover">
                  <OrgMark name={o.name} src={o.logo_url} size={40} />
                  <span className="min-w-0"><span className="flex items-center gap-1 text-sm font-medium">{o.name}{o.can_verify && <VerifiedBadge level="green" size={14} />}</span>
                    <span className="block truncate text-xs capitalize text-muted">{o.org_type}{o.location ? ` · ${o.location}` : ""}</span></span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {res && show("posts") && res.posts.length > 0 && (
          <section>
            <h2 className="eyebrow mb-2 flex items-center gap-1.5"><MessagesSquare className="h-3.5 w-3.5" />Posts</h2>
            <div className="space-y-3">{res.posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return <Suspense><Inner /></Suspense>;
}
