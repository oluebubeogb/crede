"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = [
  "Search skills, certifications, or people…",
  "Find opportunities matching your profile…",
  "Look up jobs, candidates, or organizations…",
  "Search documents, timeline, or verifications…",
  "Discover roles aligned with your career path…",
];

export function SearchBar({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (query) return; // pause animation while typing

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % PLACEHOLDERS.length);
        setFade(true);
      }, 300);
    }, 3800);

    return () => clearInterval(interval);
  }, [query]);

  return (
    <div
      className={cn(
        "relative flex h-14 w-full items-center border-b border-border bg-background px-4 sm:px-6",
        className
      )}
    >
      <Search className="absolute left-4 sm:left-6 h-4 w-4 text-muted pointer-events-none" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-full w-full bg-transparent pl-8 pr-4 text-sm text-foreground outline-none placeholder:text-transparent"
        aria-label="Search Crede"
      />
      {/* Animated placeholder overlay — only visible when input is empty */}
      {!query && (
        <span
          className={cn(
            "pointer-events-none absolute left-12 sm:left-14 top-1/2 -translate-y-1/2 text-sm text-muted transition-opacity duration-300 ease-in-out",
            fade ? "opacity-100" : "opacity-0"
          )}
          aria-hidden
        >
          {PLACEHOLDERS[index]}
        </span>
      )}
    </div>
  );
}
