"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { Alert, Button, Card, Field } from "./ui";

/** Only same-site paths, so the sign-in page can't be used to bounce visitors elsewhere. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function SignIn() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Le lien a expiré ou a déjà servi. Demande-en un nouveau." : null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api<{ googleEnabled: boolean }>("/api/me").then((m) => setGoogle(m.googleEnabled)).catch(() => {});
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next, errorCallbackURL: "/connexion?error=lien" });
    setBusy(false);
    if (error) setError(error.status === 429 ? "Trop de demandes : réessaie dans une minute." : "Envoi impossible. Vérifie l'adresse e-mail.");
    else setSent(true);
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Connexion</h1>
        <p className="mt-1 text-sm text-muted">Sans mot de passe : on t&apos;envoie un lien par e-mail. Un compte est créé à la première connexion.</p>
      </div>
      <Card>
        {sent ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">Vérifie ta boîte mail.</p>
            <p className="text-muted">
              Un lien de connexion vient d&apos;être envoyé à <strong className="text-fg">{email}</strong>. Il est valable 10 minutes. Pense à regarder dans les indésirables.
            </p>
            <button onClick={() => setSent(false)} className="self-start text-xs text-accent hover:underline">
              Changer d&apos;adresse
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink} className="flex flex-col gap-3">
            <Field label="Adresse e-mail">
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.fr" />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" disabled={busy}>
              {busy ? "Envoi…" : "Recevoir mon lien de connexion"}
            </Button>
            {google && (
              <>
                <div className="text-center text-xs text-muted">ou</div>
                <Button type="button" variant="ghost" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}>
                  Continuer avec Google
                </Button>
              </>
            )}
          </form>
        )}
      </Card>
      <p className="text-center text-[11px] text-muted">En te connectant, tu acceptes que Backtest Lab soit un outil de simulation : aucun conseil en investissement.</p>
    </div>
  );
}
