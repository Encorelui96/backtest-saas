"use client";

import { useState } from "react";
import { useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { num, pct } from "@/lib/client/format";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, ALL_DAYS, CURRENCIES, WEEK_DAYS, balance, closedResult, type AccountKind, type JournalAccount } from "@/lib/journal";
import { Help } from "./learn";
import { NumberInput } from "./number-input";
import { PlanLock } from "./plan-lock";
import { Alert, Button, Card, Field } from "./ui";
import { accountBody, amount, deviceTimeZone, type JournalData } from "./journal-shared";

interface Draft {
  name: string;
  kind: AccountKind;
  currency: string;
  capital: number | null;
  riskPct: number | null;
  maxDailyLossR: number | null;
  maxTradesDay: number | null;
  /** Bitmask, Monday = bit 0. */
  tradingDays: number;
  sessionStart: string;
  sessionEnd: string;
}

const blank: Draft = {
  name: "",
  kind: "real",
  currency: "USD",
  capital: null,
  riskPct: 1,
  maxDailyLossR: null,
  maxTradesDay: null,
  tradingDays: ALL_DAYS,
  sessionStart: "",
  sessionEnd: "",
};

const draftOf = (a: JournalAccount): Draft => ({
  name: a.name,
  kind: a.kind,
  currency: a.currency,
  capital: a.capital,
  riskPct: a.riskPct,
  maxDailyLossR: a.maxDailyLossR,
  maxTradesDay: a.maxTradesDay,
  tradingDays: a.tradingDays ?? ALL_DAYS,
  sessionStart: a.sessionStart ?? "",
  sessionEnd: a.sessionEnd ?? "",
});

/** Creates or edits an account: its capital and planned risk give 1R its meaning. */
export function AccountForm({ account, onDone, onCancel }: { account?: JournalAccount; onDone: () => void; onCancel?: () => void }) {
  const tl = useT();
  const [d, setD] = useState<Draft>(account ? draftOf(account) : blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    if (!d.name.trim()) return setError(tl("Donne un nom au compte."));
    if (!d.capital || d.capital <= 0) return setError(tl("Indique le capital de départ du compte."));
    if (!d.riskPct || d.riskPct <= 0) return setError(tl("Indique ton risque prévu par trade, en % du capital."));
    if (Boolean(d.sessionStart) !== Boolean(d.sessionEnd)) return setError(tl("Indique le début et la fin des horaires, ou aucun des deux."));
    if (!d.tradingDays) return setError(tl("Garde au moins un jour de trading."));
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: d.name.trim(),
        kind: d.kind,
        currency: d.currency,
        capital: d.capital,
        riskPct: d.riskPct,
        maxDailyLossR: d.maxDailyLossR,
        maxTradesDay: d.maxTradesDay,
        tradingDays: d.tradingDays === ALL_DAYS ? null : d.tradingDays,
        sessionStart: d.sessionStart || null,
        sessionEnd: d.sessionEnd || null,
        // A new account takes this device's time zone; an edit keeps its own.
        timeZone: account?.timeZone ?? deviceTimeZone(),
      };
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
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <div>
          <h3 className="text-sm font-semibold">
            {tl("Ton plan pour ce compte")}
            <Help id="plan-du-compte" />
          </h3>
          <p className="text-xs text-muted">{tl("Le journal vérifie ces règles à chaque trade. Laisse vide ce que tu ne veux pas suivre.")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={tl("Perte max du jour (en R)")}
            hint={d.maxDailyLossR && d.riskPct ? tl("Soit {0} du capital : au-delà, plus de trade ce jour-là.", [pct(d.maxDailyLossR * d.riskPct, 2, false)]) : tl("Au-delà, plus de trade ce jour-là.")}
          >
            <NumberInput nullable value={d.maxDailyLossR} onChange={(v) => set({ maxDailyLossR: v })} min={0} step={0.5} placeholder="3" />
          </Field>
          <Field label={tl("Trades max par jour")}>
            <NumberInput nullable value={d.maxTradesDay} onChange={(v) => set({ maxTradesDay: v === null ? null : Math.round(v) })} min={1} step={1} placeholder="3" />
          </Field>
          <Field label={tl("Jours de trading")}>
            <div className="flex gap-1">
              {WEEK_DAYS.map((day, i) => {
                const on = Boolean(d.tradingDays & (1 << i));
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ tradingDays: d.tradingDays ^ (1 << i) })}
                    className={`flex-1 rounded-md border px-1 py-1.5 text-xs ${on ? "border-accent bg-accent/15 text-fg" : "border-line text-muted"}`}
                  >
                    {tl(day)}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={tl("Horaires")} hint={tl("Heure de {0}.", [account?.timeZone ?? deviceTimeZone()])}>
            <div className="flex items-center gap-2">
              <input type="time" value={d.sessionStart} onChange={(e) => set({ sessionStart: e.target.value })} aria-label={tl("Début")} className="min-w-0 flex-1" />
              <span className="text-muted">→</span>
              <input type="time" value={d.sessionEnd} onChange={(e) => set({ sessionEnd: e.target.value })} aria-label={tl("Fin")} className="min-w-0 flex-1" />
            </div>
          </Field>
        </div>
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
        <h1 className="text-xl font-semibold">{tl("Bienvenue dans ton journal")}</h1>
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

  const archive = (a: JournalAccount, archived: boolean) => act(() => api(`/api/journal/accounts/${a.id}`, { method: "PUT", json: accountBody(a, { archived }) }));

  /** The plan in one line: "1 % par trade · 3R max par jour · Lun–Ven · 09:00–17:30". */
  const planLine = (a: JournalAccount) => {
    const parts = [tl("{0} par trade", [pct(a.riskPct, 2, false)])];
    if (a.maxDailyLossR !== null) parts.push(tl("{0} R max de perte par jour", [num(a.maxDailyLossR, 1)]));
    if (a.maxTradesDay !== null) parts.push(tl("{0} trades max par jour", [a.maxTradesDay]));
    if (a.tradingDays !== null) parts.push(WEEK_DAYS.filter((_, i) => a.tradingDays! & (1 << i)).map((x) => tl(x)).join(" "));
    if (a.sessionStart && a.sessionEnd) parts.push(`${a.sessionStart}–${a.sessionEnd} (${a.timeZone})`);
    return parts.join(" · ");
  };

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
              <>
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
                <p className="mt-3 text-xs text-muted">
                  {tl("Plan : {0}", [planLine(a)])}
                </p>
              </>
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
          <PlanLock>{tl("Suivre plusieurs comptes (réel, démo, challenge) fait partie des offres payantes.")}</PlanLock>
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
