"use client";

import { tr } from "@/lib/i18n";

import { formatLocale } from "@/lib/client/format";
import { useT } from "@/lib/client/i18n";
import { useEffect, useState } from "react";
import type { AdminMetrics, Ratio, Signup } from "@/lib/admin-metrics";
import { PACKS, PACK_BY_ID, PLANS, euros, type PackId, type PlanId } from "@/lib/plans";
import { api } from "@/lib/client/api";
import { Alert, Card, Stat } from "./ui";

function share({ n, of }: Ratio) {
  return of ? `${Math.round((n / of) * 100)} %` : "—";
}

function RatioStat({ label, ratio, hint }: { label: string; ratio: Ratio; hint: string }) {
  return <Stat label={label} value={share(ratio)} hint={tr("{0} sur {1} · {2}", [ratio.n, ratio.of, hint])} />;
}

const usd = (n: number) => `${n.toLocaleString(formatLocale(), { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })} $`;

const ANSWERS: Record<string, string> = { very: "Très déçu", somewhat: "Un peu déçu", not: "Pas déçu" };

function hours(h: number | null) {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1).replace(".", ",")} h`;
  return `${Math.round(h / 24)} j`;
}

/** The founder's page: activation, retention, AI cost, product-market fit and demand for the paid offers. */
export function AdminDashboard() {
  const tl = useT();
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminMetrics>("/api/admin").then(setM).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!m) return <p className="text-muted">{tl("Chargement…")}</p>;
  const f = m.funnel;
  const answered = m.pmf.answers.very + m.pmf.answers.somewhat + m.pmf.answers.not;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">{tl("Pilotage")}</h1>
        <p className="text-sm text-muted">{tl("Visible par toi seul. Chiffres à la minute près, mis à jour à chaque visite.")}</p>
      </div>

      <Card title={tl("Activation : les inscrits vont-ils jusqu'au premier backtest ?")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={tl("Inscrits")} value={f.users} hint={tl("{0} ces 7 jours · {1} ces 30 jours", [f.signups7d, f.signups30d])} />
          <RatioStat label={tl("Activés")} ratio={f.activated} hint={tl("au moins un backtest terminé")} />
          <RatioStat label={tl("Activés en 24 h")} ratio={f.activatedWithinDay} hint={tl("parmi les inscrits de plus d'un jour")} />
          <Stat label={tl("Délai jusqu'au 1er backtest")} value={hours(f.medianHoursToValue)} hint={tl("médiane des activés")} />
        </div>
      </Card>

      <Signups signups={m.signups} total={f.users} />

      <Card title={tl("Rétention : les activés reviennent-ils ?")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RatioStat label={tl("Revenus après 7 jours")} ratio={f.back7} hint={tl("activés inscrits depuis 7 j ou plus")} />
          <RatioStat label={tl("Revenus après 30 jours")} ratio={f.back30} hint={tl("activés inscrits depuis 30 j ou plus")} />
          <Stat label={tl("Proches de la limite")} value={m.quotas.near} hint={tl("80 % du quota du mois ou plus")} />
          <Stat label={tl("À la limite")} value={m.quotas.at} hint={tl("quota du mois épuisé")} />
        </div>
        {m.cohorts.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="num w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="font-normal">{tl("Semaine d'inscription")}</th>
                  <th className="text-right font-normal">{tl("Inscrits")}</th>
                  <th className="text-right font-normal">{tl("Activés")}</th>
                  <th className="text-right font-normal">{tl("Revenus à 7 j")}</th>
                  <th className="text-right font-normal">{tl("Revenus à 30 j")}</th>
                </tr>
              </thead>
              <tbody>
                {m.cohorts.map((c) => (
                  <tr key={c.week} className="border-t border-line/50">
                    <td className="py-1.5">{new Date(c.week).toLocaleDateString(formatLocale(), { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="text-right">{c.signups}</td>
                    <td className="text-right">{c.signups ? `${Math.round((c.activated / c.signups) * 100)} %` : "—"}</td>
                    <td className="text-right">{c.back7.of ? share(c.back7) : tl("trop tôt")}</td>
                    <td className="text-right">{c.back30.of ? share(c.back30) : tl("trop tôt")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{tl("Une courbe qui se stabilise d'une semaine à l'autre est le signe d'un noyau d'utilisateurs fidèles.")}</p>
          </div>
        )}
      </Card>

      <Card title={tl("Coût de l'IA ce mois-ci")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label={tl("Traductions")} value={m.ai.calls} hint={tl("{0} mesurées", [m.ai.measured])} />
          <Stat label={tl("Coût estimé")} value={usd(m.ai.costUsd)} hint={tl("prix catalogue Anthropic")} />
          <Stat label={tl("Par traduction")} value={m.ai.perCallUsd === null ? "—" : usd(m.ai.perCallUsd)} hint={tl("moyenne des mesurées")} />
        </div>
        {m.ai.topUsers.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-line/50 text-sm">
            {m.ai.topUsers.map((u) => (
              <li key={u.email} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{u.email}</span>
                <span className="num text-muted">{tl("{0} trad.", [u.calls])}</span>
                <span className="num w-20 text-right">{usd(u.costUsd)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{tl("Les traductions faites avant la mise en place de la mesure comptent dans le total mais pas dans le coût.")}</p>
      </Card>

      <Card title={tl("Adéquation produit-marché")}>
        <p className="text-sm">
          {tl("« Comment te sentirais-tu si tu ne pouvais plus utiliser Backtest Lab ? » ·")}{" "}
          <span className="font-semibold">{answered ? tl("{0} % de « très déçu »", [Math.round((m.pmf.answers.very / answered) * 100)]) : tl("pas encore de réponse")}</span>
          {answered > 0 && <span className="text-muted">{tl(" sur {0} réponse{1}", [answered, answered > 1 ? "s" : ""])}</span>}
        </p>
        <p className="mt-1 text-xs text-muted">{tl("Repère : à partir de 40 % de « très déçu », le produit a probablement trouvé son public. Posée après le 3e backtest.")}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label={tl("Très déçu")} value={m.pmf.answers.very} />
          <Stat label={tl("Un peu déçu")} value={m.pmf.answers.somewhat} />
          <Stat label={tl("Pas déçu")} value={m.pmf.answers.not} />
        </div>
        {m.pmf.comments.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {m.pmf.comments.map((c, i) => (
              <li key={i} className="rounded-md border border-line px-3 py-2">
                <div className="text-[11px] text-muted">
                  {tl(ANSWERS[c.answer] ?? c.answer)} · {new Date(c.createdAt).toLocaleDateString(formatLocale())}
                </div>
                {c.comment}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={tl("Intérêt pour les offres payantes")}>
        {m.interest.length === 0 ? (
          <p className="text-sm text-muted">{tl("Personne n'a encore cliqué sur « Je veux cette offre » dans la page Tarifs.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/50 text-sm">
            {m.interest.map((i) => (
              <li key={`${i.plan}-${i.billing}`} className="flex justify-between py-1.5">
                <span>
                  {i.plan.startsWith("pack:")
                    ? tl("Recharge {0}", [tl(PACK_BY_ID[i.plan.slice(5) as PackId]?.label ?? i.plan)])
                    : `${tl(PLANS[i.plan as PlanId]?.label ?? i.plan)} · ${i.billing === "year" ? tl("à l'année") : tl("au mois")}`}
                </span>
                <span className="num font-semibold">{i.n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{tl("Un clic ne vaut pas un paiement, mais c'est le signal qui dit quand ouvrir le paiement en ligne.")}</p>
      </Card>

      <Card title={tl("Paires demandées")}>
        {m.marketRequests.length === 0 ? (
          <p className="text-sm text-muted">{tl("Personne n'a encore demandé de paire depuis le choix du marché.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/50 text-sm">
            {m.marketRequests.map((r) => (
              <li key={r.market} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{r.market}</span>
                <span className="num font-semibold">{r.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <GrantCredits />
      <GivePlan />
    </div>
  );
}

const day = (t: number) => new Date(t).toLocaleDateString(formatLocale(), { day: "numeric", month: "short", year: "numeric" });

/** Who signed up, newest first: what they pay for, how much they backtested, when they were last seen. */
function Signups({ signups, total }: { signups: Signup[]; total: number }) {
  const tl = useT();
  return (
    <Card title={tl("Liste des inscrits")}>
      {signups.length === 0 ? (
        <p className="text-sm text-muted">{tl("Personne ne s'est encore inscrit.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="text-left">
                <th className="font-normal">{tl("E-mail")}</th>
                <th className="whitespace-nowrap font-normal">{tl("Inscrit le")}</th>
                <th className="font-normal">{tl("Offre")}</th>
                <th className="text-right font-normal">{tl("Backtests")}</th>
                <th className="whitespace-nowrap text-right font-normal">{tl("Dernière activité")}</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.email} className="border-t border-line/50 align-top">
                  <td className="max-w-[14rem] py-1.5 pr-3">
                    <div className="truncate">{s.email}</div>
                    {!s.emailVerified && <div className="text-[11px] text-muted">{tl("e-mail non vérifié")}</div>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{day(s.createdAt)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{tl(PLANS[s.plan]?.label ?? s.plan)}</td>
                  <td className="py-1.5 text-right">{s.backtests}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right">{s.lastActivity === null ? "—" : day(s.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > signups.length && <p className="mt-2 text-xs text-muted">{tl("Les {0} inscriptions les plus récentes sur {1}.", [signups.length, total])}</p>}
        </div>
      )}
    </Card>
  );
}

/** Gives an account an offer by hand: a tester, a partner, a customer who paid another way. */
function GivePlan() {
  const tl = useT();
  const [account, setAccount] = useState("");
  const [plan, setPlan] = useState<PlanId>("pro");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ email: string; label: string }>("/api/admin/plan", { json: { account, plan } });
      setResult({ ok: true, text: tl("Offre {0:t} appliquée au compte {1}.", [r.label, r.email]) });
      setAccount("");
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={tl("Offrir une offre")}>
      <form onSubmit={give} className="flex flex-col gap-2 text-sm">
        <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={tl("E-mail ou identifiant du compte")} required />
        <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <option key={id} value={id}>
              {tl(PLANS[id].label)}
            </option>
          ))}
        </select>
        <button disabled={busy} className="self-start rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">
          {tl("Appliquer")}
        </button>
        {result && <p className={result.ok ? "text-up" : "text-down"}>{result.text}</p>}
      </form>
      <p className="mt-2 text-xs text-muted">{tl("Pour un testeur, un partenaire ou un client qui a payé autrement. Découverte retire l'offre. Prend effet tout de suite.")}</p>
    </Card>
  );
}

/** Adds a recharge to an account by hand, until online payment is open. */
function GrantCredits() {
  const tl = useT();
  const [account, setAccount] = useState("");
  const [pack, setPack] = useState<PackId>("combo");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ email: string; label: string }>("/api/admin/credits", { json: { account, pack } });
      setResult({ ok: true, text: tl("{0} ajoutés au compte {1}.", [r.label, r.email]) });
      setAccount("");
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={tl("Créditer une recharge")}>
      <form onSubmit={grant} className="flex flex-col gap-2 text-sm">
        <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={tl("E-mail ou identifiant du compte")} required />
        <select value={pack} onChange={(e) => setPack(e.target.value as PackId)}>
          {PACKS.map((p) => (
            <option key={p.id} value={p.id}>
              {tl(p.label)} ({euros(p.price)})
            </option>
          ))}
        </select>
        <button disabled={busy} className="self-start rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">
          {tl("Ajouter")}</button>
        {result && <p className={result.ok ? "text-up" : "text-down"}>{result.text}</p>}
      </form>
      <p className="mt-2 text-xs text-muted">{tl("En attendant le paiement en ligne : après un paiement par virement ou pour dépanner un client.")}</p>
    </Card>
  );
}
