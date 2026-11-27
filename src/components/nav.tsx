"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LanguageSwitch, Link, useBarePath, useT } from "@/lib/client/i18n";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { signedInHint } from "@/lib/signed-in-hint";
import { JOURNAL_CHANGED } from "./journal-shared";
import { LevelToggle } from "./learn";

/** `bar`: where the link shows. The phone's tab bar has room for six, so Journal takes the place of Tarifs there. */
const LINKS: { href: string; label: string; short: string; icon: string; bar: "both" | "top" }[] = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10", bar: "both" },
  { href: "/strategies/new", label: "Nouvelle stratégie", short: "Stratégie", icon: "M12 5v14M5 12h14", bar: "both" },
  { href: "/live", label: "Live", short: "Live", icon: "M3 17l5-6 4 4 8-9M14 6h6v6", bar: "both" },
  { href: "/journal", label: "Journal", short: "Journal", icon: "M9 4h6M9 4a1 1 0 00-1 1v1h8V5a1 1 0 00-1-1M8 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-2M9 12h6M9 16h4", bar: "both" },
  { href: "/apprendre", label: "Apprendre", short: "Apprendre", icon: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 21V5M8 7h7M8 11h7", bar: "both" },
  { href: "/tarifs", label: "Tarifs", short: "Tarifs", icon: "M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM8 8h.01", bar: "top" },
  { href: "/compte", label: "Mon compte", short: "Compte", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0", bar: "both" },
];

/** The offers stay out of the phone app. */
const webOnly = (href: string) => (href === "/tarifs" ? "web-only " : "");

/** Trades still open in the journal, for the badge on its tab: read once, then from the journal page as it changes. */
function useOpenTrades(signedIn: boolean) {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    api<{ open: number }>("/api/journal/open").then((r) => setOpen(r.open), () => {});
    const onChange = (e: Event) => setOpen((e as CustomEvent<number>).detail);
    window.addEventListener(JOURNAL_CHANGED, onChange);
    return () => window.removeEventListener(JOURNAL_CHANGED, onChange);
  }, [signedIn]);
  return signedIn ? open : 0;
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">{n}</span>;
}

function active(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/backtests");
  if (href === "/strategies/new") return path.startsWith("/strategies");
  return path.startsWith(href);
}

const neverChanges = () => () => {};

/** Top bar on desktop; on phones a slim top bar and a bottom tab bar within thumb reach. */
export function Nav() {
  const tl = useT();
  const path = useBarePath();
  const t = useT();
  const { data: session, isPending } = authClient.useSession();
  const hinted = useSyncExternalStore(neverChanges, signedInHint, () => false);
  const open = useOpenTrades(Boolean(session));
  // Visitors only see the sign-in link: the app's pages need an account.
  if (!session && !(isPending && hinted)) {
    return (
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-2 px-3 py-3 text-sm sm:px-4">
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
        <nav className="mx-auto flex min-h-14 max-w-7xl items-center gap-4 px-4 py-3 text-sm lg:gap-6">
          <Link href="/" className="font-semibold text-fg">
            {tl("Backtest")}<span className="text-accent">{tl("Lab")}</span>
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`${webOnly(l.href)}hidden md:block ${active(path, l.href) ? "text-fg" : "text-muted hover:text-fg"}`}>
              {t(l.label)}
              {l.href === "/journal" && <Badge n={open} />}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-3">
            {/* Only where the level changes the page: the dashboard, the editor and the results. The journal has its own bar. */}
            {(path === "/" || path.startsWith("/strategies") || path.startsWith("/backtests")) && <LevelToggle />}
            <LanguageSwitch />
          </span>
        </nav>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex">
          {LINKS.filter((l) => l.bar === "both").map((l) => (
            <Link key={l.href} href={l.href} className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active(path, l.href) ? "text-accent" : "text-muted"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={l.icon} />
              </svg>
              {l.href === "/journal" && open > 0 && (
                <span className="absolute top-1 left-1/2 ml-1.5 rounded-full bg-accent px-1 text-[9px] font-semibold leading-3.5 text-white">{open}</span>
              )}
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
      <nav className="mx-auto flex min-h-14 max-w-7xl items-center px-4 py-3 text-sm font-semibold">
        {tl("Backtest")}<span className="text-accent">{tl("Lab")}</span>
      </nav>
    </header>
  );
}
