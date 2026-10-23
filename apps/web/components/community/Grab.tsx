"use client";

import { forwardRef } from "react";
import { BadgeCheck } from "lucide-react";
import { initials } from "@/lib/utils";
import type { Post } from "./types";

/** Off-screen card rendered to PNG via html-to-image. Uses inline styles so the export
 *  looks identical regardless of theme or the page's CSS. */
export const GrabCard = forwardRef<HTMLDivElement, { post: Post; dark?: boolean }>(function GrabCard({ post, dark }, ref) {
  const fg = dark ? "#f3f3f5" : "#111114";
  const muted = dark ? "#9b9ba6" : "#6b6b76";
  const bg = dark ? "#131316" : "#ffffff";
  const border = dark ? "#25252b" : "#e6e6ea";
  const a = post.author;
  const when = new Date(post.created_at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const body = post.body.length > 700 ? post.body.slice(0, 700) + "…" : post.body;
  const img = post.images[0];
  return (
    <div ref={ref} style={{ width: 560, padding: 28, background: dark ? "#0b0b0d" : "#f3f3f6", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 22, padding: 24, color: fg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {a.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.avatar_url} alt="" width={48} height={48} style={{ borderRadius: 999, objectFit: "cover" }} crossOrigin="anonymous" />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 999, background: "rgba(62,99,221,.12)", color: "#3e63dd", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 17 }}>
              {initials(a.name)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, fontSize: 16 }}>
              {a.name}
              {a.badge_level && a.badge_level !== "none" && (
                <BadgeCheck width={17} height={17} color={a.badge_level === "green" ? "#12a150" : muted} strokeWidth={2.3} />
              )}
            </div>
            <div style={{ fontSize: 13, color: muted }}>{a.headline ? `${a.headline} · ` : ""}{when}</div>
          </div>
        </div>
        {body && <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body}</p>}
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt="" style={{ marginTop: 16, width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 14 }} crossOrigin="anonymous" />
        )}
        {post.document && (
          <div style={{ marginTop: 16, border: `1px solid ${border}`, borderRadius: 14, padding: 16, borderLeft: `4px solid ${post.document.color}` }}>
            <div style={{ fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: ".06em" }}>{post.document.doc_type === "cv" ? "CV" : "Cover letter"}</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{post.document.name || post.document.title}</div>
            {post.document.headline && <div style={{ fontSize: 13, color: muted }}>{post.document.headline}</div>}
          </div>
        )}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: muted }}>
          <span>{post.counts.likes} likes · {post.counts.comments} comments</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: fg }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo-64.png" alt="" width={18} height={18} />
            Crede
          </span>
        </div>
      </div>
    </div>
  );
});

export async function grabToPng(node: HTMLElement, filename: string): Promise<"shared" | "downloaded"> {
  const { toPng, toBlob } = await import("html-to-image");
  const opts = { pixelRatio: 2, cacheBust: false, skipFonts: false };
  const blob = await toBlob(node, opts);
  if (blob && typeof navigator !== "undefined" && "canShare" in navigator && window.matchMedia("(pointer: coarse)").matches) {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Shared from Crede" });
        return "shared";
      } catch {
        /* user cancelled — fall back to download */
      }
    }
  }
  const url = blob ? URL.createObjectURL(blob) : await toPng(node, opts);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  if (blob) setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
