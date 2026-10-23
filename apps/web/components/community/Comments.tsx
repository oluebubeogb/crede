"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Loader2, Trash2, Flag } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, Skeleton, VerifiedBadge, toast } from "@/components/ui/kit";
import { RichText } from "./RichText";
import type { CommentT } from "./types";

function CommentBox({ onSubmit, placeholder, autoFocus, initial = "" }: { onSubmit: (t: string) => Promise<void>; placeholder: string; autoFocus?: boolean; initial?: string }) {
  const { me } = useMe();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={me?.full_name || me?.email} src={me?.avatar_url} size={30} />
      <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-border bg-surface-2 px-3 py-1.5 focus-within:border-border-strong">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} autoFocus={autoFocus} maxLength={2000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }}
          placeholder={placeholder} aria-label={placeholder}
          className="max-h-32 min-h-[28px] w-full resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted" />
        <button type="button" onClick={go} disabled={!text.trim() || busy} className="link shrink-0 py-1 text-sm disabled:opacity-40 disabled:no-underline">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </button>
      </div>
    </div>
  );
}

function CommentItem({ c, postId, onChange, depth = 0 }: { c: CommentT; postId: number; onChange: () => void; depth?: number }) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likes);
  const [replying, setReplying] = useState(false);

  async function like() {
    setLiked((v) => !v);
    setLikes((n) => n + (liked ? -1 : 1));
    const r = await api.post<{ liked: boolean; likes: number }>(`/community/comments/${c.id}/like`).catch(() => null);
    if (r) { setLiked(r.liked); setLikes(r.likes); }
  }
  async function remove() {
    if (!confirm("Delete this comment?")) return;
    await api.delete(`/community/comments/${c.id}`);
    onChange();
  }
  async function report() {
    const r = await api.post<{ message?: string }>("/community/report", { target_type: "comment", target_id: c.id, reason: "other" }).catch(() => null);
    toast(r?.message || "Reported. Thanks for keeping Crede kind.");
  }

  return (
    <div id={`c${c.id}`} className="scroll-mt-24">
      <div className="flex gap-2.5">
        <Link href={c.author?.username ? `/u/${c.author.username}` : "#"} className="shrink-0"><Avatar name={c.author?.name} src={c.author?.avatar_url} size={depth ? 26 : 30} /></Link>
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-surface-2 px-3 py-2">
            <p className="flex items-center gap-1 text-[13px] font-semibold">
              {c.author?.name}<VerifiedBadge level={c.author?.badge_level} size={13} />
            </p>
            {c.hidden ? <p className="text-sm italic text-muted">{c.body}</p> : <RichText text={c.body} className="text-sm" />}
          </div>
          <div className="mt-1 flex items-center gap-3 px-2 text-xs text-muted">
            <span>{timeAgo(c.created_at)}</span>
            <button type="button" onClick={like} className={cn("flex items-center gap-1 hover:text-foreground", liked && "text-rose-500")} style={liked ? { color: "var(--rose)" } : undefined}>
              <Heart className="h-3.5 w-3.5" fill={liked ? "currentColor" : "none"} />{likes > 0 && likes}
            </button>
            <button type="button" onClick={() => setReplying((v) => !v)} className="hover:text-foreground">Reply</button>
            {c.can_delete ? (
              <button type="button" onClick={remove} aria-label="Delete comment" className="hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            ) : (
              <button type="button" onClick={report} aria-label="Report comment" className="hover:text-foreground"><Flag className="h-3.5 w-3.5" /></button>
            )}
          </div>
          {replying && (
            <div className="mt-2">
              <CommentBox autoFocus placeholder={`Reply to ${c.author?.name?.split(" ")[0] || "comment"}…`}
                initial={c.author?.username && depth > 0 ? `@${c.author.username} ` : ""}
                onSubmit={async (t) => {
                  await api.post(`/community/posts/${postId}/comments`, { body: t, parent_id: c.id });
                  setReplying(false);
                  onChange();
                }} />
            </div>
          )}
          {c.replies.length > 0 && (
            <div className="mt-2 space-y-2.5">
              {c.replies.map((r) => <CommentItem key={r.id} c={r} postId={postId} onChange={onChange} depth={depth + 1} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Comments({ postId, onCount, autoFocus }: { postId: number; onCount?: (n: number) => void; autoFocus?: boolean }) {
  const [items, setItems] = useState<CommentT[] | null>(null);
  const load = () => api.get<CommentT[]>(`/community/posts/${postId}/comments`).then((xs) => {
    setItems(xs);
    const count = (a: CommentT[]): number => a.reduce((n, c) => n + 1 + count(c.replies), 0);
    onCount?.(count(xs));
  }).catch(() => setItems([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [postId]);

  return (
    <div className="space-y-3">
      <CommentBox autoFocus={autoFocus} placeholder="Add a comment…" onSubmit={async (t) => {
        await api.post(`/community/posts/${postId}/comments`, { body: t });
        await load();
      }} />
      {!items && <div className="space-y-2 pl-10"><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" /></div>}
      <div className="stagger space-y-3">
        {items?.map((c) => <CommentItem key={c.id} c={c} postId={postId} onChange={load} />)}
      </div>
    </div>
  );
}
