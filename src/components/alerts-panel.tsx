"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { date } from "@/lib/client/format";
import { Alert, Button, Card } from "./ui";

interface AlertRow {
  id: string;
  strategyId: string;
  name: string;
  symbol: string;
  interval: string;
  enabled: boolean;
  lastSignalAt: number | null;
  lastError: string | null;
}

interface State {
  telegram: { enabled: boolean; bot: string | null; linked: boolean; username: string | null };
  limit: number;
  minInterval: string;
  plan: string;
  alerts: AlertRow[];
}

/** Telegram link and signal alerts, on the account page. */
export function AlertsPanel() {
  const [state, setState] = useState<State | null>(null);
  const [strategies, setStrategies] = useState<{ id: string; name: string; strategy: { symbol: string; interval: string } }[]>([]);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<State>("/api/alerts").then(setState, (e: Error) => setError(e.message)), []);

  useEffect(() => {
    load();
    api<typeof strategies>("/api/strategies").then(setStrategies, () => {});
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const link = () =>
    act(async () => {
      const { url } = await api<{ url: string }>("/api/telegram/link", { method: "POST", json: {} });
      window.open(url, "_blank", "noopener");
    });

  if (!state) return null;
  const t = state.telegram;
  const used = new Set(state.alerts.map((a) => a.strategyId));
  const available = strategies.filter((s) => !used.has(s.id));

  return (
    <Card title="Alertes Telegram">
      <div className="flex flex-col gap-3 text-sm">
        {!t.enabled ? (
          <p className="text-muted">Les alertes ne sont pas encore activées sur le site.</p>
        ) : t.linked ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              ✅ Telegram relié{t.username ? ` (@${t.username})` : ""}
            </span>
            <button disabled={busy} onClick={() => act(() => api("/api/telegram/link", { method: "DELETE" }))} className="text-xs text-muted hover:text-down">
              Délier
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted">
              Reçois un message dès qu&apos;une de tes stratégies donne un signal, à la clôture de la bougie. Ouvre le lien puis appuie sur <b>Démarrer</b> dans Telegram.
            </p>
            <Button onClick={link} disabled={busy} className="self-start">
              Relier Telegram{t.bot ? ` (@${t.bot})` : ""}
            </Button>
            <button onClick={() => load()} className="self-start text-xs text-accent hover:underline">
              C&apos;est fait, actualiser
            </button>
          </div>
        )}

        {state.limit === 0 ? (
          <p>
            L&apos;offre {state.plan} n&apos;inclut pas d&apos;alertes.{" "}
            <Link href="/tarifs" className="text-accent hover:underline">
              Voir les offres Trader et Pro →
            </Link>
          </p>
        ) : (
          <>
            {state.alerts.length > 0 && (
              <ul className="flex flex-col divide-y divide-line/50">
                {state.alerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.name}</div>
                      <div className="text-[11px] text-muted">
                        {a.symbol} · {a.interval} · {a.lastSignalAt ? `dernier signal le ${date(a.lastSignalAt)}` : "aucun signal pour l'instant"}
                      </div>
                      {a.lastError && <div className="text-[11px] text-warn">Dernière vérification en erreur : {a.lastError}</div>}
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => act(() => api(`/api/alerts/${a.id}`, { method: "PATCH", json: { enabled: !a.enabled } }))}
                      className={`rounded px-2 py-0.5 text-xs ${a.enabled ? "bg-accent text-white" : "border border-line text-muted"}`}
                    >
                      {a.enabled ? "Active" : "En pause"}
                    </button>
                    <button disabled={busy} onClick={() => act(() => api(`/api/alerts/${a.id}`, { method: "DELETE" }))} className="text-xs text-muted hover:text-down" title="Supprimer">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {state.alerts.length < state.limit &&
              (available.length ? (
                <div className="flex flex-wrap gap-2">
                  <select value={choice} onChange={(e) => setChoice(e.target.value)} className="min-w-0 flex-1">
                    <option value="">Choisir une stratégie…</option>
                    {available.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.strategy.symbol} {s.strategy.interval}
                      </option>
                    ))}
                  </select>
                  <Button disabled={!choice || busy} onClick={() => act(() => api("/api/alerts", { json: { strategyId: choice } }).then(() => setChoice("")))}>
                    Ajouter l&apos;alerte
                  </Button>
                </div>
              ) : (
                <p className="text-muted">Enregistre une stratégie pour pouvoir créer une alerte.</p>
              ))}
            <p className="text-[11px] text-muted">
              {state.alerts.length} / {state.limit} alerte{state.limit > 1 ? "s" : ""} · unité minimale {state.minInterval}. Les signaux sont des simulations calculées par tes règles, pas des
              conseils en investissement.
              {t.enabled && !t.linked && state.alerts.length > 0 && " Relie Telegram pour les recevoir."}
            </p>
          </>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Card>
  );
}
