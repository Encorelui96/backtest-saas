"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { Alert, Button, Card, Field } from "./ui";

interface Me {
  user: { email: string; name: string } | null;
  hasPassword: boolean;
  usage: {
    plan: { id: string; label: string; backtestsPerMonth: number; aiPerMonth: number; minInterval: string; alerts: number };
    backtests: number;
    ai: number;
    resetsAt: string;
  } | null;
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const share = Math.min(1, used / Math.max(1, max));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="num text-muted">
          {used} / {max}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-panel-2">
        <div className={`h-2 rounded-full ${share >= 1 ? "bg-down" : share > 0.8 ? "bg-warn" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

export function Account() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((m) => {
      if (!m.user) router.replace("/connexion?next=/compte");
      else setMe(m);
    });
  }, [router]);

  if (!me?.user || !me.usage) return <p className="text-muted">Chargement…</p>;
  const u = me.usage;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Mon compte</h1>
      <Card title={`Offre ${u.plan.label}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{me.user.email}</p>
          <Meter label="Backtests ce mois-ci" used={u.backtests} max={u.plan.backtestsPerMonth} />
          <Meter label="Traductions par l'IA ce mois-ci" used={u.ai} max={u.plan.aiPerMonth} />
          <p className="text-xs text-muted">
            Unité de temps minimale : {u.plan.minInterval} · alertes : {u.plan.alerts} · compteurs remis à zéro le {new Date(u.resetsAt).toLocaleDateString("fr-FR")}.
          </p>
          {u.plan.id === "free" && <p className="text-sm">Les offres payantes (scalp en 1 minute, plus de tests, alertes Telegram) arrivent bientôt.</p>}
        </div>
      </Card>
      <PasswordCard hasPassword={me.hasPassword} onSet={() => setMe({ ...me, hasPassword: true })} />
      <Button
        variant="ghost"
        onClick={async () => {
          await authClient.signOut();
          router.replace("/");
          router.refresh();
        }}
      >
        Se déconnecter
      </Button>
    </div>
  );
}

/** Sets a first password (accounts made with the e-mail link have none) or changes the current one. */
function PasswordCard({ hasPassword, onSet }: { hasPassword: boolean; onSet: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (next !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    try {
      if (hasPassword) {
        const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
        if (error) throw new Error(error.code === "INVALID_PASSWORD" ? "Mot de passe actuel incorrect." : "Changement impossible. Réessaie.");
        setDone("Mot de passe changé. Tes autres appareils ont été déconnectés.");
      } else {
        await api("/api/password", { json: { password: next } });
        setDone("Mot de passe enregistré : tu peux maintenant te connecter avec ton e-mail et ce mot de passe.");
        onSet();
      }
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={hasPassword ? "Changer de mot de passe" : "Définir mon mot de passe"}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {!hasPassword && <Alert tone="info">Ton compte n&apos;a pas encore de mot de passe. Choisis-en un pour pouvoir te connecter avec ton e-mail.</Alert>}
        {hasPassword && (
          <Field label="Mot de passe actuel">
            <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirmer">
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {done && <Alert tone="info">{done}</Alert>}
        <Button type="submit" disabled={busy}>
          {busy ? "Un instant…" : hasPassword ? "Changer le mot de passe" : "Enregistrer le mot de passe"}
        </Button>
      </form>
    </Card>
  );
}
