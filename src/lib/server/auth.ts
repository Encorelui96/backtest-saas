import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { pool } from "./db";

/**
 * Accounts: passwordless sign-in by e-mail link, plus Google when its keys are
 * set. Without RESEND_API_KEY the link is printed in the server logs, which is
 * enough for local development.
 */

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
  socialProviders: googleEnabled
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } }
    : {},
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
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

/** The signed-in user, or an AuthError the API turns into a 401. */
export async function requireUser(headers: Headers): Promise<SessionUser> {
  const user = await currentUser(headers);
  if (!user) throw new AuthError();
  return user;
}
