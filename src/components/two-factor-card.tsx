"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/client/i18n";
import { authClient } from "@/lib/client/auth-client";
import { qrCode, qrPath } from "@/lib/qr";
import { Alert, Button, Card, Field } from "./ui";

/** Where the card is: off, asking the password, showing the key to scan, showing the backup codes, on. */
type Step = "off" | "password" | "scan" | "codes" | "on" | "disable";

/** The QR code's drawing, or null when the text is too long to draw: the key can still be typed by hand. */
function drawQr(text: string) {
  try {
    return qrPath(qrCode(text));
  } catch {
    return null;
  }
}

/** The address an authenticator app scans, as a QR code drawn on white so it reads in the dark theme too. */
function Qr({ text, label }: { text: string; label: string }) {
  const qr = useMemo(() => drawQr(text), [text]);
  if (!qr) return null;
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="h-44 w-44 shrink-0 rounded-md bg-white" shapeRendering="crispEdges" role="img" aria-label={label}>
      <path d={qr.path} fill="#000" />
    </svg>
  );
}

/** The secret inside an otpauth:// address, in groups of four so it can be typed. */
function keyOf(uri: string) {
  try {
    return (new URL(uri).searchParams.get("secret") ?? "").replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

/**
 * Two-factor authentication: after the password, a 6-digit code from an authenticator app
 * (Google Authenticator, Microsoft Authenticator, Authy, a password manager), or a backup code.
 * It needs a password: the e-mail link and Google sign-in don't go through this step.
 */
export function TwoFactorCard({ enabled, hasPassword, isAdmin, onChange }: { enabled: boolean; hasPassword: boolean; isAdmin: boolean; onChange: (enabled: boolean) => void }) {
  const tl = useT();
  const [step, setStep] = useState<Step>(enabled ? "on" : "off");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: { code?: string; status?: number }) => {
    if (e.code === "INVALID_PASSWORD") return tl("Mot de passe incorrect.");
    if (e.code === "INVALID_CODE") return tl("Code incorrect. Vérifie-le et réessaie.");
    if (e.status === 429) return tl("Trop d'essais : réessaie dans une minute.");
    return tl("Action impossible. Réessaie.");
  };

  /** Checks the password and gets the key to scan; nothing is on until a first code proves the app works. */
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (res.error) return setError(fail(res.error));
    const data = res.data as unknown as { totpURI?: string; backupCodes?: string[] } | null;
    setUri(data?.totpURI ?? "");
    setBackupCodes(data?.backupCodes ?? []);
    setPassword("");
    setStep("scan");
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (error) return setError(fail(error));
    setCode("");
    setStep("codes");
    onChange(true);
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return setError(fail(error));
    setPassword("");
    setStep("off");
    onChange(false);
  };

  const cancel = (to: Step) => {
    setPassword("");
    setCode("");
    setError(null);
    setStep(to);
  };

  const passwordField = (
    <Field label={tl("Ton mot de passe")}>
      <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
    </Field>
  );

  return (
    <Card title={tl("Double authentification")}>
      <div className="flex flex-col gap-3 text-sm">
        {step === "off" && (
          <>
            <p className="text-muted">{tl("Après ton mot de passe, le site demande un code à 6 chiffres donné par une application d'authentification sur ton téléphone. Un mot de passe volé ne suffit plus pour entrer.")}</p>
            {isAdmin && <Alert tone="warn">{tl("Ce compte est administrateur : active la double authentification.")}</Alert>}
            {hasPassword ? (
              <Button className="self-start" onClick={() => setStep("password")}>
                {tl("Activer la double authentification")}
              </Button>
            ) : (
              <Alert tone="info">{tl("Définis d'abord un mot de passe ci-dessus : la double authentification protège la connexion par mot de passe.")}</Alert>
            )}
          </>
        )}

        {step === "password" && (
          <form onSubmit={start} className="flex flex-col gap-3">
            <p className="text-muted">{tl("Confirme ton mot de passe pour commencer.")}</p>
            {passwordField}
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !password}>
                {busy ? tl("Un instant…") : tl("Continuer")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => cancel("off")}>
                {tl("Annuler")}
              </Button>
            </div>
          </form>
        )}

        {step === "scan" && (
          <form onSubmit={confirm} className="flex flex-col gap-3">
            <p className="text-muted">{tl("1. Ouvre ton application d'authentification (Google Authenticator, Microsoft Authenticator, Authy…) et scanne ce QR code.")}</p>
            <div className="flex flex-wrap items-start gap-3">
              <Qr text={uri} label={tl("QR code à scanner avec ton application d'authentification")} />
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-muted">
                <span>{tl("Impossible de scanner ? Saisis cette clé dans l'application :")}</span>
                <span className="num select-all break-all text-fg">{keyOf(uri)}</span>
                <a href={uri} className="text-accent hover:underline">
                  {tl("Ouvrir dans l'application de cet appareil")}
                </a>
              </div>
            </div>
            <p className="text-muted">{tl("2. Saisis le code à 6 chiffres que l'application affiche.")}</p>
            <Field label={tl("Code à 6 chiffres")}>
              <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="num" />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.trim().length < 6}>
                {busy ? tl("Un instant…") : tl("Vérifier et activer")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => cancel("off")}>
                {tl("Annuler")}
              </Button>
            </div>
          </form>
        )}

        {step === "codes" && (
          <>
            <Alert tone="info">{tl("La double authentification est activée.")}</Alert>
            <p>{tl("Note ces codes de secours et garde-les à l'abri : chacun remplace une fois le code de l'application si tu perds ton téléphone. Ils ne seront plus affichés.")}</p>
            <ul className="num grid select-all grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-line p-3">
              {backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button
              className="self-start"
              onClick={() => {
                setBackupCodes([]);
                setUri("");
                setStep("on");
              }}
            >
              {tl("J'ai noté mes codes")}
            </Button>
          </>
        )}

        {step === "on" && (
          <>
            <p>{tl("Activée : la connexion par mot de passe demande un code de ton application d'authentification.")}</p>
            <Button variant="ghost" className="self-start" onClick={() => setStep("disable")}>
              {tl("Désactiver la double authentification")}
            </Button>
          </>
        )}

        {step === "disable" && (
          <form onSubmit={disable} className="flex flex-col gap-3">
            <p className="text-muted">{tl("Confirme ton mot de passe pour désactiver la double authentification.")}</p>
            {passwordField}
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={busy || !password}>
                {busy ? tl("Un instant…") : tl("Désactiver")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => cancel("on")}>
                {tl("Annuler")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
