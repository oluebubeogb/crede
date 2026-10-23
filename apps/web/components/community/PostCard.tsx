"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  Heart, MessageCircle, Repeat2, Bookmark, MoreHorizontal, Link2, ImageDown, Flag, Trash2, FileText, Briefcase, MapPin, Mail, Phone, EyeOff, Loader2, Maximize2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, OrgMark, Sheet, VerifiedBadge, toast } from "@/components/ui/kit";
import { MatchScore } from "@/components/MatchScore";
import { Comments } from "./Comments";
import { GrabCard, grabToPng } from "./Grab";
import { RichText } from "./RichText";
import type { Post } from "./types";

const REASONS: [string, string][] = [
  ["spam", "Spam or self-promotion"], ["scam", "Scam or fake job"], ["harassment", "Harassment or hate"],
  ["misinformation", "Misleading information"], ["inappropriate", "Inappropriate content"], ["other", "Something else"],
];

function Images({ images }: { images: Post["images"] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!images.length) return null;
  const one = images.length === 1;
  return (
    <>
      <div className={cn("mt-3 grid gap-1 overflow-hidden rounded-2xl", one ? "grid-cols-1" : "grid-cols-2")}>
        {images.slice(0, 4).map((img, i) => (
          <button key={img.key} type="button" onClick={() => setOpen(img.url)} aria-label="Open image"
            className={cn("relative block overflow-hidden bg-surface-2", !one && "aspect-square", images.length === 3 && i === 0 && "row-span-2 aspect-auto")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" loading="lazy" decoding="async" width={img.w} height={img.h}
              className={cn("h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]", one && "max-h-[520px]")} />
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 animate-in" onClick={() => setOpen(null)} role="dialog" aria-label="Image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}

function DocumentCard({ post }: { post: Post }) {
  const d = post.document!;
  const [view, setView] = useState(false);
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      <div className="flex gap-4 p-4" style={{ background: `color-mix(in srgb, ${d.color} 6%, var(--surface))` }}>
        <div className="hidden h-[104px] w-[78px] shrink-0 flex-col gap-1 rounded-md border border-border bg-white p-2 shadow-sm sm:flex" aria-hidden>
          <div className="h-1.5 w-3/4 rounded" style={{ background: d.color }} />
          <div className="h-1 w-1/2 rounded bg-gray-300" />
          {[...Array(7)].map((_, i) => <div key={i} className="h-[3px] rounded bg-gray-200" style={{ width: `${90 - ((i * 13) % 35)}%` }} />)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" style={{ color: d.color }} />{d.doc_type === "cv" ? "CV" : "Cover letter"}{d.pages ? ` · ${d.pages} page${d.pages > 1 ? "s" : ""}` : ""}</p>
          <p className="mt-1 truncate font-semibold">{d.name || d.title}</p>
          {(d.headline || d.target_job_title) && <p className="truncate text-sm text-muted">{d.headline || d.target_job_title}</p>}
          {d.roles && d.roles.length > 0 && (
            <p className="mt-1.5 line-clamp-1 text-xs text-muted">{d.roles.slice(0, 2).map((r) => [r.title, r.org].filter(Boolean).join(" · ")).join("  ·  ")}</p>
          )}
          {d.skills && d.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{d.skills.slice(0, 5).map((s) => <span key={s} className="pill pill-gray">{s}</span>)}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {d.contact_hidden ? (
              <span className="flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> Contact hidden</span>
            ) : (
              <>
                {d.contact?.email && <a href={`mailto:${d.contact.email}`} className="link-muted flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{d.contact.email}</a>}
                {d.contact?.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{d.contact.phone}</span>}
              </>
            )}
            <button type="button" onClick={() => setView(true)} className="link ml-auto flex items-center gap-1 text-xs"><Maximize2 className="h-3.5 w-3.5" />View</button>
          </div>
        </div>
      </div>
      <Sheet open={view} onClose={() => setView(false)} title={d.title} wide>
        <iframe src={`/backend/api/community/posts/${post.id}/document`} title={d.title} className="h-[70vh] w-full rounded-xl border border-border bg-white" sandbox="" />
      </Sheet>
    </div>
  );
}

function JobCard({ post }: { post: Post }) {
  const j = post.job!;
  const salary = j.salary_min ? `${j.salary_currency || "NGN"} ${Math.round(j.salary_min / 1000)}k${j.salary_max ? `–${Math.round(j.salary_max / 1000)}k` : "+"}` : null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border p-4">
      <OrgMark name={j.organization?.name} src={j.organization?.logo_url} size={44} />
      <div className="min-w-0 flex-1">
        <p className="eyebrow flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />Opening{j.status !== "open" ? ` · ${j.status}` : ""}</p>
        <p className="truncate font-semibold">{j.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {j.organization?.name}{j.organization?.verified && <VerifiedBadge level="green" size={13} />}
          {j.location && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{j.location}</span>}
          {salary && <span>{salary}</span>}
        </p>
      </div>
      {j.match && <MatchScore match={j.match} size={48} align="right" />}
    </div>
  );
}

export function PostCard({ post: initial, onRemoved, expanded = false, embedded = false }: { post: Post; onRemoved?: (id: number) => void; expanded?: boolean; embedded?: boolean }) {
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(expanded);
  const [menu, setMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [quote, setQuote] = useState("");
  const [pop, setPop] = useState(false);
  const grabRef = useRef<HTMLDivElement>(null);
  const a = post.author;

  async function like() {
    const was = post.liked;
    setPost((p) => ({ ...p, liked: !was, counts: { ...p.counts, likes: p.counts.likes + (was ? -1 : 1) } }));
    if (!was) { setPop(true); setTimeout(() => setPop(false), 400); }
    const r = await api.post<{ liked: boolean; likes: number }>(`/community/posts/${post.id}/like`).catch(() => null);
    if (r) setPost((p) => ({ ...p, liked: r.liked, counts: { ...p.counts, likes: r.likes } }));
  }
  async function save() {
    const was = post.saved;
    setPost((p) => ({ ...p, saved: !was }));
    const r = await api.post<{ saved: boolean }>(`/community/posts/${post.id}/save`).catch(() => null);
    if (r) { setPost((p) => ({ ...p, saved: r.saved })); toast(r.saved ? "Saved" : "Removed from saved"); }
  }
  async function share(repost: boolean) {
    const r = await api.post<{ shares: number }>(`/community/posts/${post.id}/share`, { repost, body: repost ? quote : "" }).catch((e) => { toast(e.message, "error"); return null; });
    if (r) setPost((p) => ({ ...p, counts: { ...p.counts, shares: r.shares } }));
    return r;
  }
  async function copyLink() {
    setMenu(false); setShareOpen(false);
    const url = post.url || `${location.origin}/post/${post.id}`;
    try {
      if (window.matchMedia("(pointer: coarse)").matches && navigator.share) await navigator.share({ url, title: `${a.name} on Crede` });
      else { await navigator.clipboard.writeText(url); toast("Link copied"); }
      share(false);
    } catch { /* cancelled */ }
  }
  async function grab() {
    setMenu(false); setShareOpen(false); setGrabbing(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const res = await grabToPng(grabRef.current!, `crede-post-${post.id}.png`);
      toast(res === "shared" ? "Shared" : "Image saved");
      share(false);
    } catch {
      toast("Couldn't create the image", "error");
    } finally {
      setGrabbing(false);
    }
  }
  async function remove() {
    setMenu(false);
    if (!confirm("Delete this post? This can't be undone.")) return;
    await api.delete(`/community/posts/${post.id}`);
    toast("Post deleted");
    onRemoved?.(post.id);
  }
  async function report(reason: string) {
    setReportOpen(false);
    await api.post("/community/report", { target_type: "post", target_id: post.id, reason }).catch(() => null);
    toast("Thanks — our moderators will take a look.");
  }

  if (embedded) {
    return (
      <Link href={`/post/${post.id}`} className="mt-3 block rounded-2xl border border-border p-3 transition-colors hover:border-border-strong">
        <div className="flex items-center gap-2 text-sm"><Avatar name={a.name} src={a.avatar_url} size={22} /><span className="font-medium">{a.name}</span><span className="text-muted">· {timeAgo(post.created_at)}</span></div>
        {post.body && <RichText text={post.body.length > 280 ? post.body.slice(0, 280) + "…" : post.body} className="mt-1.5 text-sm" />}
        {post.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.images[0].url} alt="" loading="lazy" className="mt-2 max-h-56 w-full rounded-xl object-cover" />
        )}
      </Link>
    );
  }

  const actions = [
    { key: "like", icon: Heart, label: "Like", n: post.counts.likes, on: like, active: post.liked, color: "var(--rose)" },
    { key: "comment", icon: MessageCircle, label: "Comment", n: post.counts.comments, on: () => setShowComments((v) => !v), active: showComments, color: "var(--accent)" },
    { key: "share", icon: Repeat2, label: "Share", n: post.counts.shares, on: () => setShareOpen(true), active: false, color: "var(--emerald)" },
  ];

  return (
    <article className={cn("card card-hover p-4 sm:p-5", post.hidden && "opacity-60")}>
      <header className="flex items-start gap-3">
        <Link href={a.username ? `/u/${a.username}` : "#"} className="shrink-0"><Avatar name={a.name} src={a.avatar_url} size={42} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Link href={a.username ? `/u/${a.username}` : "#"} className="truncate font-semibold hover:underline">{a.name}</Link>
            <VerifiedBadge level={a.badge_level} size={15} />
          </div>
          <p className="truncate text-[13px] text-muted">
            {a.headline ? `${a.headline} · ` : ""}<Link href={`/post/${post.id}`} className="hover:underline" title={new Date(post.created_at).toLocaleString()}>{timeAgo(post.created_at)}</Link>{post.edited ? " · edited" : ""}
          </p>
        </div>
        <div className="relative">
          <button type="button" aria-label="More options" onClick={() => setMenu((v) => !v)} className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-muted nav-hover">
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-40 w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 animate-pop" style={{ boxShadow: "var(--shadow-hover)" }}>
                <MenuItem icon={Link2} onClick={copyLink}>Copy link</MenuItem>
                <MenuItem icon={ImageDown} onClick={grab}>Grab as image</MenuItem>
                {(post.is_mine || post.can_moderate) && <MenuItem icon={Trash2} onClick={remove} danger>{post.is_mine ? "Delete post" : "Remove (moderator)"}</MenuItem>}
                {!post.is_mine && <MenuItem icon={Flag} onClick={() => { setMenu(false); setReportOpen(true); }}>Report</MenuItem>}
              </div>
            </>
          )}
        </div>
      </header>

      {post.body && <RichText text={post.body} className="mt-3 text-[15px] leading-relaxed" />}
      {post.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-2 text-[13px]">
          {post.topics.filter((t) => !post.body.toLowerCase().includes(`#${t}`)).map((t) => <Link key={t} href={`/feed?topic=${t}`} className="link-muted">#{t}</Link>)}
        </div>
      )}
      <Images images={post.images} />
      {post.document && <DocumentCard post={post} />}
      {post.job && <JobCard post={post} />}
      {post.repost_of && <PostCard post={post.repost_of} embedded />}

      <footer className="-mx-2 mt-3 flex items-center">
        {actions.map((x) => (
          <button key={x.key} type="button" onClick={x.on} aria-label={x.label} aria-pressed={x.active}
            className="group flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted transition-colors hover:text-foreground"
            style={x.active && x.key === "like" ? { color: x.color } : undefined}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover:bg-[color-mix(in_srgb,var(--tint)_12%,transparent)]" style={{ ["--tint" as string]: x.color }}>
              <x.icon className={cn("h-[18px] w-[18px] transition-transform", x.key === "like" && pop && "animate-pop")} fill={x.active && x.key === "like" ? "currentColor" : "none"} />
            </span>
            <span className="tabular -ml-1 min-w-[1ch]">{x.n > 0 ? x.n : ""}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" onClick={save} aria-label={post.saved ? "Unsave" : "Save"} aria-pressed={post.saved}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors nav-hover" style={post.saved ? { color: "var(--amber)" } : undefined}>
          <Bookmark className="h-[18px] w-[18px]" fill={post.saved ? "currentColor" : "none"} />
        </button>
      </footer>

      {showComments && (
        <div className="mt-3 border-t border-border pt-4 animate-in">
          <Comments postId={post.id} autoFocus={!expanded} onCount={(n) => setPost((p) => ({ ...p, counts: { ...p.counts, comments: n } }))} />
        </div>
      )}

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share">
        <div className="space-y-3">
          <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} maxLength={2000} placeholder="Add a thought (optional)" className="input resize-none" />
          <button type="button" className="btn btn-primary w-full" onClick={async () => { const r = await share(true); if (r) { setShareOpen(false); setQuote(""); toast("Reposted"); } }}>
            <Repeat2 className="h-4 w-4" /> Repost to Community
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-soft" onClick={copyLink}><Link2 className="h-4 w-4" /> Copy link</button>
            <button type="button" className="btn btn-soft" onClick={grab} disabled={grabbing}>{grabbing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />} Grab image</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report post">
        <p className="mb-2 text-sm text-muted">Reports are anonymous. What&apos;s wrong with this post?</p>
        <div className="space-y-1">
          {REASONS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => report(k)} className="flex w-full items-center rounded-xl px-3 py-3 text-left text-sm nav-hover">{label}</button>
          ))}
        </div>
      </Sheet>

      {grabbing && (
        <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
          <GrabCard ref={grabRef} post={post} dark={document.documentElement.classList.contains("dark")} />
        </div>
      )}
    </article>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: typeof Link2; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm nav-hover", danger && "text-danger")}>
      <Icon className="h-4 w-4 opacity-80" />{children}
    </button>
  );
}
