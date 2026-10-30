-- Application tables. Auth tables ("user", "session", "account", "verification")
-- are created by better-auth's own migrations (see scripts/migrate.ts).
-- Every statement is idempotent: the file runs on each deploy.

CREATE TABLE IF NOT EXISTS plans (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategies (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  json jsonb NOT NULL,
  source_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategies_by_user ON strategies (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS backtests (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  strategy_id text REFERENCES strategies(id) ON DELETE SET NULL,
  strategy jsonb NOT NULL,
  config jsonb NOT NULL,
  summary jsonb NOT NULL,
  -- The full report (trades, equity, robustness) as gzipped JSON: it can weigh several MB.
  report bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backtests_by_user ON backtests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backtests_by_strategy ON backtests (strategy_id, created_at DESC);

-- Work queue: the web server only enqueues, the worker process computes.
CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued | running | done | failed
  progress integer NOT NULL DEFAULT 0,
  message text,
  result_id text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs (status, created_at);
CREATE INDEX IF NOT EXISTS jobs_by_user ON jobs (user_id, created_at DESC);

-- Metered actions (AI translations…), for quotas.
CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_by_user ON usage_events (user_id, kind, created_at);

-- Candles shared by every user: one gzipped chunk per symbol, interval and UTC month.
CREATE TABLE IF NOT EXISTS candle_chunks (
  symbol text NOT NULL,
  interval text NOT NULL,
  month text NOT NULL, -- YYYY-MM
  bars integer NOT NULL,
  data bytea NOT NULL,
  -- Latest candle open time the chunk was filled up to; a past month is complete.
  filled_to bigint NOT NULL,
  complete boolean NOT NULL,
  PRIMARY KEY (symbol, interval, month)
);
