"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, FileText, X, Loader2, Hash, EyeOff, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";
import { Avatar, Sheet, toast } from "@/components/ui/kit";
import type { Author, Post, PostImage } from "./types";

const SUGGESTED = ["career-advice", "job-hunt", "cv-review", "interviews", "wins", "tech", "internships", "nysc", "remote-work"];

/** Downscale on-device before upload: saves data on mobile networks. Server re-compresses to WebP anyway. */
async function shrink(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b || file), "image/jpeg", 0.86));
  } catch {
    return file;
  }
}

type Shareable = { id: number; title: string; doc_type: string; created_at: string };

export function Composer({ onPosted, autoFocus }: { onPosted: (p: Post) => void; autoFocus?: boolean }) {
  const { me, config } = useMe();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<(PostImage & { uploading?: boolean; preview?: string })[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [doc, setDoc] = useState<Shareable | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [picker, setPicker] = useState(false);
  const [shareables, setShareables] = useState<Shareable[] | null>(null);
  const [focused, setFocused] = useState(!!autoFocus);
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ q: string; people: Author[] } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(320, el.scrollHeight) + "px";
  }, [body]);

  useEffect(() => {
    if (autoFocus) ta.current?.focus();
  }, [autoFocus]);

  // @mention typeahead on the word under the caret
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    const upto = body.slice(0, el.selectionStart ?? body.length);
    const m = upto.match(/@([a-z0-9_.]{1,30})$/i);
    if (!m) {
      setMention(null);
      return;
    }
    const q = m[1]!;
    const t = setTimeout(() => {
      api.get<Author[]>(`/community/people?q=${encodeURIComponent(q)}&limit=5`).then((people) => setMention({ q, people })).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [body]);

  function pickMention(a: Author) {
    if (!mention || !a.username) return;
    const el = ta.current!;
    const pos = el.selectionStart ?? body.length;
    const before = body.slice(0, pos).replace(/@([a-z0-9_.]{1,30})$/i, `@${a.username} `);
    setBody(before + body.slice(pos));
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = 4 - images.length;
    const list = Array.from(files).slice(0, room);
    const maxMb = config?.max_image_mb ?? 8;
    for (const f of list) {
      if (f.size > maxMb * 4 * 1024 * 1024) {
        toast(`${f.name} is too large`, "error");
        continue;
      }
      const tmpKey = `tmp-${Math.random()}`;
      const preview = URL.createObjectURL(f);
      setImages((xs) => [...xs, { key: tmpKey, url: preview, preview, uploading: true }]);
      try {
        const blob = await shrink(f);
        const fd = new FormData();
        fd.append("file", blob, f.name.replace(/\.\w+$/, "") + ".jpg");
        const ref = await api.postForm<PostImage>("/community/images", fd);
        setImages((xs) => xs.map((x) => (x.key === tmpKey ? { ...ref, preview } : x)));
      } catch (e) {
        setImages((xs) => xs.filter((x) => x.key !== tmpKey));
        toast(e instanceof Error ? e.message : "Upload failed", "error");
      }
    }
  }

  async function openPicker() {
    setPicker(true);
    if (!shareables) setShareables(await api.get<Shareable[]>("/community/shareables").catch(() => []));
  }

  async function submit() {
    if (busy || images.some((i) => i.uploading)) return;
    if (!body.trim() && !images.length && !doc) return;
    setBusy(true);
    try {
      const p = await api.post<Post>("/community/posts", {
        body, topics, images: images.map(({ key, w, h }) => ({ key, w, h })),
        document_id: doc?.id ?? null, show_contact: showContact,
      });
      onPosted(p);
      setBody(""); setImages([]); setTopics([]); setDoc(null); setShowContact(false); setFocused(false);
      toast("Posted");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't post", "error");
    } finally {
      setBusy(false);
    }
  }

  const expanded = focused || body || images.length || doc;
  const ready = (body.trim() || images.length || doc) && !images.some((i) => i.uploading);

  return (
    <div className="card p-4">
      <div className="flex gap-3">
        <Avatar name={me?.full_name || me?.email} src={me?.avatar_url} size={40} />
        <div className="relative min-w-0 flex-1">
          <textarea ref={ta} value={body} onChange={(e) => setBody(e.target.value)} onFocus={() => setFocused(true)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
            rows={expanded ? 3 : 1} maxLength={5000} aria-label="Write a post"
            placeholder="Share a win, ask for advice, or post an opening…"
            className="w-full resize-none bg-transparent py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted" />
          {mention && mention.people.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface p-1" style={{ boxShadow: "var(--shadow-hover)" }}>
              {mention.people.filter((p) => p.username).map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left nav-hover">
                  <Avatar name={p.name} src={p.avatar_url} size={26} />
                  <span className="min-w-0"><span className="block truncate text-sm">{p.name}</span><span className="block text-xs text-muted">@{p.username}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <div className={cn("mt-3 grid gap-2", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((img) => (
            <div key={img.key} className="relative overflow-hidden rounded-xl bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview || img.url} alt="" className={cn("w-full object-cover", images.length === 1 ? "max-h-80" : "aspect-square", img.uploading && "opacity-50")} />
              {img.uploading && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-foreground" />}
              <button type="button" aria-label="Remove image" onClick={() => setImages((xs) => xs.filter((x) => x.key !== img.key))}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {doc && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
          <FileText className="h-5 w-5 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.title}</p>
            <button type="button" onClick={() => setShowContact((v) => !v)} className="mt-0.5 flex items-center gap-1 text-xs text-muted hover:text-foreground">
              {showContact ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showContact ? "Contact details visible" : "Contact details hidden"}
            </button>
          </div>
          <button type="button" aria-label="Remove document" onClick={() => setDoc(null)} className="flex h-7 w-7 items-center justify-center rounded-full text-muted nav-hover"><X className="h-4 w-4" /></button>
        </div>
      )}

      {expanded && (
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
          <Hash className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted" />
          {SUGGESTED.map((t) => (
            <button key={t} type="button" onClick={() => setTopics((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : xs.length < 5 ? [...xs, t] : xs))}
              className={cn("chip shrink-0", topics.includes(t) && "chip-active")}>{t}</button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={images.length >= 4}
          className="group flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted nav-hover disabled:opacity-40">
          <ImagePlus className="h-[18px] w-[18px] text-emerald" style={{ color: "var(--emerald)" }} /> <span className="hidden sm:inline">Photo</span>
        </button>
        <button type="button" onClick={openPicker} className="group flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted nav-hover">
          <FileText className="h-[18px] w-[18px]" style={{ color: "var(--accent)" }} /> <span className="hidden sm:inline">CV / letter</span>
        </button>
        <div className="flex-1" />
        {body.length > 4500 && <span className="mr-2 text-xs tabular text-muted">{5000 - body.length}</span>}
        <button type="button" onClick={submit} disabled={!ready || busy} className="btn btn-primary btn-sm px-4">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Post
        </button>
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Share a document">
        <p className="mb-3 text-sm text-muted">Your email and phone stay hidden unless you choose to show them.</p>
        {!shareables && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {shareables?.length === 0 && <p className="py-6 text-center text-sm text-muted">Generate a CV or cover letter first.</p>}
        <div className="space-y-1">
          {shareables?.map((d) => (
            <button key={d.id} type="button" onClick={() => { setDoc(d); setPicker(false); setFocused(true); }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left nav-hover">
              <span className={cn("soft-icon h-9 w-9", d.doc_type === "cv" ? "tint-blue" : "tint-violet")}><FileText className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{d.title}</span>
                <span className="block text-xs text-muted">{d.doc_type === "cv" ? "CV" : "Cover letter"}</span></span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
