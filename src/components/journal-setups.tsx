"use client";

import { useEffect, useState } from "react";
import { Link, useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { pct, r } from "@/lib/client/format";
import { closedResult, summarize, type JournalSetup } from "@/lib/journal";
import { Tip } from "./learn";
import { Alert, Button, Card, Field } from "./ui";
import type { JournalData } from "./journal-shared";

interface Draft {
  name: string;
  description: string;
  strategyId: string;
}

/** Creates or edits a setup, optionally tied to one of the user's strategies. */
function SetupForm({ setup, strategies, onDone, onCancel }: { setup?: JournalSetup; strategies: { id: string; name: string }[]; onDone: () => void; onCancel: () => void }) {
  const tl = useT();
  const [d, setD] = useState<Draft>({ name: setup?.name ?? "", description: setup?.description ?? "", strategyId: setup?.strategyId ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!d.name.trim()) return setError(tl("Donne un nom à la configuration."));
    setBusy(true);
    setError(null);
    try {
      const body = { name: d.name.trim(), description: d.description.trim() || null, strategyId: d.strategyId || null };
      await api(setup ? `/api/journal/setups/${setup.id}` : "/api/journal/setups", { method: setup ? "PUT" : "POST", json: body });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label={tl("Nom")} term="configuration">
        <input value={d.name} maxLength={60} placeholder={tl("Rebond sur la moyenne 20 en tendance")} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label={tl("Description : conditions, déclencheur, stop et sortie")}>
        <textarea
          rows={4}
          maxLength={1000}
          value={d.description}
          placeholder={tl("Tendance haussière en 4h. Entrée quand une bougie 1h clôture au-dessus de la moyenne 20 après l'avoir touchée. Stop sous le dernier creux, objectif à 2R.")}
          onChange={(e) => setD({ ...d, description: e.target.value })}
        />
      </Field>
      <Field label={tl("Stratégie testée dans Backtest Lab (facultatif)")} hint={tl("Pour comparer plus tard tes résultats réels à son backtest.")}>
        <select value={d.strategyId} onChange={(e) => setD({ ...d, strategyId: e.target.value })}>
          <option value="">{tl("Aucune")}</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy}>
          {setup ? tl("Enregistrer") : tl("Créer la configuration")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {tl("Annuler")}
        </Button>
      </div>
    </div>
  );
}

/** The trader's setups, each with its own basic results so the weak ones show. */
export function JournalSetups({ data, onChanged }: { data: JournalData; onChanged: () => void }) {
  const tl = useT();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const currency = new Map(data.accounts.map((a) => [a.id, a.currency]));

  useEffect(() => {
    api<{ id: string; name: string }[]>("/api/strategies").then(setStrategies, () => {});
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = (s: JournalSetup) => {
    if (confirm(tl("Supprimer la configuration « {0} » ? Si des trades la suivent, elle est archivée à la place.", [s.name])))
      act(() => api(`/api/journal/setups/${s.id}`, { method: "DELETE" }));
  };

  const archive = (s: JournalSetup, archived: boolean) =>
    act(() => api(`/api/journal/setups/${s.id}`, { method: "PUT", json: { name: s.name, description: s.description, strategyId: s.strategyId, archived } }));

  const statsOf = (setupId: string | null, offPlan: boolean) => {
    const trades = data.trades.filter((t) => (setupId ? t.setupId === setupId : !t.setupId && t.offPlan === offPlan));
    return summarize(trades.map((t) => closedResult(t, currency.get(t.accountId) ?? "USD")).filter((x) => x !== null));
  };

  const numbers = (setupId: string | null, offPlan = false) => {
    const s = statsOf(setupId, offPlan);
    if (!s.closed) return <p className="text-xs text-muted">{tl("Aucun trade clôturé pour l'instant.")}</p>;
    return (
      <p className="num text-xs text-muted">
        {tl("{0} trades · {1} gagnants · espérance {2} · total {3}", [s.closed, pct((s.winRate ?? 0) * 100, 0, false), r(s.expectancy), r(s.totalR, 1)])}
      </p>
    );
  };

  const offPlanCount = data.trades.filter((t) => !t.setupId && t.offPlan).length;

  return (
    <div className="flex flex-col gap-3">
      <Tip title={tl("Une configuration, c'est quoi ?")}>
        {tl("Une situation que tu sais reconnaître et que tu trades toujours de la même façon. Chaque trade s'y rattache : le journal montre alors laquelle gagne vraiment, et ce que te coûtent les trades hors plan.")}
      </Tip>
      {error && <Alert tone="error">{error}</Alert>}
      {data.setups.map((s) =>
        editing === s.id ? (
          <Card key={s.id} title={tl("Modifier la configuration")}>
            <SetupForm
              setup={s}
              strategies={strategies}
              onDone={() => {
                setEditing(null);
                onChanged();
              }}
              onCancel={() => setEditing(null)}
            />
          </Card>
        ) : (
          <Card
            key={s.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {s.name}
                {s.archived && <span className="text-[11px] font-normal text-muted">{tl("archivée")}</span>}
              </span>
            }
            actions={
              <span className="flex gap-3 text-xs text-muted">
                <button onClick={() => setEditing(s.id)} className="hover:text-fg">
                  {tl("Modifier")}
                </button>
                <button onClick={() => archive(s, !s.archived)} className="hover:text-fg">
                  {s.archived ? tl("Réactiver") : tl("Archiver")}
                </button>
                <button onClick={() => remove(s)} className="hover:text-down">
                  {tl("Supprimer")}
                </button>
              </span>
            }
          >
            <div className="flex flex-col gap-1.5">
              {s.description && <p className="whitespace-pre-line text-sm text-fg/85">{s.description}</p>}
              {s.strategyId && (
                <Link href={`/strategies/${s.strategyId}`} className="text-xs text-accent hover:underline">
                  {tl("Stratégie liée : {0} →", [strategies.find((x) => x.id === s.strategyId)?.name ?? tl("ouvrir")])}
                </Link>
              )}
              {numbers(s.id)}
            </div>
          </Card>
        ),
      )}
      {offPlanCount > 0 && (
        <Card title={tl("Hors plan")}>
          {numbers(null, true)}
        </Card>
      )}
      {editing === "new" ? (
        <Card title={tl("Nouvelle configuration")}>
          <SetupForm
            strategies={strategies}
            onDone={() => {
              setEditing(null);
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        </Card>
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setEditing("new")}>
            {tl("+ Ajouter une configuration")}
          </Button>
        </div>
      )}
    </div>
  );
}
