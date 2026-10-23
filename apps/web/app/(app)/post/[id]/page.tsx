"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { ErrorNote, SkeletonCard } from "@/components/ui/kit";
import { PostCard } from "@/components/community/PostCard";
import type { Post } from "@/components/community/types";

export default function PostPage({ params }: { params: { id: string } }) {
  const { data, error, reload } = useApi<Post>(`/community/posts/${params.id}`);
  return (
    <div className="mx-auto max-w-feed">
      <Link href="/feed" className="link-muted mb-4 inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="h-4 w-4" />Community</Link>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data && !error && <SkeletonCard avatar lines={4} />}
      {data && <PostCard post={data} expanded onRemoved={() => (window.location.href = "/feed")} />}
    </div>
  );
}
