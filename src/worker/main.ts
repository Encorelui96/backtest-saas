import { BacktestPayload, claimNext, failJob, finishJob, reportProgress, type Job } from "../lib/server/jobs";
import { UserError, computeBacktest, saveBacktest } from "../lib/server/backtests";
import { notifyFailed, notifyFinished } from "../lib/server/backtest-notice";
import { pool } from "../lib/server/db";
import { housekeepingTick } from "../lib/server/housekeeping";
import { alertAdmins, watchMemory } from "../lib/server/admin-alert";
import { startTelegram } from "./telegram";

/**
 * The calculation process. It runs apart from the web server (on Render, the
 * worker service of render.yaml, `npm run worker`), so a heavy backtest never slows the
 * site down. Several workers can run at once.
 */

const IDLE_MS = 1000;
let stopping = false;

async function runBacktestJob(job: Job) {
  const payload = BacktestPayload.parse(job.payload);
  let lastSave = 0;
  const onProgress = async (share: number, label: string) => {
    // Saving every step would hammer the database; twice a second is plenty for a progress bar.
    if (Date.now() - lastSave < 500 && share < 1) return;
    lastSave = Date.now();
    await reportProgress(job.id, share, label);
  };
  const { strategy, report, summary } = await computeBacktest(payload.strategy, payload.config, onProgress);
  const id = await saveBacktest(job.userId, payload.strategyId, strategy, payload.config, summary, report);
  await finishJob(job.id, id);
  await notifyFinished(job, payload, id, summary);
}

async function loop() {
  console.log("[worker] prêt");
  while (!stopping) {
    const job = await claimNext().catch((e) => {
      console.error("[worker] file inaccessible", e);
      alertAdmins("worker", "file", e);
      return null;
    });
    watchMemory("worker");
    if (!job) {
      // Idle: the daily purge of old reports and jobs runs here, never while a test waits.
      await housekeepingTick();
      await new Promise((r) => setTimeout(r, IDLE_MS));
      continue;
    }
    const t0 = Date.now();
    try {
      if (job.kind !== "backtest") throw new Error(`Type de tâche inconnu : ${job.kind}`);
      await runBacktestJob(job);
      console.log(`[worker] ${job.id} terminé en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) {
      const ref = job.id;
      console.error(`[worker] ${ref} en échec`, e);
      // Stored as text and values, so the page shows it in its own language.
      const error = e instanceof UserError ? { text: e.text, values: e.values } : { text: "Le calcul a échoué (réf. {0}).", values: [ref] };
      // An error meant for the user (no data, wrong period) is not a breakdown; anything else is.
      if (!(e instanceof UserError)) alertAdmins("worker", ref, e);
      await failJob(job.id, JSON.stringify(error)).catch(() => {});
      const payload = BacktestPayload.safeParse(job.payload);
      if (payload.success) await notifyFailed(job, payload.data, error);
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    // Finish the current job, then exit: Render waits before killing on redeploy (30 s by default).
    stopping = true;
  });
}

/**
 * WORKER_ROLE picks what this process does. "all" (the default, one service):
 * the backtest queue, the bot and the alerts together. To keep the alerts
 * apart from the heavy calculations, run two services: one with "compute",
 * one with "alerts" (see render.yaml). Several "alerts" processes are safe:
 * a Postgres lock keeps a single bot reader.
 */
const role = process.env.WORKER_ROLE ?? "all";
if (!["all", "compute", "alerts"].includes(role)) throw new Error(`WORKER_ROLE inconnu : ${role} (all, compute ou alerts)`);
const telegramDone = role === "compute" ? Promise.resolve() : startTelegram(() => stopping);
const computeDone = role === "alerts" ? idle() : loop();
Promise.all([computeDone, telegramDone]).finally(() => pool().end());

/** An "alerts" process has no queue to read: it waits for the stop signal. */
async function idle() {
  console.log("[worker] rôle alertes : pas de calcul ici");
  while (!stopping) await new Promise((r) => setTimeout(r, IDLE_MS));
}
