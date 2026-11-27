"use client";

import { useState } from "react";
import { useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { pct } from "@/lib/client/format";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, CURRENCIES, balance, closedResult, type AccountKind, type JournalAccount } from "@/lib/journal";
import { NumberInput } from "./number-input";
import { PlanLock } from "./plan-lock";
import { Alert, Button, Card, Field } from "./ui";
import { amount, type JournalData } from "./journal-shared";

interface Draft {
  name: string;
  kind: AccountKind;
  currency: string;
  capital: number | null;
  riskPct: number | null;
}

const blank: Draft = { name: "", kind: "real", currency: "USD", capital: null, riskPct: 1 };

/** Creates or edits an account: its capital and planned risk give 1R its meaning. */
export function AccountForm({ account, onDone, onCancel }: { account?: JournalAccount; onDone: () => void; onCancel?: () => void }) {
  const tl = useT();
  const [d, setD] = useState<Draft>(account ? { name: account.name, kind: account.kind, currency: account.currency, capital: account.capital, riskPct: account.riskPct } : blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    if (!d.name.trim()) return setError(tl("Donne un nom au compte."));
    if (!d.capital || d.capital <= 0) return setError(tl("Indique le capital de départ du compte."));
    if (!d.riskPct || d.riskPct <= 0) return setError(tl("Indique ton risque prévu par trade, en % du capital."));
    setBusy(true);
    setError(null);
    try {
      const body = { name: d.name.trim(), kind: d.kind, currency: d.currency, capital: d.capital, riskPct: d.riskPct };
      await api(account ? `/api/journal/accounts/${account.id}` : "/api/journal/accounts", { method: account ? "PUT" : "POST", json: body });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tl("Nom du compte")}>
          <input value={d.name} maxLength={60} placeholder={tl("Compte principal")} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={tl("Type")}>
          <select value={d.kind} onChange={(e) => set({ kind: e.target.value as AccountKind })}>
            {ACCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {tl(ACCOUNT_KIND_LABELS[k])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tl("Capital de départ")} term="capital">
          <div className="flex gap-1">
            <NumberInput nullable value={d.capital} onChange={(v) => set({ capital: v })} min={0} step={100} className="min-w-0 flex-1" />
            <select value={d.currency} onChange={(e) => set({ currency: e.target.value })} aria-label={tl("Devise")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </Field>
        <Field label={tl("Risque prévu par trade (%)")} term="risque-par-trade" hint={tl("Le journal te prévient quand un trade risque plus.")}>
          <NumberInput nullable value={d.riskPct} onChange={(v) => set({ riskPct: v })} min={0} step={0.25} />
        </Field>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {account ? tl("Enregistrer") : tl("Créer le compte")}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {tl("Annuler")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The first screen of an empty journal: one account before the first trade. */
export function FirstAccount({ onCreated }: { onCreated: () => void }) {
  const tl = useT();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{tl("Journal de trading")}</h1>
        <p className="mt-1 text-sm text-muted">
          {tl("Note tes trades réels à l'entrée, clôture-les à la sortie : le journal calcule tes résultats en R et montre si tu suis ton plan.")}
        </p>
      </div>
      <Card title={tl("Commence par ton compte")}>
        <p className="mb-3 text-sm text-muted">
          {tl("Le journal range tes trades par compte. Ton capital et ton risque par trade servent à mesurer 1R et à te prévenir quand un trade risque plus que prévu.")}
        </p>
        <AccountForm onDone={onCreated} />
      </Card>
    </div>
  );
}

/** The accounts with their balance, and the way to add, edit, archive or delete one. */
export function JournalAccounts({ data, onChanged }: { data: JournalData; onChanged: () => void }) {
  const tl = useT();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = data.accounts.length >= data.plan.accounts;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = (a: JournalAccount, trades: number) => {
    const question = trades
      ? tl("Supprimer le compte « {0} » et ses {1} trades ? C'est définitif : archive-le plutôt pour garder son historique.", [a.name, trades])
      : tl("Supprimer le compte « {0} » ?", [a.name]);
    if (confirm(question)) act(() => api(`/api/journal/accounts/${a.id}`, { method: "DELETE" }));
  };

  const archive = (a: JournalAccount, archived: boolean) =>
    act(() => api(`/api/journal/accounts/${a.id}`, { method: "PUT", json: { name: a.name, kind: a.kind, currency: a.currency, capital: a.capital, riskPct: a.riskPct, archived } }));

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      {data.accounts.map((a) => {
        const trades = data.trades.filter((t) => t.accountId === a.id);
        const results = trades.map((t) => closedResult(t, a.currency)).filter((r) => r !== null);
        const now = balance(a.capital, results.map((r) => r.amount));
        const change = ((now - a.capital) / a.capital) * 100;
        return (
          <Card
            key={a.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {a.name}
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] font-normal text-muted">{tl(ACCOUNT_KIND_LABELS[a.kind])}</span>
                {a.archived && <span className="text-[11px] font-normal text-muted">{tl("archivé")}</span>}
              </span>
            }
            actions={
              editing !== a.id && (
                <span className="flex gap-3 text-xs text-muted">
                  <button onClick={() => setEditing(a.id)} className="hover:text-fg">
                    {tl("Modifier")}
                  </button>
                  <button onClick={() => archive(a, !a.archived)} className="hover:text-fg">
                    {a.archived ? tl("Réactiver") : tl("Archiver")}
                  </button>
                  <button onClick={() => remove(a, trades.length)} className="hover:text-down">
                    {tl("Supprimer")}
                  </button>
                </span>
              )
            }
          >
            {editing === a.id ? (
              <AccountForm
                account={a}
                onDone={() => {
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">{tl("Capital de départ")}</dt>
                  <dd className="num">{amount(a.capital, a.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{tl("Capital actuel")}</dt>
                  <dd className="num">
                    {amount(now, a.currency)} <span className={`text-xs ${change >= 0 ? "text-up" : "text-down"}`}>{pct(change)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{tl("Risque prévu par trade")}</dt>
                  <dd className="num">
                    {pct(a.riskPct, 2, false)} · {amount((now * a.riskPct) / 100, a.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{tl("Trades")}</dt>
                  <dd className="num">{tl("{0} clôturés · {1} en cours", [results.length, trades.length - results.length])}</dd>
                </div>
              </dl>
            )}
          </Card>
        );
      })}
      {editing === "new" ? (
        <Card title={tl("Nouveau compte")}>
          <AccountForm
            onDone={() => {
              setEditing(null);
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        </Card>
      ) : full ? (
        data.plan.accounts === 1 ? (
          <PlanLock>{tl("Suivre plusieurs comptes (réel, démo, challenge) fait partie des offres Trader et Pro.")}</PlanLock>
        ) : (
          <p className="text-sm text-muted">{tl("Tu as atteint {0} comptes : archive ou supprime un compte pour en ajouter un.", [data.plan.accounts])}</p>
        )
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setEditing("new")}>
            {tl("+ Ajouter un compte")}
          </Button>
        </div>
      )}
    </div>
  );
}
