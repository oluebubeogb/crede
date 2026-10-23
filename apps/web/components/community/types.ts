import type { MatchResult } from "@/components/MatchScore";

export type Author = { id: number; name: string; username?: string | null; headline?: string | null; avatar_url?: string | null; badge_level?: string };
export type PostImage = { key: string; w?: number; h?: number; url: string };
export type DocCard = {
  id: number; doc_type: "cv" | "cover_letter"; title: string; template: string; color: string; name?: string; headline?: string;
  summary?: string; skills?: string[]; roles?: { title?: string; org?: string }[]; pages?: number; target_job_title?: string;
  contact_hidden: boolean; contact?: { email?: string; phone?: string; location?: string };
};
export type JobCard = {
  id: number; title: string; location?: string; employment_type?: string; status: string;
  salary_min?: number; salary_max?: number; salary_currency?: string;
  organization?: { id: number; name: string; logo_url?: string; verified: boolean } | null; match?: MatchResult | null;
};
export type Post = {
  id: number; kind: "text" | "document" | "job" | "repost"; body: string; topics: string[]; images: PostImage[];
  author: Author; created_at: string; edited: boolean; counts: { likes: number; comments: number; shares: number };
  liked: boolean; saved: boolean; is_mine: boolean; can_moderate: boolean; hidden: boolean; url: string;
  document?: DocCard | null; job?: JobCard | null; repost_of?: Post | null;
};
export type CommentT = {
  id: number; parent_id?: number | null; body: string; hidden: boolean; author: Author; likes: number; liked: boolean;
  is_mine: boolean; can_delete: boolean; created_at: string; replies: CommentT[];
};
