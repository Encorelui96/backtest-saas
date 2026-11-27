"use client";

import { useState } from "react";
import { useT } from "@/lib/client/i18n";
import { date, num, pct, price, r, tone } from "@/lib/client/format";
import { ERROR_LABELS, EXIT_REASON_LABELS, PLAN_CHECK_LABELS, balance, closedResult, discipline, riskAmount, summarize, type JournalTrade } from "@/lib/journal";
import { filterTrades, matchesSetup, statTrades, type TradeFilter } from "@/lib/journal-stats";
import { Help, Tip } from "./learn";
import { Button, Card, Stat } from "./ui";
import { CaptureLink, SideBadge, amount, type JournalData } from "./journal-shared";
import { FilterBar } from "./journal-filters";

const PAGE = 30;

/** The summary in R, the open trades to close and the closed ones, newest first, within the filters. */
export function JournalTrades({
  data,
  filter,
  onFilter,
  onNew,
  onClose,
  onEdit,
}: {
  data: JournalData;
  filter: TradeFilter;
  onFilter: (f: TradeFilter) => void;
  onNew: () => void;
  onClose: (t: JournalTrade) => void;
  onEdit: (t: JournalTrade) => void;
}) {
  const tl = useT();
  const [shown, setShown] = useState(PAGE);
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const setups = new Map(data.setups.map((s) => [s.id, s.name]));
  // Open trades follow the account and the setup; the period and the plan only make sense once a trade is closed.
  const open = data.trades.filter((t) => !t.close && (!filter.accountId || t.accountId === filter.accountId) && matchesSetup(t, filter.setupId));
  const kept = new Set(filterTrades(statTrades(data.trades, data.accounts), filter).map((t) => t.id));
  const closed = data.trades.filter((t) => t.close && kept.has(t.id)).sort((a, b) => b.close!.closedAt - a.close!.closedAt);
  const currencyOf = (t: JournalTrade) => accounts.get(t.accountId)?.currency ?? "USD";
  const results = new Map(closed.map((t) => [t.id, closedResult(t, currencyOf(t))!]));
  const s = summarize([...results.values()]);
  const d = discipline(closed.map((t) => ({ planFollowed: t.planFollowed, r: results.get(t.id)!.r, errors: t.errors })));
  const account = filter.accountId ? accounts.get(filter.accountId) : data.accounts.length === 1 ? data.accounts[0] : undefined;
  // The capital counts every closed trade of the account, whatever the other filters.
  const capital = account
    ? balance(
        account.capital,
        data.trades.filter((t) => t.close && t.accountId === account.id).map((t) => closedResult(t, account.currency)!.amount),
      )
    : null;

  const setupName = (t: JournalTrade) => (t.setupId ? (setups.get(t.setupId) ?? "—") : t.offPlan ? tl("Hors plan") : tl("Sans configuration"));

  if (!data.trades.length) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3 text-sm">
          <p>{tl("Aucun trade pour l'instant.")}</p>
          <p className="text-muted">
            {tl("Note ton prochain trade dès l'entrée : le marché, le sens, l'entrée, le stop et la taille suffisent. Tu le clôtureras à la sortie, en une minute.")}
          </p>
          <Button onClick={onNew}>{tl("+ Nouveau trade")}</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar data={data} filter={filter} onChange={onFilter} />
      {!closed.length && !open.length && <p className="text-sm text-muted">{tl("Aucun trade ne correspond à ces filtres.")}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={tl("Trades clôturés")} value={s.closed} term="trades" hint={open.length ? tl("{0} en cours", [open.length]) : undefined} />
        <Stat label={tl("Taux de gagnants")} value={s.winRate === null ? "—" : pct(s.winRate * 100, 0, false)} term="gagnants" />
        <Stat label={tl("Espérance par trade")} value={r(s.expectancy)} className={tone(s.expectancy)} term="gain-moyen" />
        <Stat label={tl("Profit factor")} value={s.profitFactor === null ? "—" : num(s.profitFactor)} term="profit-factor" />
        <Stat label={tl("Résultat total")} value={r(s.totalR, 1)} className={tone(s.totalR)} term="r" hint={s.amount ? amount(s.amount.value, s.amount.currency, true) : undefined} />
        {account && capital !== null ? (
          <Stat label={tl("Capital actuel")} value={amount(capital, account.currency)} hint={pct(((capital - account.capital) / account.capital) * 100)} term="capital" />
        ) : (
          <Stat label={tl("Meilleur / pire trade")} value={s.bestR === null ? "—" : `${r(s.bestR, 1)} / ${r(s.worstR, 1)}`} />
        )}
      </div>
      {s.closed > 0 && s.closed < 30 && (
        <Tip>{tl("Sous 30 trades, ces chiffres bougent encore beaucoup d'un trade à l'autre : continue à tout noter avant de juger ta méthode.")}</Tip>
      )}

      {(d.judged > 0 || d.register.length > 0) && (
        <Card
          title={
            <span>
              {tl("Discipline")}
              <Help id="respect-du-plan" />
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label={tl("Respect du plan")} value={d.rate === null ? "—" : pct(d.rate * 100, 0, false)} hint={tl("{0} trades sur {1}", [d.inPlan, d.judged])} />
            <Stat label={tl("Espérance dans le plan")} value={r(d.inPlanR)} className={tone(d.inPlanR)} hint={tl("ta méthode")} />
            <Stat label={tl("Espérance hors plan")} value={r(d.offPlanR)} className={tone(d.offPlanR)} hint={tl("ta discipline")} />
            <Stat label={tl("Coût des erreurs")} value={r(d.costR, 1)} className={tone(d.costR)} term="registre-des-erreurs" />
          </div>
          {d.register.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-normal">{tl("Erreur")}</th>
                  <th className="py-1 text-right font-normal">{tl("Nombre")}</th>
                  <th className="py-1 text-right font-normal">{tl("Coût")}</th>
                </tr>
              </thead>
              <tbody>
                {d.register.map((x) => (
                  <tr key={x.code} className="border-t border-line/60">
                    <td className="py-1">
                      <span className="font-mono text-xs text-muted">{x.code}</span> {tl(ERROR_LABELS[x.code])}
                    </td>
                    <td className="num py-1 text-right">{x.count}</td>
                    <td className={`num py-1 text-right ${tone(x.costR)}`}>{r(x.costR, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {open.length > 0 && (
        <Card title={tl("En cours ({0})", [open.length])}>
          <ul className="flex flex-col divide-y divide-line/60">
            {open.map((t) => {
              const currency = currencyOf(t);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.market}</span>
                      <SideBadge side={t.side} />
                      <span className="text-xs text-muted">{setupName(t)}</span>
                    </span>
                    <span className="num text-xs text-muted">
                      {date(t.openedAt)} · {tl("entrée {0}, stop {1}", [price(t.entry), price(t.stop)])} · 1R = {amount(riskAmount(t), currency)}
                    </span>
                    {t.checks.length > 0 && <span className="text-xs text-warn">⚠ {t.checks.map((x) => tl(PLAN_CHECK_LABELS[x])).join(" · ")}</span>}
                  </div>
                  <span className="flex gap-2">
                    <Button variant="ghost" onClick={() => onEdit(t)}>
                      {tl("Modifier")}
                    </Button>
                    <Button onClick={() => onClose(t)}>{tl("Clôturer")}</Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {closed.length > 0 && (
        <Card title={tl("Clôturés ({0})", [closed.length])}>
          <ul className="flex flex-col divide-y divide-line/60">
            {closed.slice(0, shown).map((t) => {
              const res = results.get(t.id)!;
              const c = t.close!;
              return (
                <li key={t.id}>
                  <button onClick={() => onEdit(t)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-panel-2/50">
                    <span className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.market}</span>
                        <SideBadge side={t.side} />
                        <span className="text-xs text-muted">{setupName(t)}</span>
                        {t.quality && <span className="rounded border border-line px-1 text-[11px] text-muted">{t.quality}</span>}
                      </span>
                      <span className="truncate text-xs text-muted">
                        {date(c.closedAt, false)} · {tl(EXIT_REASON_LABELS[c.exitReason])}
                        {t.planFollowed === true && <> · <span className="text-up">{tl("plan suivi")}</span></>}
                        {t.planFollowed === false && (
                          <>
                            {" "}
                            · <span className="text-down">{t.errors.length ? tl("hors plan : {0}", [t.errors.map((e) => e.code).join(" ")]) : tl("hors plan")}</span>
                          </>
                        )}
                        {c.comment && <> · {c.comment}</>}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className={`num font-semibold ${tone(res.r)}`}>{r(res.r)}</span>
                      <span className={`num text-xs ${tone(res.amount)}`}>{amount(res.amount, res.currency, true)}</span>
                    </span>
                  </button>
                  {(t.captureUrl || c.captureUrl) && (
                    <span className="flex gap-3 pb-2">
                      <CaptureLink url={t.captureUrl} label={tl("Capture de l'entrée")} />
                      <CaptureLink url={c.captureUrl} label={tl("Capture de la sortie")} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {closed.length > shown && (
            <button onClick={() => setShown(shown + PAGE)} className="mt-3 text-sm text-accent hover:underline">
              {tl("Voir les {0} suivants", [Math.min(PAGE, closed.length - shown)])}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
