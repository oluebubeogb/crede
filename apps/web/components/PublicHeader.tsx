import Image from "next/image";
import Link from "next/link";

export function PublicHeader({ links = true }: { links?: boolean }) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icons/logo-64.png" alt="" width={28} height={28} priority />
          <span className="text-[15px] font-semibold tracking-tight">Crede</span>
        </Link>
        {links && (
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/#how" className="hover:text-foreground">How it works</Link>
            <Link href="/for-recruiters" className="hover:text-foreground">For recruiters</Link>
            <Link href="/#badges" className="hover:text-foreground">Badges</Link>
          </nav>
        )}
        <div className="flex-1" />
        <Link href="/login" className="link-muted text-sm">Log in</Link>
        <Link href="/login?mode=signup" className="btn btn-primary btn-sm">Get started</Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-sm text-muted">
        <span>© {new Date().getFullYear()} Crede · part of Collab Suite</span>
        <div className="flex-1" />
        <Link href="/for-recruiters" className="link-muted">For recruiters</Link>
        <Link href="/feed" className="link-muted">Community</Link>
        <Link href="/login" className="link-muted">Log in</Link>
      </div>
    </footer>
  );
}
