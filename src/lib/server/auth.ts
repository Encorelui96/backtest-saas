import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { pool } from "./db";

/**
 * Accounts: e-mail and password, plus Google when its keys are set. The e-mail
 * link sign-in stays available once RESEND_API_KEY can actually deliver it;
 * without it the link only reaches the server logs, so the page hides it.
 */

export const emailLinksEnabled = Boolean(process.env.RESEND_API_KEY);

async function sendMagicLink({ email, url }: { email: string; url: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[connexion] Lien de connexion pour ${email} :\n${url}\n`);
    return;
  }
  const { error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM ?? "Backtest Lab <connexion@example.com>",
    to: email,
    subject: "Ton lien de connexion à Backtest Lab",
    text: `Bonjour,\n\nClique sur ce lien pour te connecter à Backtest Lab (valable 10 minutes) :\n${url}\n\nSi tu n'as rien demandé, ignore ce message.`,
    html: `<p>Bonjour,</p><p><a href="${url}">Clique ici pour te connecter à Backtest Lab</a>. Le lien est valable 10 minutes.</p><p>Si tu n'as rien demandé, ignore ce message.</p>`,
  });
  if (error) throw new Error(`Envoi de l'e-mail impossible : ${error.message}`);
}

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  appName: "Backtest Lab",
  database: pool(),
  // Render gives the public address in RENDER_EXTERNAL_URL; BETTER_AUTH_URL wins when you use your own domain.
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  // No e-mail is sent, so addresses are not verified: an address can only be registered once, by whoever signs up first.
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
  socialProviders: googleEnabled
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } }
    : {},
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  // Right to erasure: the user deletes the account from "Mon compte" (password, or a sign-in less than a day old).
  // Every app table references "user" with ON DELETE CASCADE, so strategies, backtests and usage go with it.
  user: { deleteUser: { enabled: true } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  // Behind Render's proxies X-Forwarded-For holds several addresses, which better-auth won't guess from:
  // read the single-value client IP headers first, so sign-in attempts are rate-limited per visitor, not all together.
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"] } },
  plugins: [magicLink({ sendMagicLink, expiresIn: 10 * 60 }), nextCookies()],
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
}

export async function currentUser(headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
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
