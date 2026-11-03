"use client";

import { formatLocale } from "@/lib/client/format";
import { useT } from "@/lib/client/i18n";
import { useEffect, useState } from "react";
import type { AdminMetrics, Ratio } from "@/lib/admin-metrics";
import { PACKS, PACK_BY_ID, PLANS, type PackId, type PlanId } from "@/lib/plans";
import { api } from "@/lib/client/api";
import { Alert, Card, Stat } from "./ui";

function share({ n, of }: Ratio) {
  return of ? `${Math.round((n / of) * 100)} %` : "—";
}

function RatioStat({ label, ratio, hint }: { label: string; ratio: Ratio; hint: string }) {
  return <Stat label={label} value={share(ratio)} hint={`${ratio.n} sur ${ratio.of} · ${hint}`} />;
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
                  {ANSWERS[c.answer] ?? c.answer} · {new Date(c.createdAt).toLocaleDateString(formatLocale())}
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
                    ? tl("Recharge {0}", [PACK_BY_ID[i.plan.slice(5) as PackId]?.label ?? i.plan])
                    : `${PLANS[i.plan as PlanId]?.label ?? i.plan} · ${i.billing === "year" ? tl("à l'année") : tl("au mois")}`}
                </span>
                <span className="num font-semibold">{i.n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{tl("Un clic ne vaut pas un paiement, mais c'est le signal qui dit quand ouvrir le paiement en ligne.")}</p>
      </Card>

      <GrantCredits />
    </div>
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
              {p.label} ({p.price} €)
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
