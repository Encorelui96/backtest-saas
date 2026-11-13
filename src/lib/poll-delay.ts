/**
 * How long a page waits before asking again where its backtest stands. Every waiting page asks
 * the site and the database, so a crowd in the queue must not ask as often as one person whose
 * test is running:
 * - far back in the queue (10 or more ahead), every 5 seconds; 3 to 9 ahead, every 3 seconds;
 *   next in line, every 1.5 seconds;
 * - once the test runs, every 0.7 second for 30 seconds, so a short test lands fast, then every
 *   2 seconds: a long test's bar doesn't move faster than that;
 * - a page in the background, every 10 seconds.
 */
export function pollDelay(
  job: { status: string; ahead: number },
  runningSince: number,
  now = Date.now(),
  hidden = typeof document !== "undefined" && document.hidden,
): number {
  if (hidden) return 10_000;
  if (job.status === "queued") return job.ahead >= 10 ? 5000 : job.ahead >= 3 ? 3000 : 1500;
  return runningSince && now - runningSince < 30_000 ? 700 : 2000;
}
