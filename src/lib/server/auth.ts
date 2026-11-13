import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink, twoFactor } from "better-auth/plugins";
import { isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";
import { Resend } from "resend";
import { pool } from "./db";
import { translator, type Lang } from "@/lib/i18n";

/**
 * Accounts: e-mail and password, plus Google when its keys are set. Everything
 * that needs an e-mail (address check, password reset, sign-in link) turns on
 * once RESEND_API_KEY can actually deliver it.
 */

export const emailLinksEnabled = Boolean(process.env.RESEND_API_KEY);
/** Without Resend, `next dev` prints sign-in links in the terminal; production never writes them to its logs. */
const devSignInLinks = !emailLinksEnabled && process.env.NODE_ENV !== "production";

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The language of an e-mail: the page asked for the link with an address under
 * /en to come back to (callbackURL, or the reset page), which the link carries.
 */
function langOfLink(url: string): Lang {
  try {
    const u = new URL(url);
    const back = u.searchParams.get("callbackURL") ?? u.searchParams.get("redirectTo") ?? "";
    return /^\/en(\/|$|\?)/.test(back) ? "en" : "fr";
  } catch {
    return "fr";
  }
}

/** One e-mail with one button: `action` is what the link does, "pour te connecter". */
async function sendLinkEmail(to: string, subject: string, action: string, url: string, validity: string) {
  const t = translator(langOfLink(url));
  const [a, v] = [t(action), t(validity)];
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM ?? "Backtest Lab <connexion@example.com>",
    to,
    subject: t(subject),
    text: t("Bonjour,\n\nClique sur ce lien {0} (valable {1}) :\n{2}\n\nSi tu n'as rien demandé, ignore ce message.", [a, v, url]),
    html: t("<p>Bonjour,</p><p><a href=\"{2}\">Clique ici {0}</a>. Le lien est valable {1}.</p><p>Si tu n'as rien demandé, ignore ce message.</p>", [a, v, attr(url)]),
  });
  if (error) throw new Error(`Envoi de l'e-mail impossible : ${error.message}`);
}

async function sendMagicLink({ email, url }: { email: string; url: string }) {
  if (devSignInLinks) {
    console.log(`\n[connexion] Lien de connexion pour ${email} :\n${url}\n`);
    return;
  }
  await sendLinkEmail(email, "Ton lien de connexion à Backtest Lab", "pour te connecter à Backtest Lab", url, "10 minutes");
}

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The routes that choose a password, and the field that carries it. */
const NEW_PASSWORD_FIELD: Record<string, string> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/set-password": "newPassword",
};

/**
 * Whether the password appears in a known leak (Have I Been Pwned: only the first five characters of its
 * SHA-1 hash leave the server). When the service doesn't answer within 3 seconds the password is accepted:
 * a breakdown over there must not stop sign-ups here.
 */
async function knownLeaked(password: string): Promise<boolean> {
  try {
    return await Promise.race([isPasswordCompromised(password), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))]);
  } catch {
    return false;
  }
}

/** Sign-in attempts per visitor (IP address), on top of better-auth's limit of 100 requests a minute. */
const ATTEMPTS = { window: 60, max: 5 };

export const auth = betterAuth({
  appName: "Backtest Lab",
  database: pool(),
  // Render gives the public address in RENDER_EXTERNAL_URL; BETTER_AUTH_URL wins when you use your own domain.
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    // With e-mail, an address must be confirmed before its first session, so nobody can sign up with someone else's.
    // Without it, an address can only be registered once, by whoever signs up first.
    requireEmailVerification: emailLinksEnabled,
    ...(emailLinksEnabled && {
      sendResetPassword: ({ user, url }) => sendLinkEmail(user.email, "Choisis un nouveau mot de passe", "pour choisir un nouveau mot de passe", url, "1 heure"),
    }),
    // Whoever knew the old password is signed out everywhere.
    revokeSessionsOnPasswordReset: true,
  },
  ...(emailLinksEnabled && {
    emailVerification: {
      sendVerificationEmail: ({ user, url }) => sendLinkEmail(user.email, "Confirme ton adresse e-mail", "pour confirmer ton adresse et entrer dans Backtest Lab", url, "1 heure"),
      sendOnSignUp: true,
      // Accounts made before the check get the e-mail at their next sign-in.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
  }),
  // A password found in a public leak is refused wherever one is chosen: it is the first one an attacker tries.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const field = NEW_PASSWORD_FIELD[ctx.path];
      if (!field) return;
      const password = (ctx.body as Record<string, unknown> | undefined)?.[field];
      if (typeof password !== "string" || !(await knownLeaked(password))) return;
      throw APIError.from("BAD_REQUEST", { message: "This password appears in a known data leak.", code: "PASSWORD_COMPROMISED" });
    }),
  },
  socialProviders: googleEnabled
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } }
    : {},
  // better-auth only links Google to an existing account whose own address is verified (requireLocalEmailVerified,
  // on by default): an account registered with someone else's address can't capture their Google identity.
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  // In memory: there is one web instance, and no IP address is kept once the window has passed.
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": ATTEMPTS,
      "/sign-up/email": ATTEMPTS,
      "/sign-in/magic-link": ATTEMPTS,
      "/request-password-reset": ATTEMPTS,
      "/send-verification-email": ATTEMPTS,
      "/change-password": ATTEMPTS,
      "/delete-user": ATTEMPTS,
    },
  },
  // Right to erasure: the user deletes the account from "Mon compte" (password, or a sign-in less than a day old).
  // Every app table references "user" with ON DELETE CASCADE, so strategies, backtests and usage go with it.
  user: { deleteUser: { enabled: true } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  // Behind Render's proxies X-Forwarded-For holds several addresses, which better-auth won't guess from:
  // read the single-value client IP headers first, so sign-in attempts are rate-limited per visitor, not all together.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"] } },
  plugins: [
    ...(emailLinksEnabled || devSignInLinks ? [magicLink({ sendMagicLink, expiresIn: 10 * 60 })] : []),
    // Optional second step after the password: a 6-digit code from an authenticator app, or one of 10 backup codes.
    // It guards the password sign-in; the e-mail link and Google rely on the mailbox or on Google's own second step.
    twoFactor({ issuer: "Backtest Lab" }),
    nextCookies(),
  ],
});

export class AuthError extends Error {
  constructor() {
    super("Connecte-toi pour continuer.");
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Whether the owner of the address confirmed it (false for every account until e-mail sending is set up). */
  emailVerified: boolean;
  /** Whether the password sign-in asks for a code from an authenticator app. */
  twoFactorEnabled?: boolean;
}

export async function currentUser(headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { twoFactorEnabled } = session.user as unknown as { twoFactorEnabled?: boolean | null };
  return { id: session.user.id, email: session.user.email, name: session.user.name, emailVerified: session.user.emailVerified, twoFactorEnabled: Boolean(twoFactorEnabled) };
}

/** Whether the signed-in user can sign in with a password (accounts made with the e-mail link or Google have none). */
export async function hasPassword(headers: Headers): Promise<boolean> {
  const accounts = await auth.api.listUserAccounts({ headers });
  return accounts.some((a) => a.providerId === "credential");
}

/** The signed-in user, or an AuthError the API turns into a 401. */
export async function requireUser(headers: Headers): Promise<SessionUser> {
  const user = await currentUser(headers);
  if (!user) throw new AuthError();
  return user;
}
