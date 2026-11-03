"use client";

import { useState } from "react";
import { Link } from "@/lib/client/i18n";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";
import { Alert, Button, Card, Field } from "./ui";

/** Where the "Mot de passe oublié" e-mail lands: better-auth adds `token`, or `error` when the link is no longer valid. */
export function ResetPassword() {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(!token || Boolean(params.get("error")));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Les deux mots de passe sont différents.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (!error) setDone(true);
    else if (error.code === "INVALID_TOKEN") setExpired(true);
    else if (error.status === 429) setError("Trop d'essais : réessaie dans une minute.");
    else setError("Changement impossible. Réessaie.");
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 pt-4 sm:pt-8">
      <h1 className="text-center text-xl font-semibold">Nouveau mot de passe</h1>
      <Card>
        {done ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">Mot de passe changé.</p>
            <p className="text-muted">Par sécurité, tu as été déconnecté de tous tes appareils.</p>
            <Link href="/connexion" className="self-start text-accent hover:underline">
              Se connecter
            </Link>
          </div>
        ) : expired ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">Ce lien a expiré ou a déjà servi.</p>
            <p className="text-muted">Redemande un lien depuis la page de connexion, avec « Mot de passe oublié ? ».</p>
            <Link href="/connexion" className="self-start text-accent hover:underline">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
              <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirme le mot de passe">
              <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" disabled={busy} className="py-2">
              {busy ? "Un instant…" : "Enregistrer"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
