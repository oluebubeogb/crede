export const metadata = { title: "Offline — Crede" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <img src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" />
      <h1 className="text-lg font-semibold">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-muted">
        Crede will pick up where you left off as soon as you&apos;re back online.
      </p>
    </main>
  );
}
