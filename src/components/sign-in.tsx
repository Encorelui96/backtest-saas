"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { Alert, Button, Card, Field } from "./ui";

/** Only same-site paths, so the sign-in page can't be used to bounce visitors elsewhere. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

type Mode = "signin" | "signup";

/** better-auth error codes in plain French. */
function message(error: { code?: string; status?: number; message?: string }, mode: Mode) {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe incorrect.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Un compte existe déjà avec cet e-mail : connecte-toi.";
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit faire au moins 8 caractères.";
    case "PASSWORD_TOO_LONG":
      return "Le mot de passe est trop long (128 caractères maximum).";
    case "INVALID_EMAIL":
      return "Adresse e-mail invalide.";
  }
  if (error.status === 429) return "Trop d'essais : réessaie dans une minute.";
  return mode === "signin" ? "Connexion impossible. Vérifie ton e-mail et ton mot de passe." : "Création du compte impossible. Réessaie.";
}

export function SignIn() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Le lien a expiré ou a déjà servi." : null);
  const [google, setGoogle] = useState(false);
  const [emailLinks, setEmailLinks] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    api<{ googleEnabled: boolean; emailLinksEnabled: boolean }>("/api/me")
      .then((m) => {
        setGoogle(m.googleEnabled);
        setEmailLinks(m.emailLinksEnabled);
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const address = email.trim().toLowerCase();
    const { error } =
      mode === "signin"
        ? await authClient.signIn.email({ email: address, password })
        : await authClient.signUp.email({ email: address, password, name: address.split("@")[0] });
    if (error) {
      setBusy(false);
      setError(message(error, mode));
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next, errorCallbackURL: "/connexion?error=lien" });
    setBusy(false);
    if (error) setError("Envoi impossible. Vérifie l'adresse e-mail.");
    else setLinkSent(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 pt-4 sm:pt-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold">{mode === "signin" ? "Connexion" : "Créer un compte"}</h1>
        <p className="mt-1 text-sm text-muted">{mode === "signin" ? "Content de te revoir." : "Gratuit, sans carte bancaire : 5 backtests par mois offerts."}</p>
      </div>
      <Card>
        <div className="mb-4 grid grid-cols-2 rounded-lg border border-line p-0.5 text-sm" role="tablist">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-md py-1.5 ${mode === m ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
            >
              {m === "signin" ? "Se connecter" : "Créer un compte"}
            </button>
          ))}
        </div>

        {linkSent ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">Vérifie ta boîte mail.</p>
            <p className="text-muted">
              Un lien de connexion vient d&apos;être envoyé à <strong className="text-fg">{email}</strong>. Il est valable 10 minutes.
            </p>
            <button onClick={() => setLinkSent(false)} className="self-start text-xs text-accent hover:underline">
              Revenir
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Adresse e-mail">
              <input type="email" inputMode="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.fr" />
            </Field>
            <Field label="Mot de passe" hint={mode === "signup" ? "8 caractères minimum." : undefined}>
              <div className="flex gap-1.5">
                <input
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="shrink-0 rounded-md border border-line px-2 text-xs text-muted hover:text-fg"
                  aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {show ? "Masquer" : "Afficher"}
                </button>
              </div>
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" disabled={busy} className="py-2">
              {busy ? "Un instant…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </Button>
            {mode === "signin" && (
              <p className="text-[11px] text-muted">
                Mot de passe oublié, ou compte créé avec le lien par e-mail ? {emailLinks ? "Reçois un lien de connexion ci-dessous, puis" : "Contacte-nous pour récupérer ton accès, puis"} choisis
                un mot de passe dans « Mon compte ».
              </p>
            )}
            {(google || (emailLinks && mode === "signin")) && <div className="text-center text-xs text-muted">ou</div>}
            {emailLinks && mode === "signin" && (
              <Button type="button" variant="ghost" disabled={busy || !email} onClick={sendLink}>
                Recevoir un lien par e-mail
              </Button>
            )}
            {google && (
              <Button type="button" variant="ghost" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}>
                Continuer avec Google
              </Button>
            )}
          </form>
        )}
      </Card>
      <p className="text-center text-[11px] text-muted">
        En créant un compte, tu acceptes les{" "}
        <Link href="/conditions" className="underline hover:text-fg">
          conditions d&apos;utilisation
        </Link>{" "}
        et la{" "}
        <Link href="/confidentialite" className="underline hover:text-fg">
          politique de confidentialité
        </Link>
        . Backtest Lab est un outil de simulation : aucun conseil en investissement.
      </p>
    </div>
  );
}
