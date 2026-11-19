import "server-only";
import { Resend } from "resend";
import type { Lang } from "../i18n";
import { SITE_URL } from "../site";
import { welcomeDue, welcomeEmail } from "../welcome-email";
import { query, queryOne } from "./db";

/**
 * The welcome e-mail, sent once per account when its address is confirmed: at creation for Google and the
 * e-mail link, after the check for a password sign-up. Without RESEND_API_KEY and EMAIL_FROM nothing is sent.
 */

const siteUrl = () => (process.env.SITE_HOST ? `https://${process.env.SITE_HOST}` : SITE_URL);

/** Never throws: a sign-up or an address check must not fail because an e-mail couldn't leave. */
export async function sendWelcome(userId: string, lang: Lang): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    // Read back from the database: a sign-up can still be finishing its transaction, so look again shortly after.
    let user = null;
    for (let attempt = 0; attempt < 3 && !user; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1500));
      user = await queryOne<{ email: string; name: string | null; email_verified: boolean; created_at: Date }>(
        `SELECT email, name, "emailVerified" AS email_verified, "createdAt" AS created_at FROM "user" WHERE id = $1`,
        [userId],
      );
    }
    if (!user || !welcomeDue({ emailVerified: user.email_verified, createdAt: user.created_at })) return false;
    // Claimed before sending, so two hooks at the same moment send a single e-mail.
    const claimed = await queryOne<{ user_id: string }>(
      `INSERT INTO user_settings (user_id, welcome_sent_at) VALUES ($1, now())
       ON CONFLICT (user_id) DO UPDATE SET welcome_sent_at = now() WHERE user_settings.welcome_sent_at IS NULL
       RETURNING user_id`,
      [userId],
    );
    if (!claimed) return false;
    const { error } = await new Resend(key).emails.send({ from, to: user.email, ...welcomeEmail({ lang, name: user.name, site: siteUrl() }) });
    if (error) {
      // Released, so the next confirmation or sign-in can try again.
      await query(`UPDATE user_settings SET welcome_sent_at = NULL WHERE user_id = $1`, [userId]).catch(() => undefined);
      throw new Error(error.message);
    }
    return true;
  } catch (e) {
    console.error(`[bienvenue] e-mail non envoyé pour ${userId}`, e);
    return false;
  }
}
