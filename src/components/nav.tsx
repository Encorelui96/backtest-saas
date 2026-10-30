"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";

const LINKS = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/strategies/new", label: "Nouvelle stratégie", short: "Stratégie", icon: "M12 5v14M5 12h14" },
  { href: "/live", label: "Live", short: "Live", icon: "M3 17l5-6 4 4 8-9M14 6h6v6" },
  { href: "/compte", label: "Mon compte", short: "Compte", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
];

function active(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/backtests");
  if (href === "/strategies/new") return path.startsWith("/strategies");
  return path.startsWith(href);
}

/** Top bar on desktop; on phones a slim top bar and a bottom tab bar within thumb reach. */
export function Nav() {
  const path = usePathname();
  const { data: session, isPending } = authClient.useSession();
  // Visitors only see the sign-in link: the app's pages need an account.
  if (!isPending && !session) {
    return (
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-sm">
          <Link href="/" className="font-semibold text-fg">
            Backtest<span className="text-accent">Lab</span>
          </Link>
          {!path.startsWith("/connexion") && (
            <Link href="/connexion" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white">
              Connexion
            </Link>
          )}
        </nav>
      </header>
    );
  }
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
          <Link href="/" className="font-semibold text-fg">
            Backtest<span className="text-accent">Lab</span>
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`hidden md:block ${l.href === "/compte" ? "md:ml-auto" : ""} ${active(path, l.href) ? "text-fg" : "text-muted hover:text-fg"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active(path, l.href) ? "text-accent" : "text-muted"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={l.icon} />
              </svg>
              {l.short}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

export function NavFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel">
      <nav className="mx-auto flex max-w-7xl items-center px-4 py-3 text-sm font-semibold">
        Backtest<span className="text-accent">Lab</span>
      </nav>
    </header>
  );
}
