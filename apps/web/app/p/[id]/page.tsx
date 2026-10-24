import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader, PublicFooter } from "@/components/PublicHeader";
import { PublicPost } from "./PublicPost";
import { getPublicPost, ogImageFor, siteOrigin, snippet } from "@/lib/server-api";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = await getPublicPost(params.id);
  if (!post) return { title: "Post not found", robots: { index: false } };
  const a = post.author;
  const origin = siteOrigin(post);
  const url = `${origin}/p/${post.id}`;
  const attach = post.document ? `${post.document.doc_type === "cv" ? "CV" : "Cover letter"}: ${post.document.name || post.document.title}${post.document.headline ? ` — ${post.document.headline}` : ""}`
    : post.job ? `Opening: ${post.job.title}${post.job.organization?.name ? ` at ${post.job.organization.name}` : ""}${post.job.location ? ` · ${post.job.location}` : ""}` : "";
  const lead = snippet(post.body || post.repost_of?.body, 70);
  const title = `${a.name}${a.headline ? ` (${snippet(a.headline, 50)})` : ""}${lead ? `: “${lead}”` : " on Crede"}`;
  const description = [snippet(post.body || post.repost_of?.body, 200), attach, post.topics.length ? post.topics.map((t) => `#${t}`).join(" ") : ""]
    .filter(Boolean).join(" · ") || `${a.name} shared a post on Crede — verified professional identity.`;
  const img = ogImageFor(post);
  return {
    metadataBase: new URL(origin),
    title: { absolute: `${title} · Crede` },
    description,
    alternates: { canonical: url },
    authors: [{ name: a.name, url: a.username ? `${origin}/u/${a.username}` : undefined }],
    keywords: post.topics,
    openGraph: {
      type: "article", siteName: "Crede", url, title, description, locale: "en_NG",
      publishedTime: post.created_at, authors: a.username ? [`${origin}/u/${a.username}`] : [a.name], tags: post.topics,
      images: [{ url: img.url, width: img.width, height: img.height, alt: img.alt, type: img.url.endsWith(".jpg") ? "image/jpeg" : "image/png" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: img.url, alt: img.alt }] },
    other: { "article:author": a.name, "article:published_time": post.created_at },
  };
}

export default async function PublicPostPage({ params }: { params: { id: string } }) {
  const post = await getPublicPost(params.id);
  if (!post) notFound();
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader links={false} />
      <main className="mx-auto max-w-feed px-4 py-6 sm:py-10">
        <PublicPost post={post} />
        <div className="card mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold">Join the conversation on Crede</p>
            <p className="text-sm text-muted">Comment, repost and build a verified career profile recruiters trust.</p>
          </div>
          <Link href={`/login?next=${encodeURIComponent(`/post/${post.id}`)}`} className="btn btn-primary">Open in Crede</Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
