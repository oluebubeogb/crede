// Server-only helpers for public pages (metadata, OG images). Never send cookies — public data only.
import type { Post } from "@/components/community/types";

export const API_ORIGIN = (process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export async function getPublicPost(id: string): Promise<Post | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await fetch(`${API_ORIGIN}/api/community/public/posts/${id}`, { next: { revalidate: 120 }, headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as Post;
  } catch {
    return null;
  }
}

/** Absolute site origin, taken from the API's share URL (APP_URL) so it matches the canonical link. */
export function siteOrigin(post?: Post | null): string {
  const fromPost = post?.url?.match(/^https?:\/\/[^/]+/)?.[0];
  return fromPost || (process.env.NEXT_PUBLIC_APP_URL || "https://crede.collab.name.ng").replace(/\/$/, "");
}

export function snippet(s: string | undefined | null, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/** The post's own image when it has one; otherwise the generated card. Both are absolute, public and cached. */
export function ogImageFor(post: Post): { url: string; width: number; height: number; alt: string } {
  const origin = siteOrigin(post);
  const img = post.images?.[0] || post.repost_of?.images?.[0];
  const alt = `${post.author.name} on Crede${post.body ? ` — ${snippet(post.body, 120)}` : ""}`;
  if (img) {
    const w = img.w || 1200, h = img.h || 630, k = Math.min(1, 1200 / Math.max(w, h));
    return { url: `${origin}/backend/api/community/public/posts/${post.id}/image.jpg`, width: Math.round(w * k), height: Math.round(h * k), alt };
  }
  return { url: `${origin}/og/post/${post.id}`, width: 1200, height: 630, alt };
}
