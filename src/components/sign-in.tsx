"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { EDITOR } from "@/lib/legal";
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
    case "EMAIL_NOT_VERIFIED":
      return "Confirme d'abord ton adresse : un e-mail de confirmation vient de t'être renvoyé.";
  }
  if (error.status === 429) return "Trop d'essais : réessaie dans une minute.";
  return mode === "signin" ? "Connexion impossible. Vérifie ton e-mail et ton mot de passe." : "Création du compte impossible. Réessaie.";
}

/** The `error` better-auth adds to the page address when a link or a Google sign-in fails. */
function linkError(code: string | null) {
  if (!code) return null;
  if (code === "account_not_linked") return "Un compte existe déjà avec cette adresse, créé avec un mot de passe : connecte-toi avec ton mot de passe.";
  return "Le lien a expiré ou a déjà servi.";
}

/** What was just sent by e-mail, shown instead of the form. */
type Sent = "link" | "verify" | "reset";

const SENT: Record<Sent, { title: string; text: string }> = {
  link: { title: "Vérifie ta boîte mail.", text: "Un lien de connexion vient d'être envoyé à {email}. Il est valable 10 minutes." },
  verify: { title: "Confirme ton adresse.", text: "Un e-mail vient d'être envoyé à {email}. Clique sur le lien qu'il contient pour activer ton compte (valable 1 heure)." },
  reset: { title: "Vérifie ta boîte mail.", text: "Si un compte existe pour {email}, un lien pour choisir un nouveau mot de passe vient d'y être envoyé. Il est valable 1 heure." },
};

export function SignIn() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError(params.get("error")));
  const [google, setGoogle] = useState(false);
  const [emailLinks, setEmailLinks] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

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
        : await authClient.signUp.email({ email: address, password, name: address.split("@")[0], callbackURL: next });
    if (error) {
      setBusy(false);
      setError(message(error, mode));
      return;
    }
    // With e-mail sending on, a new account opens only once its address is confirmed.
    if (mode === "signup" && emailLinks) {
      setBusy(false);
      setSent("verify");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next, errorCallbackURL: "/connexion" });
    setBusy(false);
    if (error) setError(error.status === 429 ? "Trop d'essais : réessaie dans une minute." : "Envoi impossible. Vérifie l'adresse e-mail.");
    else setSent("link");
  };

  const sendReset = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: "/connexion/nouveau-mot-de-passe" });
    setBusy(false);
    if (error) setError(error.status === 429 ? "Trop d'essais : réessaie dans une minute." : "Envoi impossible. Vérifie l'adresse e-mail.");
    else setSent("reset");
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

        {sent ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">{SENT[sent].title}</p>
            <p className="text-muted">
              {SENT[sent].text.split("{email}")[0]}
              <strong className="text-fg">{email}</strong>
              {SENT[sent].text.split("{email}")[1]}
            </p>
            <button onClick={() => setSent(null)} className="self-start text-xs text-accent hover:underline">
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
            {mode === "signin" &&
              (emailLinks ? (
                <button type="button" disabled={busy || !email} onClick={sendReset} className="self-start text-xs text-accent hover:underline disabled:opacity-50" title={email ? undefined : "Saisis d'abord ton adresse e-mail"}>
                  Mot de passe oublié ?
                </button>
              ) : (
                <p className="text-[11px] text-muted">
                  Mot de passe oublié ? Écris à <a href={`mailto:${EDITOR.email}`} className="underline hover:text-fg">{EDITOR.email}</a> depuis l&apos;adresse du compte pour récupérer ton accès.
                </p>
              ))}
            {(google || (emailLinks && mode === "signin")) && <div className="text-center text-xs text-muted">ou</div>}
            {emailLinks && mode === "signin" && (
              <Button type="button" variant="ghost" disabled={busy || !email} onClick={sendLink}>
                Recevoir un lien par e-mail
              </Button>
            )}
            {google && (
              <Button type="button" variant="ghost" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/connexion" })}>
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
