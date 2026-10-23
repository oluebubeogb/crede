"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { useMe } from "@/lib/me";
import { Avatar, VerifiedBadge } from "@/components/ui/kit";
import { SearchBar } from "@/components/SearchBar";
import { NotificationBell } from "@/components/NotificationBell";

/** Mobile: compact app bar (logo · search · bell · avatar). Desktop: search + bell. */
export function TopBar() {
  const { me, unread } = useMe();
  const pathname = usePathname();
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 items-center gap-2 px-4 md:hidden">
        <Link href="/feed" className="flex items-center gap-2">
          <Image src="/icons/logo-64.png" alt="" width={26} height={26} priority />
          <span className="text-[15px] font-semibold tracking-tight">Crede</span>
        </Link>
        <div className="flex-1" />
        <Link href="/search" aria-label="Search" className="flex h-10 w-10 items-center justify-center rounded-full text-muted nav-hover">
          <Search className="h-5 w-5" />
        </Link>
        <Link href="/notifications" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted nav-hover">
          <Bell className="h-5 w-5" />
          {unread > 0 && pathname !== "/notifications" && (
            <span className="absolute right-1.5 top-1.5 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <Link href="/profile" aria-label="Your profile" className="relative ml-0.5">
          <Avatar name={me?.full_name || me?.email} src={me?.avatar_url} size={32} />
          {me?.badge_level && me.badge_level !== "none" && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-2 ring-background"><VerifiedBadge level={me.badge_level} size={12} /></span>
          )}
        </Link>
      </div>
      <div className="hidden h-14 items-center gap-3 px-6 md:flex">
        <SearchBar />
        <div className="flex-1" />
        <NotificationBell />
      </div>
    </header>
  );
}
