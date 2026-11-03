import { pool } from "../lib/server/db";
import { linkChat, runAlertChecks, unlinkChat } from "../lib/server/alerts";
import { TelegramError, sendMessage, telegram, telegramEnabled } from "../lib/server/telegram";

/**
 * The bot's side of the worker: it answers /start (linking a chat to an
 * account) and checks the alerts every 20 seconds. Only one worker instance
 * does this, the one holding a Postgres lock: Telegram refuses two readers
 * of the same bot, and an alert must not be sent twice.
 */

const LOCK = 41_027_001;

/** A pause that ends early when the worker is asked to stop. */
async function pause(ms: number, isStopping: () => boolean) {
  for (let left = ms; left > 0 && !isStopping(); left -= 1000) await new Promise((r) => setTimeout(r, Math.min(1000, left)));
}
const ALERT_EVERY_MS = 20_000;

interface Update {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string }; from?: { username?: string } };
}

const HELP =
  "Bonjour ! Je suis le bot d'alertes de <b>Backtest Lab</b>.\n\nPour recevoir les signaux de tes stratégies, relie ce chat depuis ton compte : Mon compte → Alertes Telegram → <b>Relier Telegram</b>.\n\n/stop pour ne plus rien recevoir ici.";

async function handle(update: Update) {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return;
  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  const chatId = msg.chat.id;
  if (command === "/start" && arg) {
    const ok = await linkChat(arg, chatId, msg.from?.username ?? null);
    await sendMessage(
      chatId,
      ok
        ? "✅ Ton compte Backtest Lab est relié. Tu recevras ici les signaux des stratégies pour lesquelles tu as activé une alerte.\n\n/stop pour arrêter."
        : "Ce lien a expiré ou a déjà servi. Retourne sur Mon compte et clique à nouveau sur <b>Relier Telegram</b>.",
    );
  } else if (command === "/stop") {
    await unlinkChat(chatId);
    await sendMessage(chatId, "C'est noté : plus aucune alerte ne sera envoyée ici. Tu peux relier Telegram à nouveau depuis ton compte.");
  } else {
    await sendMessage(chatId, HELP);
  }
}

async function pollUpdates(isStopping: () => boolean) {
  let offset = 0;
  // The worker reads updates itself: no webhook may be set at the same time.
  await telegram("deleteWebhook", { drop_pending_updates: false }).catch(() => {});
  while (!isStopping()) {
    try {
      const updates = await telegram<Update[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, 35_000);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handle(u).catch((e) => console.error("[telegram] message non traité", e instanceof Error ? e.message : e));
      }
    } catch (e) {
      console.error("[telegram] lecture impossible", e instanceof TelegramError ? e.message : e);
      await pause(10_000, isStopping);
    }
  }
}

async function alertLoop(isStopping: () => boolean) {
  while (!isStopping()) {
    const t0 = Date.now();
    try {
      const sent = await runAlertChecks();
      if (sent) console.log(`[alertes] ${sent} message${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}`);
    } catch (e) {
      console.error("[alertes] vérification impossible", e);
    }
    await pause(Math.max(1_000, ALERT_EVERY_MS - (Date.now() - t0)), isStopping);
  }
}

/** Runs the bot if this instance gets the lock; otherwise retries every minute, in case the holder stops. */
export async function startTelegram(isStopping: () => boolean) {
  if (!telegramEnabled()) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN absent : alertes désactivées");
    return;
  }
  while (!isStopping()) {
    const client = await pool().connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK]);
      if (rows[0].ok) {
        console.log("[telegram] bot et alertes actifs");
        await Promise.all([pollUpdates(isStopping), alertLoop(isStopping)]);
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK]);
        return;
      }
    } catch (e) {
      console.error("[telegram]", e);
    } finally {
      client.release();
    }
    await pause(60_000, isStopping);
  }
}


