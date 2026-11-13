import "server-only";
import { Resend } from "resend";
import { query } from "./db";

/**
 * An e-mail to the administrators when something breaks: an unexpected error on the site, a backtest
 * that crashes, a worker restarted in the middle of a test, memory close to the service's limit.
 * The detail stays in the logs under the same reference. Without RESEND_API_KEY and EMAIL_FROM
 * nothing is sent.
 */

/** One e-mail per process every 10 minutes at most: a failure that repeats must not flood the mailbox. */
export const ALERT_EVERY_MS = 10 * 60_000;
let lastSent = -Infinity;
let held = 0;

const listOf = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

/** ADMIN_EMAILS, plus the addresses of the accounts listed by id in ADMIN_USER_IDS. */
async function adminAddresses(): Promise<string[]> {
  const emails = listOf("ADMIN_EMAILS");
  const ids = listOf("ADMIN_USER_IDS");
  if (ids.length) {
    const rows = await query<{ email: string }>(`SELECT email FROM "user" WHERE id = ANY($1)`, [ids]).catch(() => []);
    emails.push(...rows.map((r) => r.email));
  }
  return [...new Set(emails.map((e) => e.toLowerCase()))];
}

function describe(error: unknown) {
  const text = error instanceof Error ? `${error.name} : ${error.message}\n\n${error.stack ?? ""}` : String(error);
  return text.slice(0, 4000);
}

/** Sends the alert, or counts it when one left less than 10 minutes ago. Resolves to whether an e-mail left. */
export async function sendAdminAlert(where: string, ref: string, error: unknown): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const now = Date.now();
  if (now - lastSent < ALERT_EVERY_MS) {
    held++;
    return false;
  }
  const to = await adminAddresses();
  if (!to.length) return false;
  lastSent = now;
  const skipped = held;
  held = 0;
  const { error: failed } = await new Resend(key).emails.send({
    from,
    to,
    subject: `[Backtest Lab] Erreur ${where} (réf. ${ref})`,
    text: [
      `Une erreur inattendue vient de se produire : ${where}, référence ${ref}.`,
      skipped ? `${skipped} autre(s) erreur(s) depuis la dernière alerte : voir les journaux Render.` : "",
      "",
      describe(error),
      "",
      "Le détail est dans les journaux Render, sous la même référence. Au plus une alerte toutes les 10 minutes par service.",
    ]
      .filter((line, i) => line || i !== 1)
      .join("\n"),
  });
  if (failed) {
    console.error("[alerte] e-mail non envoyé", failed.message);
    return false;
  }
  return true;
}

/** The same, without waiting and without ever throwing: an alert that can't leave must not add an error. */
export function alertAdmins(where: string, ref: string, error: unknown): void {
  void sendAdminAlert(where, ref, error).catch((e) => console.error("[alerte] échec", e));
}

/** Render stops a service that goes over its memory (512 MB on the current plans): warn before that. */
const MEMORY_ALERT_MB = Number(process.env.MEMORY_ALERT_MB) > 0 ? Number(process.env.MEMORY_ALERT_MB) : 420;
let memoryChecked = 0;
let memoryAlerted = false;

/** Looks at this process's memory once a minute at most, and warns once each time it crosses the threshold. */
export function watchMemory(where: string): void {
  const now = Date.now();
  if (now - memoryChecked < 60_000) return;
  memoryChecked = now;
  const mb = Math.round(process.memoryUsage().rss / 1_048_576);
  if (mb < MEMORY_ALERT_MB) {
    memoryAlerted = false;
    return;
  }
  if (memoryAlerted) return;
  memoryAlerted = true;
  console.error(`[mémoire] ${where} : ${mb} Mo`);
  alertAdmins(where, "mémoire", new Error(`Mémoire à ${mb} Mo (alerte à partir de ${MEMORY_ALERT_MB} Mo) : Render redémarre le service s'il dépasse sa limite.`));
}
