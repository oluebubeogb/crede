"use client";

import { PostCard } from "@/components/community/PostCard";
import { Toaster } from "@/components/ui/kit";
import type { Post } from "@/components/community/types";

export function PublicPost({ post }: { post: Post }) {
  return (
    <>
      <PostCard post={post} mode="public" />
      <Toaster />
    </>
  );
}
