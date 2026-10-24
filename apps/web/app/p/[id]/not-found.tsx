import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader links={false} />
      <main className="mx-auto max-w-feed px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">This post isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been removed, or it&apos;s only visible to Crede members.</p>
        <Link href="/login" className="btn btn-primary mt-6 inline-flex">Log in to Crede</Link>
      </main>
    </div>
  );
}
