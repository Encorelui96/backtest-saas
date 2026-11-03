"use client";

import { Link, rich, useLang, useRouter, useT } from "@/lib/client/i18n";
import { date } from "@/lib/client/format";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { Alert, Button, Card, Field } from "./ui";
import { AlertsPanel } from "./alerts-panel";

interface Me {
  user: { id: string; email: string; name: string } | null;
  hasPassword: boolean;
  isAdmin: boolean;
  usage: {
    plan: { id: string; label: string; backtestsPerMonth: number; aiPerMonth: number; minInterval: string; alerts: number };
    backtests: number;
    ai: number;
    resetsAt: string;
    credits: { ai: number; backtest: number };
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
  const tl = useT();
  const router = useRouter();
  const lang = useLang();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((m) => {
      if (!m.user) router.replace("/connexion?next=/compte");
      else setMe(m);
    });
  }, [router]);

  if (!me?.user || !me.usage) return <p className="text-muted">{tl("Chargement…")}</p>;
  const u = me.usage;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{tl("Mon compte")}</h1>
      <Card title={tl("Offre {0}", [u.plan.label])}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {me.user.email}
            {/* Asked for by support, and what ADMIN_USER_IDS lists. */}
            <span className="block text-[11px]">
              {tl("Identifiant du compte : ")}<span className="num select-all">{me.user.id}</span>
            </span>
          </p>
          <Meter label={tl("Backtests ce mois-ci")} used={u.backtests} max={u.plan.backtestsPerMonth} />
          <Meter label={tl("Traductions par l'IA ce mois-ci")} used={u.ai} max={u.plan.aiPerMonth} />
          <p className="text-xs text-muted">
            {tl("Unité de temps minimale : ")}{u.plan.minInterval}{tl(" · alertes : ")}{u.plan.alerts}{tl(" · compteurs remis à zéro le ")}{date(new Date(u.resetsAt).getTime(), false)}.
          </p>
          {(u.credits.ai > 0 || u.credits.backtest > 0) && (
            <p className="text-sm">
              {rich(tl("Crédits de recharge : {0} backtest{1} et {2} traduction{3}, utilisés une fois le quota du mois épuisé."), [
                <span key="b" className="num font-semibold">{u.credits.backtest}</span>,
                u.credits.backtest > 1 ? "s" : "",
                <span key="a" className="num font-semibold">{u.credits.ai}</span>,
                u.credits.ai > 1 ? "s" : "",
              ])}</p>
          )}
          {u.plan.id === "free" ? (
            <p className="text-sm">
              {tl("Plus de tests, le scalp dès 1 minute :")}{" "}
              <Link href="/tarifs" className="text-accent hover:underline">
                {tl("voir les offres Trader et Pro →")}</Link>
            </p>
          ) : (
            (u.backtests >= u.plan.backtestsPerMonth * 0.8 || u.ai >= u.plan.aiPerMonth * 0.8) && (
              <p className="text-sm">
                {tl("Bientôt au bout de ton quota ?")}{" "}
                <Link href="/tarifs#recharges" className="text-accent hover:underline">
                  {tl("Ajouter une recharge →")}</Link>
              </p>
            )
          )}
        </div>
      </Card>
      {me.isAdmin && (
        <Link href="/admin" className="rounded-lg border border-line bg-panel px-4 py-3 text-sm hover:border-accent">
          {tl("Pilotage : activation, rétention, coût de l'IA →")}</Link>
      )}
      <AlertsPanel />
      <PasswordCard hasPassword={me.hasPassword} onSet={() => setMe({ ...me, hasPassword: true })} />
      <DataCard hasPassword={me.hasPassword} />
      <Button
        variant="ghost"
        onClick={async () => {
          await authClient.signOut();
          window.location.assign(lang === "en" ? "/en" : "/");
        }}
      >
        {tl("Se déconnecter")}</Button>
    </div>
  );
}

/** Personal data rights: a copy of everything stored, and deleting the account for good. */
function DataCard({ hasPassword }: { hasPassword: boolean }) {
  const tl = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await authClient.deleteUser(hasPassword ? { password } : {});
      if (error) {
        throw new Error(
          error.code === "INVALID_PASSWORD"
            ? tl("Mot de passe incorrect.")
            : error.code === "SESSION_EXPIRED"
              ? tl("Par sécurité, déconnecte-toi puis reconnecte-toi avant de supprimer ton compte.")
              : tl("Suppression impossible. Réessaie."),
        );
      }
      // A full reload: the cached session would otherwise show the dashboard, whose calls bounce to the sign-in page.
      window.location.assign(lang === "en" ? "/en" : "/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card title={tl("Mes données")}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          {tl("Tu peux récupérer à tout moment une copie de ce que Backtest Lab garde sur toi : compte, stratégies, résultats des backtests, connexions. Le détail est dans la")}{" "}
          <Link href="/confidentialite" className="underline hover:text-fg">
            {tl("politique de confidentialité")}</Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/me/export" download className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-panel-2">
            {tl("Télécharger mes données")}</a>
          {!open && (
            <Button variant="danger" onClick={() => setOpen(true)}>
              {tl("Supprimer mon compte")}</Button>
          )}
        </div>
        {open && (
          <form onSubmit={remove} className="flex flex-col gap-3 rounded-md border border-down/40 p-3">
            <p>
              {tl("Ton compte, tes stratégies et tous tes backtests seront ")}<strong>{tl("effacés définitivement")}</strong>{tl(". Cette action ne peut pas être annulée.")}</p>
            {hasPassword && (
              <Field label={tl("Ton mot de passe")}>
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            <Field label={tl("Écris SUPPRIMER pour confirmer")}>
              <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={busy || word.trim().toUpperCase() !== "SUPPRIMER" || (hasPassword && !password)}>
                {busy ? "Suppression…" : tl("Supprimer définitivement")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {tl("Annuler")}</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Sets a first password (accounts made with the e-mail link have none) or changes the current one. */
function PasswordCard({ hasPassword, onSet }: { hasPassword: boolean; onSet: () => void }) {
  const tl = useT();
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
    if (next !== confirm) return setError(tl("Les deux mots de passe ne sont pas identiques."));
    setBusy(true);
    try {
      if (hasPassword) {
        const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
        if (error) throw new Error(error.code === "INVALID_PASSWORD" ? tl("Mot de passe actuel incorrect.") : tl("Changement impossible. Réessaie."));
        setDone(tl("Mot de passe changé. Tes autres appareils ont été déconnectés."));
      } else {
        await api("/api/password", { json: { password: next } });
        setDone(tl("Mot de passe enregistré : tu peux maintenant te connecter avec ton e-mail et ce mot de passe."));
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
    <Card title={hasPassword ? tl("Changer de mot de passe") : tl("Définir mon mot de passe")}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {!hasPassword && <Alert tone="info">{tl("Ton compte n'a pas encore de mot de passe. Choisis-en un pour pouvoir te connecter avec ton e-mail.")}</Alert>}
        {hasPassword && (
          <Field label={tl("Mot de passe actuel")}>
            <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tl("Nouveau mot de passe")} hint={tl("8 caractères minimum.")}>
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label={tl("Confirmer")}>
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {done && <Alert tone="info">{done}</Alert>}
        <Button type="submit" disabled={busy}>
          {busy ? tl("Un instant…") : hasPassword ? tl("Changer le mot de passe") : tl("Enregistrer le mot de passe")}
        </Button>
      </form>
    </Card>
  );
}
