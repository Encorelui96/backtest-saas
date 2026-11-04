"use client";

import { LanguageSwitch, Link, useBarePath, useT } from "@/lib/client/i18n";
import { authClient } from "@/lib/client/auth-client";
import { LevelToggle } from "./learn";

const LINKS = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/strategies/new", label: "Nouvelle stratégie", short: "Stratégie", icon: "M12 5v14M5 12h14" },
  { href: "/live", label: "Live", short: "Live", icon: "M3 17l5-6 4 4 8-9M14 6h6v6" },
  { href: "/apprendre", label: "Apprendre", short: "Apprendre", icon: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 21V5M8 7h7M8 11h7" },
  { href: "/tarifs", label: "Tarifs", short: "Tarifs", icon: "M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM8 8h.01" },
  { href: "/compte", label: "Mon compte", short: "Compte", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
];

/** The offers stay out of the phone app. */
const webOnly = (href: string) => (href === "/tarifs" ? "web-only " : "");

function active(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/backtests");
  if (href === "/strategies/new") return path.startsWith("/strategies");
  return path.startsWith(href);
}

/** Top bar on desktop; on phones a slim top bar and a bottom tab bar within thumb reach. */
export function Nav() {
  const tl = useT();
  const path = useBarePath();
  const t = useT();
  const { data: session, isPending } = authClient.useSession();
  // Visitors only see the sign-in link: the app's pages need an account.
  if (!isPending && !session) {
    return (
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 text-sm sm:px-4">
          <Link href="/" className="font-semibold text-fg">
            {tl("Backtest")}<span className="text-accent">{tl("Lab")}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Too wide for a small phone, where the footer has it too. */}
            <Link href="/apprendre" className={`hidden min-[420px]:inline ${path.startsWith("/apprendre") ? "text-fg" : "text-muted hover:text-fg"}`}>
              {t("Apprendre")}
            </Link>
            <Link href="/tarifs" className={`web-only ${path.startsWith("/tarifs") ? "text-fg" : "text-muted hover:text-fg"}`}>
              {t("Tarifs")}
            </Link>
            <LanguageSwitch />
            {!path.startsWith("/connexion") && (
              <Link href="/connexion" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white">
                {t("Connexion")}
              </Link>
            )}
          </div>
        </nav>
      </header>
    );
  }
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
          <Link href="/" className="font-semibold text-fg">
            {tl("Backtest")}<span className="text-accent">{tl("Lab")}</span>
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`${webOnly(l.href)}hidden md:block ${active(path, l.href) ? "text-fg" : "text-muted hover:text-fg"}`}>
              {t(l.label)}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-3">
            {/* Only where the level changes the page: the dashboard, the editor and the results. */}
            {(path === "/" || path.startsWith("/strategies") || path.startsWith("/backtests")) && <LevelToggle />}
            <LanguageSwitch />
          </span>
        </nav>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`${webOnly(l.href)}flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active(path, l.href) ? "text-accent" : "text-muted"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={l.icon} />
              </svg>
              {t(l.short)}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

export function NavFallback() {
  const tl = useT();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex max-w-7xl items-center px-4 py-3 text-sm font-semibold">
        {tl("Backtest")}<span className="text-accent">{tl("Lab")}</span>
      </nav>
    </header>
  );
}
