import { BacktestPayload, claimNext, failJob, finishJob, reportProgress, type Job } from "../lib/server/jobs";
import { UserError, computeBacktest, saveBacktest } from "../lib/server/backtests";
import { pool } from "../lib/server/db";

/**
 * The calculation process. It runs apart from the web server (on Railway, a
 * second service with `npm run worker`), so a heavy backtest never slows the
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
}

async function loop() {
  console.log("[worker] prêt");
  while (!stopping) {
    const job = await claimNext().catch((e) => {
      console.error("[worker] file inaccessible", e);
      return null;
    });
    if (!job) {
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
      await failJob(job.id, e instanceof UserError ? e.message : `Le calcul a échoué (réf. ${ref}).`).catch(() => {});
    }
  }
  await pool().end();
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    // Finish the current job, then exit: Railway waits before killing on redeploy.
    stopping = true;
  });
}

loop();
