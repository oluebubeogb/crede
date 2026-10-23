import type { Org } from "@/components/orgs";
export type Job = {
  id: number; organization_id: number; title: string; department?: string | null; location?: string | null; employment_type?: string | null;
  salary_min?: number | null; salary_max?: number | null; salary_currency: string; description?: string | null; requirements?: string[] | null;
  experience_years_min?: number | null; status: string; deadline?: string | null; created_at: string;
};
export type Candidate = { id: number; full_name?: string | null; headline?: string | null; location?: string | null; years_experience?: number | null; username?: string | null; avatar_url?: string | null; badge_level?: string; claims?: { label?: string } | null; match_score?: number | null };
export const canPost = (o: Org) => ["owner", "admin", "recruiter", "editor"].includes(o.my_role || "");
