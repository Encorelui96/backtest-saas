import "server-only";
import { Resend } from "resend";
import { failedEmail, finishedEmail, type BacktestEmail } from "../backtest-email";
import { DEFAULT_LANG, translate } from "../i18n";
import { SITE_URL } from "../site";
import type { BacktestSummary } from "./backtests";
import { queryOne } from "./db";
import type { BacktestPayload, Job } from "./jobs";

/** From this wait, counted from the click, the person has probably left the page. */
export const LONG_TEST_MS = 2 * 60_000;

const siteUrl = () => (process.env.SITE_HOST ? `https://${process.env.SITE_HOST}` : SITE_URL);

function testOf({ strategy, config, lang }: BacktestPayload) {
  return { lang: lang ?? DEFAULT_LANG, name: strategy.name, symbol: strategy.symbol, interval: strategy.interval, startDate: config.startDate, endDate: config.endDate, site: siteUrl() };
}

async function deliver(job: Job, email: () => BacktestEmail) {
  if (Date.now() - job.createdAt < LONG_TEST_MS) return;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return;
  try {
    const user = await queryOne<{ email: string; test_emails: boolean | null }>(
      `SELECT u.email, s.test_emails FROM "user" u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = $1`,
      [job.userId],
    );
    if (!user || user.test_emails === false) return;
    const { error } = await new Resend(key).emails.send({ from, to: user.email, ...email() });
    if (error) throw new Error(error.message);
  } catch (e) {
    // The test is over either way: an e-mail that can't leave must not change its outcome.
    console.error(`[worker] ${job.id} e-mail non envoyé`, e);
  }
}

export function notifyFinished(job: Job, payload: BacktestPayload, backtestId: string, summary: BacktestSummary) {
  return deliver(job, () => finishedEmail(testOf(payload), backtestId, summary));
}

/** `error` is the worker's {text, values}, translated here into the test's language. */
export function notifyFailed(job: Job, payload: BacktestPayload, error: { text: string; values: readonly unknown[] }) {
  const test = testOf(payload);
  return deliver(job, () => failedEmail(test, translate(test.lang, error.text, error.values)));
}
