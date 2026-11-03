import "server-only";

/**
 * The Telegram bot that sends the alerts (token from @BotFather in
 * TELEGRAM_BOT_TOKEN, on the web service and the worker). Its username is
 * asked from Telegram, so nothing else needs configuring.
 */

export const telegramEnabled = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

export class TelegramError extends Error {
  constructor(
    message: string,
    /** The chat blocked the bot or no longer exists: its link should be removed. */
    readonly chatGone = false,
  ) {
    super(message);
  }
}

export async function telegram<T>(method: string, body: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError("Les alertes Telegram ne sont pas configurées sur ce serveur (TELEGRAM_BOT_TOKEN).");
  // TELEGRAM_API_URL only exists for tests against a local stand-in.
  const res = await fetch(`${process.env.TELEGRAM_API_URL ?? "https://api.telegram.org"}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!data.ok) {
    // Never echo the URL: it contains the token.
    const gone = data.error_code === 403 || /chat not found|bot was blocked|user is deactivated/i.test(data.description ?? "");
    throw new TelegramError(`Telegram ${method} : ${data.description ?? res.status}`, gone);
  }
  return data.result as T;
}

let username: string | null = null;

/** The bot's @username, for t.me links. */
export async function botUsername(): Promise<string> {
  if (!username) username = (await telegram<{ username: string }>("getMe")).username;
  return username;
}

export function sendMessage(chatId: number | string, html: string) {
  return telegram("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

/** Text inside Telegram HTML messages. */
export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
