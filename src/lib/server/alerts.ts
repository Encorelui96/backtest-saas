import "server-only";
import { randomBytes } from "node:crypto";
import type { Strategy } from "../strategy/schema";
import { lastPublishedOpen, market } from "../markets";
import { normalizeStrategy } from "../strategy/schema";
import { stopLabel, targetLabel } from "../strategy/describe";
import { higherTimeframeWarmupMs, higherTimeframes, warmupMs } from "../strategy/warmup";
import { INTERVAL_MS, rowsToCandles } from "../types";
import { SeriesContext } from "../engine/evaluate";
import { signalsAt, type SignalKind } from "../engine/signals";
import { localTime } from "../engine/time";
import { fetchRecent } from "./candles";
import { newId, query, queryOne } from "./db";
import { PLANS, QuotaError, isAdmin, planOf, type PlanId } from "./quotas";
import type { SessionUser } from "./auth";
import { UserError } from "./backtests";
import { hasLang, localeTag, translator, type Lang } from "@/lib/i18n";
import { TelegramError, botUsername, escapeHtml, sendMessage } from "./telegram";

/* ---------- Linking a Telegram chat to an account ---------- */

/** A t.me link that opens the bot with a one-time code (15 minutes) binding the chat to this account. */
export async function createLinkUrl(userId: string, lang: Lang = "fr"): Promise<string> {
  const code = randomBytes(12).toString("base64url");
  await query("DELETE FROM telegram_link_codes WHERE user_id = $1 OR expires_at < now()", [userId]);
  await query("INSERT INTO telegram_link_codes (code, user_id, expires_at, lang) VALUES ($1, $2, now() + interval '15 minutes', $3)", [code, userId, lang]);
  return `https://t.me/${await botUsername()}?start=${code}`;
}

/** Consumes a code sent with /start. Returns the language of the chat, or null when the code is unknown or expired. */
export async function linkChat(code: string, chatId: number, username: string | null): Promise<Lang | null> {
  const row = await queryOne<{ user_id: string; lang: string }>("DELETE FROM telegram_link_codes WHERE code = $1 AND expires_at > now() RETURNING user_id, lang", [code]);
  if (!row) return null;
  const lang = hasLang(row.lang) ? row.lang : "fr";
  await query(
    `INSERT INTO telegram_links (user_id, chat_id, username, lang) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET chat_id = $2, username = $3, lang = $4, linked_at = now()`,
    [row.user_id, chatId, username, lang],
  );
  return lang;
}

export async function unlinkUser(userId: string) {
  await query("DELETE FROM telegram_links WHERE user_id = $1", [userId]);
}

/** Returns the language the chat was linked in, or null when it wasn't linked. */
export async function unlinkChat(chatId: number): Promise<Lang | null> {
  const rows = await query<{ lang: string }>("DELETE FROM telegram_links WHERE chat_id = $1 RETURNING lang", [chatId]);
  return rows.length ? (hasLang(rows[0].lang) ? rows[0].lang : "fr") : null;
}

export async function telegramLinkOf(userId: string) {
  return queryOne<{ chat_id: string; username: string | null; linked_at: Date }>("SELECT chat_id, username, linked_at FROM telegram_links WHERE user_id = $1", [userId]);
}

/* ---------- The user's alerts ---------- */

export interface AlertRow {
  id: string;
  strategyId: string;
  name: string;
  symbol: string;
  interval: string;
  enabled: boolean;
  lastSignalAt: number | null;
  lastError: string | null;
}

export async function listAlerts(userId: string): Promise<AlertRow[]> {
  const rows = await query<{ id: string; strategy_id: string; json: Strategy; enabled: boolean; last_signal_at: Date | null; last_error: string | null }>(
    `SELECT a.id, a.strategy_id, s.json, a.enabled, a.last_signal_at, a.last_error FROM alerts a
     JOIN strategies s ON s.id = a.strategy_id WHERE a.user_id = $1 ORDER BY a.created_at`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    strategyId: r.strategy_id,
    name: r.json.name,
    symbol: r.json.symbol,
    interval: r.json.interval,
    enabled: r.enabled,
    lastSignalAt: r.last_signal_at?.getTime() ?? null,
    lastError: r.last_error,
  }));
}

export async function createAlert(user: SessionUser, strategyId: string): Promise<AlertRow[]> {
  const plan = await planOf(user);
  const strategy = await queryOne<{ json: Strategy }>("SELECT json FROM strategies WHERE id = $1 AND user_id = $2", [strategyId, user.id]);
  if (!strategy) throw new UserError("Stratégie introuvable.");
  if (plan.alerts === 0) throw new QuotaError("L'offre {0:t} n'inclut pas d'alertes : passe à l'offre Trader pour en recevoir sur Telegram.", [plan.label], { plain: "L'offre {0:t} n'inclut pas d'alertes." });
  if (INTERVAL_MS[strategy.json.interval] < INTERVAL_MS[plan.minInterval]) {
    throw new QuotaError("L'offre {0:t} suit les stratégies à partir de l'unité {1}.", [plan.label, plan.minInterval]);
  }
  const [{ n }] = await query<{ n: string }>("SELECT count(*) AS n FROM alerts WHERE user_id = $1", [user.id]);
  const existing = await queryOne("SELECT 1 FROM alerts WHERE user_id = $1 AND strategy_id = $2", [user.id, strategyId]);
  if (!existing && Number(n) >= plan.alerts) throw new QuotaError("Ton offre {0:t} permet {1} alerte{2} : supprime-en une avant d'en créer une autre.", [plan.label, plan.alerts, plan.alerts > 1 ? "s" : ""]);
  await query(
    `INSERT INTO alerts (id, user_id, strategy_id) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, strategy_id) DO UPDATE SET enabled = true, last_error = NULL`,
    [newId(), user.id, strategyId],
  );
  return listAlerts(user.id);
}

export async function setAlertEnabled(userId: string, id: string, enabled: boolean) {
  await query("UPDATE alerts SET enabled = $3, last_error = NULL WHERE id = $1 AND user_id = $2", [id, userId, enabled]);
}

export async function deleteAlert(userId: string, id: string) {
  await query("DELETE FROM alerts WHERE id = $1 AND user_id = $2", [id, userId]);
}

/* ---------- Checking the alerts (worker) ---------- */

const LABELS: Record<SignalKind, string> = {
  long: "🟢 Signal d'<b>ACHAT</b>",
  short: "🔴 Signal de <b>VENTE à découvert</b>",
  exit_long: "⚪️ Signal de <b>SORTIE</b> d'un achat",
  exit_short: "⚪️ Signal de <b>SORTIE</b> d'une vente",
};

function siteUrl() {
  const host = process.env.SITE_HOST;
  const url = process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL ?? (host ? `https://${host}` : null);
  return url?.replace(/\/$/, "") ?? null;
}

function formatPrice(x: number, lang: Lang) {
  const digits = x >= 1000 ? 2 : x >= 1 ? 4 : 6;
  return x.toLocaleString(localeTag(lang), { maximumFractionDigits: digits });
}

/** The Telegram message for the signals of one candle close, in the language the chat was linked in. */
export function alertMessage(strategy: Strategy, strategyId: string, signals: SignalKind[], closeTime: number, closePrice: number, lang: Lang = "fr") {
  const t = translator(lang);
  const lt = localTime(strategy.timezone, closeTime);
  const hhmm = lang === "en" ? `${String(lt.hour).padStart(2, "0")}:${String(lt.minute).padStart(2, "0")}` : `${String(lt.hour).padStart(2, "0")}h${String(lt.minute).padStart(2, "0")}`;
  const lines = [
    `🔔 <b>${escapeHtml(strategy.name)}</b>`,
    `${escapeHtml(strategy.symbol)} · ${strategy.interval} · ${t("clôture de {0}", [hhmm])} (${escapeHtml(strategy.timezone)})`,
    "",
    ...signals.map((s) => t(LABELS[s])),
    t("Prix de clôture : {0}", [formatPrice(closePrice, lang)]),
    ...(market(strategy.symbol)?.delayed ? [t("⚠️ Données différées de plusieurs heures.")] : []),
  ];
  if (signals.some((s) => s === "long" || s === "short")) {
    lines.push(t("Stop prévu : {0} · Objectif : {1}", [escapeHtml(stopLabel(strategy, t)), escapeHtml(targetLabel(strategy, t))]));
  }
  const site = siteUrl();
  if (site) lines.push("", `<a href="${site}${lang === "en" ? "/en" : ""}/live?strategy=${encodeURIComponent(strategyId)}">${t("Voir en direct")}</a>`);
  lines.push("", `<i>${t("Signal calculé par ta stratégie, à titre de simulation : ce n'est pas un conseil en investissement.")}</i>`);
  return lines.join("\n");
}

interface DueAlert {
  id: string;
  user_id: string;
  email: string;
  email_verified: boolean;
  plan: PlanId | null;
  strategy_id: string;
  json: Strategy;
  last_bar: string | null;
  chat_id: string;
  lang: string;
  rank: string;
}

/** Candles a check catches up on, when a long backtest held the worker or the source was late. */
export const CATCH_UP_BARS = 12;
/** While a candle is missing, look again at most this often, and for this long after its close. */
const RETRY_MS = 60_000;
const RETRY_FOR_MS = 10 * 60_000;
/** Per alert, the candle looked for in vain and when: a late or closed market isn't read again every 20 seconds. */
const missed = new Map<string, { open: number; at: number }>();

/**
 * The signals of each candle closed after `after` (an open time), oldest
 * first, among the last CATCH_UP_BARS; and the open time of the newest
 * closed candle the data has.
 */
async function evaluateCloses(strategy: Strategy, now: number, after: number) {
  const ms = INTERVAL_MS[strategy.interval];
  const warmBars = Math.min(4000, Math.ceil(warmupMs(strategy) / ms) + 10);
  const rows = (await fetchRecent(strategy.symbol, strategy.interval, warmBars + CATCH_UP_BARS + 2)).filter((r) => r.t + ms <= now);
  if (rows.length < 10) throw new Error("Pas assez de cours récents pour ce marché.");
  const candles = rowsToCandles(rows);
  const ctx = new SeriesContext(candles, strategy.interval, strategy.timezone);
  for (const tf of higherTimeframes(strategy)) {
    const bars = Math.min(1500, Math.ceil(higherTimeframeWarmupMs(strategy, tf) / INTERVAL_MS[tf]) + Math.ceil((CATCH_UP_BARS * ms) / INTERVAL_MS[tf]) + 3);
    const htf = (await fetchRecent(strategy.symbol, tf, bars)).filter((r) => r.t + INTERVAL_MS[tf] <= now);
    ctx.attachHigherTimeframe(tf, rowsToCandles(htf));
  }
  const last = candles.t.length - 1;
  const closes: { signals: SignalKind[]; barTime: number; close: number }[] = [];
  for (let i = Math.max(0, last - CATCH_UP_BARS + 1); i <= last; i++) {
    if (candles.t[i] <= after) continue;
    const signals = signalsAt(ctx, strategy, i);
    if (signals.length) closes.push({ signals, barTime: candles.t[i], close: candles.c[i] });
  }
  return { lastBar: candles.t[last], closes };
}

/**
 * One pass over the enabled alerts whose candle has closed since their last
 * check. Plans are re-read each time, so a downgraded account keeps only the
 * alerts its new plan allows (the oldest ones).
 *
 * `last_bar` is the open time of the last candle the data had at the check,
 * not the clock's: a source that publishes a little late (Twelve Data) gets
 * its candle read when it arrives, instead of being skipped for good.
 */
export async function runAlertChecks(now = Date.now()) {
  const due = await query<DueAlert>(
    `SELECT a.id, a.user_id, u.email, u."emailVerified" AS email_verified, p.plan, a.strategy_id, s.json, a.last_bar, t.chat_id, t.lang,
            row_number() OVER (PARTITION BY a.user_id ORDER BY a.created_at) AS rank
     FROM alerts a
     JOIN strategies s ON s.id = a.strategy_id
     JOIN "user" u ON u.id = a.user_id
     JOIN telegram_links t ON t.user_id = a.user_id
     LEFT JOIN plans p ON p.user_id = a.user_id
     WHERE a.enabled`,
  );
  let sent = 0;
  for (const a of due) {
    const plan = isAdmin({ id: a.user_id, email: a.email, emailVerified: a.email_verified }) ? PLANS.pro : (PLANS[a.plan ?? "free"] ?? PLANS.free);
    const { strategy } = normalizeStrategy(a.json);
    const ms = INTERVAL_MS[strategy.interval];
    if (Number(a.rank) > plan.alerts || ms < INTERVAL_MS[plan.minInterval]) continue;
    // Open time of the candle that closed last, once its source has had time to publish it.
    const lastOpen = lastPublishedOpen(strategy.symbol, strategy.interval, now);
    if (a.last_bar !== null && Number(a.last_bar) >= lastOpen) continue;
    const miss = missed.get(a.id);
    if (miss && miss.open === lastOpen && (now - miss.at < RETRY_MS || now - (lastOpen + ms) > RETRY_FOR_MS)) continue;
    try {
      const { lastBar, closes } = await evaluateCloses(strategy, now, a.last_bar === null ? Infinity : Number(a.last_bar));
      // Late source or closed market (forex at the weekend): the candle isn't there yet.
      if (lastBar < lastOpen) missed.set(a.id, { open: lastOpen, at: now });
      else missed.delete(a.id);
      // A new alert starts from the current candle: an old signal must not arrive the minute it is created.
      if (a.last_bar === null) {
        await query("UPDATE alerts SET last_bar = $2 WHERE id = $1", [a.id, lastBar]);
        continue;
      }
      if (lastBar <= Number(a.last_bar)) continue;
      for (const c of closes) {
        await sendMessage(a.chat_id, alertMessage(strategy, a.strategy_id, c.signals, c.barTime + ms, c.close, hasLang(a.lang) ? a.lang : "fr"));
        sent++;
        // Saved message by message: if the next one fails, this one isn't sent again.
        await query("UPDATE alerts SET last_bar = $2, last_signal_at = now() WHERE id = $1", [a.id, c.barTime]);
      }
      await query("UPDATE alerts SET last_bar = $2, last_error = NULL WHERE id = $1", [a.id, lastBar]);
    } catch (e) {
      if (e instanceof TelegramError && e.chatGone) {
        await unlinkChat(Number(a.chat_id));
        continue;
      }
      // Shown on the account page. The candle stays to check: tried again a minute later, while it is recent.
      missed.set(a.id, { open: lastOpen, at: now });
      await query("UPDATE alerts SET last_error = $2 WHERE id = $1", [a.id, e instanceof Error ? e.message.slice(0, 200) : "Erreur"]);
    }
  }
  return sent;
}
