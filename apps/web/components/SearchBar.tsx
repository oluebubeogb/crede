"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = [
  "Search people, posts and organisations…",
  "Find a school or certification issuer…",
  "Look up a company to verify your role…",
];

export function SearchBar({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (query) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % PLACEHOLDERS.length), 4200);
    return () => clearInterval(t);
  }, [query]);

  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`); }}
      className={cn("relative flex h-10 w-full max-w-md items-center rounded-full border border-border bg-surface transition focus-within:border-border-strong focus-within:shadow-[var(--shadow-hover)]", className)}>
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
      <input type="search" value={query} autoFocus={autoFocus} onChange={(e) => setQuery(e.target.value)}
        placeholder={PLACEHOLDERS[index]} aria-label="Search Crede"
        className="h-full w-full rounded-full bg-transparent pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted/80" />
    </form>
  );
}
