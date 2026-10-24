/* Open Graph card for posts without their own image: a 1200×630 render of the post card
 * (author, text, hashtags, CV/job attachment, counts) with the Crede mark in a footer strip.
 * Public data only (contact details never included); cached by browsers/CDNs/crawlers. */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPublicPost, snippet } from "@/lib/server-api";

// Node runtime: fonts/logo are read from ./assets (copied into the standalone image by the Dockerfile).
export const runtime = "nodejs";

const C = { bg: "#f7f7f8", surface: "#ffffff", border: "#e6e6ea", fg: "#111114", muted: "#6b6b76", accent: "#3e63dd", green: "#12a150", pill: "#ececef" };

function initials(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("") || "C";
}
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const cache = new Map<string, Promise<Buffer>>();
function asset(rel: string) {
  if (!cache.has(rel)) cache.set(rel, readFile(path.join(process.cwd(), "assets", rel)));
  return cache.get(rel)!;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const post = await getPublicPost(params.id);
  const [r400, r500, r600, logo] = await Promise.all([
    asset("fonts/Inter-400.ttf"), asset("fonts/Inter-500.ttf"), asset("fonts/Inter-600.ttf"), asset("logo-128.png"),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const fonts = [
    { name: "Inter", data: r400, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: r500, weight: 500 as const, style: "normal" as const },
    { name: "Inter", data: r600, weight: 600 as const, style: "normal" as const },
  ];
  const headers = { "Cache-Control": post ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=300" };

  if (!post) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "Inter", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={72} height={72} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 56, fontWeight: 600, color: C.fg }}>Crede</div>
            <div style={{ fontSize: 26, color: C.muted }}>Verified professional identity</div>
          </div>
        </div>
      ),
      { width: 1200, height: 630, fonts, headers },
    );
  }

  const a = post.author;
  const src = post.kind === "repost" && post.repost_of ? post.repost_of : post;
  const d = src.document;
  const j = src.job;
  const hasAttach = Boolean(d || j);
  const body = snippet(post.body || src.body, hasAttach ? 150 : 330);
  // Hashtags already written inline in the text aren't repeated underneath
  const tags = (post.topics.length ? post.topics : src.topics).filter((t) => !body.toLowerCase().includes(`#${t.toLowerCase()}`)).slice(0, 4);
  const badge = a.badge_level === "green" ? C.green : a.badge_level === "gray" ? "#8b8b96" : null;
  const color = d?.color || C.accent;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: "28px 56px 18px", fontFamily: "Inter" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 32, padding: "28px 40px 24px", overflow: "hidden" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 76, height: 76, borderRadius: 999, background: "#e9edfb", color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 600 }}>{initials(a.name)}</div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 34, fontWeight: 600, color: C.fg }}>
                {a.name}
                {badge && (
                  <div style={{ width: 30, height: 30, borderRadius: 999, background: badge, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 600 }}>✓</div>
                )}
              </div>
              <div style={{ display: "flex", fontSize: 24, color: C.muted }}>{snippet(`${a.headline ? `${a.headline} · ` : ""}${ago(post.created_at)}`, 70)}</div>
            </div>
          </div>
          {/* body */}
          {body && <div style={{ display: "flex", flexShrink: 0, marginTop: 16, fontSize: hasAttach ? 28 : 34, lineHeight: 1.4, color: C.fg }}>{body}</div>}
          {tags.length > 0 && <div style={{ display: "flex", flexShrink: 0, gap: 16, marginTop: 10, fontSize: 23, color: C.muted }}>{tags.map((t) => <span key={t}>#{t}</span>)}</div>}
          {/* attachment */}
          {d && (
            <div style={{ display: "flex", flexShrink: 0, gap: 26, marginTop: 18, padding: 22, borderRadius: 24, border: `2px solid ${C.border}`, background: "#f3f6f6" }}>
              <div style={{ width: 104, height: 138, display: "flex", flexDirection: "column", gap: 7, background: "#fff", border: `2px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", height: 8, width: "75%", borderRadius: 4, background: color }} />
                <div style={{ display: "flex", height: 6, width: "50%", borderRadius: 4, background: "#d1d5db" }} />
                {[90, 77, 64, 90, 77, 64].map((w, i) => <div key={i} style={{ display: "flex", height: 5, width: `${w}%`, borderRadius: 4, background: "#e5e7eb" }} />)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 600, letterSpacing: 2, color: C.muted }}>
                  <div style={{ display: "flex", width: 16, height: 20, borderRadius: 3, border: `2.5px solid ${color}` }} />
                  {`${d.doc_type === "cv" ? "CV" : "COVER LETTER"}${d.pages ? ` · ${d.pages} PAGE${d.pages > 1 ? "S" : ""}` : ""}`}
                </div>
                <div style={{ display: "flex", marginTop: 6, fontSize: 30, fontWeight: 600, color: C.fg }}>{snippet(d.name || d.title, 40)}</div>
                {(d.headline || d.target_job_title) && <div style={{ display: "flex", fontSize: 23, color: C.muted }}>{snippet(d.headline || d.target_job_title, 60)}</div>}
                {d.roles && d.roles.length > 0 && <div style={{ display: "flex", marginTop: 6, fontSize: 19, color: C.muted }}>{snippet(d.roles.slice(0, 2).map((r) => [r.title, r.org].filter(Boolean).join(" · ")).join(" · "), 80)}</div>}
                {d.skills && d.skills.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {d.skills.slice(0, 5).map((s) => <div key={s} style={{ display: "flex", padding: "4px 14px", borderRadius: 999, background: C.pill, color: C.muted, fontSize: 17, fontWeight: 500 }}>{snippet(s, 18)}</div>)}
                  </div>
                )}
                <div style={{ display: "flex", marginTop: 10, fontSize: 17, color: C.muted }}>Contact hidden</div>
              </div>
            </div>
          )}
          {j && (
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 22, padding: 24, borderRadius: 24, border: `2px solid ${C.border}` }}>
              <div style={{ width: 72, height: 72, borderRadius: 18, background: "#e9edfb", color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 600 }}>{initials(j.organization?.name || j.title)}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 18, fontWeight: 600, letterSpacing: 2, color: C.muted }}>OPENING{j.status !== "open" ? ` · ${j.status.toUpperCase()}` : ""}</div>
                <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: C.fg }}>{snippet(j.title, 44)}</div>
                <div style={{ display: "flex", fontSize: 22, color: C.muted }}>{[j.organization?.name, j.location].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", gap: 36, fontSize: 21, color: C.muted, marginTop: 14 }}>
            {[["like", post.counts.likes], ["comment", post.counts.comments], ["repost", post.counts.shares]].map(([k, n]) => (
              <span key={k as string}>{`${n} ${k}${n === 1 ? "" : "s"}`}</span>
            ))}
          </div>
        </div>
        {/* brand strip — outside the card, so no post content can cover it */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, padding: "0 6px", fontSize: 22, color: C.muted }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={34} height={34} alt="" />
            <span style={{ fontWeight: 600, color: C.fg, fontSize: 25 }}>Crede</span>
            <span>· Verified professional identity</span>
          </div>
          <span>{(post.url || "").replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers },
  );
}
