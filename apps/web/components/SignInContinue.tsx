"use client";

import Link from "next/link";

/**
 * Minimal prompt when the user is not signed in.
 * No API paths, health checks, or technical jargon.
 */
export function SignInContinue({ next }: { next?: string }) {
  const href = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-base text-muted">Sign in to continue</p>
      <Link
        href={href}
        className="mt-4 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Sign in
      </Link>
    </div>
  );
}
