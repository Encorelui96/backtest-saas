"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import type { JournalTrade } from "@/lib/journal";
import { Loading } from "./loading";
import { Alert, Button, Tabs } from "./ui";
import { FirstAccount, JournalAccounts } from "./journal-accounts";
import { JournalSetups } from "./journal-setups";
import { JournalTrades } from "./journal-trades";
import { TradeForm, type TradeFormMode } from "./journal-trade-form";
import { JOURNAL_CHANGED, type JournalData } from "./journal-shared";

type Tab = "trades" | "setups" | "accounts";

/** Remembers the account a new trade goes to, in this browser. */
const ACCOUNT_KEY = "backtest-lab:journal-account";

function savedAccount() {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The trading journal: trades, setups and accounts, and the trade form over them. */
export function Journal() {
  const tl = useT();
  const [data, setData] = useState<JournalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("trades");
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

  if (!data) return error ? <Alert tone="error">{error}</Alert> : <Loading />;
  if (!data.accounts.length) return <FirstAccount onCreated={load} />;

  const active = data.accounts.filter((a) => !a.archived);
  // A new trade goes to the account shown, else the last one used, else the first open one.
  const preferred = accountId || savedAccount();
  const target = active.find((a) => a.id === preferred)?.id ?? active[0]?.id ?? data.accounts[0].id;
  const openCount = data.trades.filter((t) => !t.close).length;

  const newTrade = () => setForm({ trade: null, mode: "open", now: Date.now() });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{tl("Journal de trading")}</h1>
          <p className="mt-0.5 text-sm text-muted">{tl("Chaque trade réel, mesuré en R : ce que tu gagnes vraiment, et si tu suis ton plan.")}</p>
        </div>
        <Button onClick={newTrade} className="hidden md:block">
          {tl("+ Nouveau trade")}
        </Button>
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "trades", label: openCount ? tl("Trades ({0} en cours)", [openCount]) : tl("Trades") },
          { id: "setups", label: tl("Configurations") },
          { id: "accounts", label: tl("Comptes et plan") },
        ]}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {tab === "trades" && (
        <JournalTrades
          data={data}
          accountId={accountId}
          onAccount={chooseAccount}
          onNew={newTrade}
          onClose={(trade) => setForm({ trade, mode: "close", now: Date.now() })}
          onEdit={(trade) => setForm({ trade, mode: "edit", now: Date.now() })}
        />
      )}
      {tab === "setups" && <JournalSetups data={data} onChanged={load} />}
      {tab === "accounts" && <JournalAccounts data={data} onChanged={load} />}

      {/* Always within thumb reach on phones, above the tab bar. */}
      <button
        onClick={newTrade}
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg md:hidden"
      >
        {tl("+ Nouveau trade")}
      </button>

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
    </div>
  );
}
