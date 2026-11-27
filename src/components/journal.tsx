"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LanguageSwitch, Link, useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import type { JournalTrade } from "@/lib/journal";
import { LevelToggle } from "./learn";
import { Loading } from "./loading";
import { Alert, Button } from "./ui";
import { FirstAccount, JournalAccounts } from "./journal-accounts";
import { JournalSetups } from "./journal-setups";
import { JournalTrades } from "./journal-trades";
import { TradeForm, type TradeFormMode } from "./journal-trade-form";
import { JOURNAL_CHANGED, type JournalData } from "./journal-shared";

type Section = "trades" | "setups" | "accounts";

const SECTIONS: { id: Section; label: string; short: string; intro: string; icon: string }[] = [
  {
    id: "trades",
    label: "Trades",
    short: "Trades",
    intro: "Chaque trade réel, mesuré en R : ce que tu gagnes vraiment, et si tu suis ton plan.",
    icon: "M4 19h16M4 15l4-4 4 3 6-7",
  },
  {
    id: "setups",
    label: "Configurations",
    short: "Configs",
    intro: "Les situations que tu sais reconnaître et trader toujours de la même façon.",
    icon: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  },
  {
    id: "accounts",
    label: "Comptes et plan",
    short: "Comptes",
    intro: "Tes comptes, leur capital et les règles que le journal vérifie à chaque trade.",
    icon: "M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2",
  },
];

/** The journal's mark: a notebook, as on the site's Journal tab. */
const NOTEBOOK = "M9 4h6M9 4a1 1 0 00-1 1v1h8V5a1 1 0 00-1-1M8 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-2M9 12h6M9 16h4";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * The journal's own frame: its bar with the way back to Backtest Lab, its sections and its
 * "+ New trade" button. The site's bars and footer are hidden on these pages (data-journal-space).
 */
export function JournalFrame({
  children,
  section,
  onSection,
  onNew,
  open = 0,
}: {
  children: ReactNode;
  /** Left out until the first account exists. */
  section?: Section;
  onSection?: (s: Section) => void;
  onNew?: () => void;
  /** Trades still open: the badge on Trades. */
  open?: number;
}) {
  const tl = useT();
  const current = SECTIONS.find((s) => s.id === section);
  const nav = current && onSection && onNew ? { current, onSection, onNew } : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 -mx-3 border-b border-line bg-panel/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:-mx-4 sm:px-4">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-1 text-sm text-muted hover:text-fg" aria-label={tl("Retour à Backtest Lab")}>
            <Icon d="M15 18l-6-6 6-6" className="h-4 w-4" />
            <span className="hidden sm:inline">{tl("Retour à Backtest Lab")}</span>
            <span className="sm:hidden">{tl("Retour")}</span>
          </Link>
          <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <Icon d={NOTEBOOK} className="h-5 w-5 shrink-0 text-accent" />
            <span className="truncate sm:hidden">{tl("Journal")}</span>
            <span className="hidden truncate sm:inline">{tl("Journal de trading")}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <LevelToggle />
            <span className="hidden sm:block">
              <LanguageSwitch />
            </span>
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 pt-4 pb-28 md:pt-6 md:pb-10">
        {nav && (
          <aside className="sticky top-20 hidden w-56 shrink-0 self-start md:flex md:flex-col md:gap-1">
            <Button onClick={nav.onNew} className="mb-3 w-full">
              {tl("+ Nouveau trade")}
            </Button>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => nav.onSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${section === s.id ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel-2/50 hover:text-fg"}`}
              >
                <Icon d={s.icon} className="h-4 w-4" />
                <span className="flex-1">{tl(s.label)}</span>
                {s.id === "trades" && open > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">{open}</span>}
              </button>
            ))}
            <p className="mt-6 px-3 text-[11px] leading-relaxed text-muted">{tl("Ton journal est privé : toi seul le vois.")}</p>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          {nav && (
            <div className="mb-4">
              <h1 className="text-xl font-semibold">{tl(nav.current.label)}</h1>
              <p className="mt-0.5 text-sm text-muted">{tl(nav.current.intro)}</p>
            </div>
          )}
          {children}
        </div>
      </div>

      {nav && (
        // On phones: the journal's own tab bar, with the new trade in the middle, within thumb reach.
        <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={tl("Journal de trading")}>
          {[SECTIONS[0], SECTIONS[1], null, SECTIONS[2]].map((s) =>
            s ? (
              <button
                key={s.id}
                onClick={() => nav.onSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${section === s.id ? "text-accent" : "text-muted"}`}
              >
                <Icon d={s.icon} className="h-6 w-6" />
                {s.id === "trades" && open > 0 && (
                  <span className="absolute top-1 left-1/2 ml-1.5 rounded-full bg-accent px-1 text-[9px] font-semibold leading-3.5 text-white">{open}</span>
                )}
                {tl(s.short)}
              </button>
            ) : (
              <span key="new" className="flex flex-1 justify-center pb-2">
                <button onClick={nav.onNew} className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg" aria-label={tl("+ Nouveau trade")}>
                  <Icon d="M12 5v14M5 12h14" className="h-7 w-7" />
                </button>
              </span>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

/** Remembers the account a new trade goes to, in this browser. */
const ACCOUNT_KEY = "backtest-lab:journal-account";

function savedAccount() {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The trading journal: trades, setups and accounts, and the trade form over them, in its own frame. */
export function Journal() {
  const [data, setData] = useState<JournalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("trades");
  const [accountId, setAccountId] = useState("");
  const [form, setForm] = useState<{ trade: JournalTrade | null; mode: TradeFormMode; now: number } | null>(null);

  const load = useCallback(
    () =>
      api<JournalData>("/api/journal").then(
        (d) => {
          setData(d);
          setError(null);
          window.dispatchEvent(new CustomEvent(JOURNAL_CHANGED, { detail: d.trades.filter((t) => !t.close).length }));
        },
        (e: Error) => setError(e.message),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const chooseAccount = (id: string) => {
    setAccountId(id);
    try {
      if (id) localStorage.setItem(ACCOUNT_KEY, id);
    } catch {
      // Private browsing: the choice only lasts for this page.
    }
  };

  if (!data) return <JournalFrame>{error ? <Alert tone="error">{error}</Alert> : <Loading />}</JournalFrame>;
  if (!data.accounts.length)
    return (
      <JournalFrame>
        <FirstAccount onCreated={load} />
      </JournalFrame>
    );

  const active = data.accounts.filter((a) => !a.archived);
  // A new trade goes to the account shown, else the last one used, else the first open one.
  const preferred = accountId || savedAccount();
  const target = active.find((a) => a.id === preferred)?.id ?? active[0]?.id ?? data.accounts[0].id;
  const newTrade = () => setForm({ trade: null, mode: "open", now: Date.now() });

  return (
    <JournalFrame
      section={section}
      onSection={(s) => {
        setSection(s);
        window.scrollTo({ top: 0 });
      }}
      onNew={newTrade}
      open={data.trades.filter((t) => !t.close).length}
    >
      {error && <Alert tone="error">{error}</Alert>}

      {section === "trades" && (
        <JournalTrades
          data={data}
          accountId={accountId}
          onAccount={chooseAccount}
          onNew={newTrade}
          onClose={(trade) => setForm({ trade, mode: "close", now: Date.now() })}
          onEdit={(trade) => setForm({ trade, mode: "edit", now: Date.now() })}
        />
      )}
      {section === "setups" && <JournalSetups data={data} onChanged={load} />}
      {section === "accounts" && <JournalAccounts data={data} onChanged={load} />}

      {form && (
        <TradeForm
          data={data}
          trade={form.trade}
          mode={form.mode}
          accountId={target}
          now={form.now}
          onDone={() => {
            setForm(null);
            load();
          }}
          onCancel={() => setForm(null)}
        />
      )}
    </JournalFrame>
  );
}
