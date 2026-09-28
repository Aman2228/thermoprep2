"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/library", label: "Library" },
  { href: "/learn", label: "Learn" },
  { href: "/session", label: "Practice" },
];

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <nav className="border-b border-ink-700 sticky top-0 z-50 bg-ink-950/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/dashboard" className="font-display text-xl font-semibold tracking-tight">
              ThermoPrep <span className="text-brass-400">v2</span>
            </Link>

            {session?.user?.email && (
              <p className="text-xs text-chalk-400 truncate max-w-[220px] sm:max-w-none">{session.user.email}</p>
            )}
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="border border-ink-600 hover:border-brass-400 px-3 py-1.5 rounded-lg text-sm shrink-0 transition-colors"
          >
            Sign out
          </button>
        </div>

        <div className="flex items-center gap-5 text-sm overflow-x-auto pb-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 pb-1 border-b-2 transition-colors ${
                pathname?.startsWith(link.href)
                  ? "text-chalk-50 border-brass-400 font-medium"
                  : "text-chalk-400 border-transparent hover:text-chalk-50"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
