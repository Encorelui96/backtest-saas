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
-- A starred strategy: listed first, and its backtests are never purged.
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;

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
-- The name the owner gave this result. Empty, it shows its strategy's name. Private: shared reports don't show it.
ALTER TABLE backtests ADD COLUMN IF NOT EXISTS name text;

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
-- What an AI translation consumed, for the cost per user (empty for the calls made before it was measured).
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS model text;

-- Answers to the in-app questions (kind 'pmf': "how would you feel if you could no longer use Backtest Lab?").
CREATE TABLE IF NOT EXISTS feedback (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL,
  answer text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

-- Public read-only links to a backtest report, one per backtest, removed with it.
-- "featured" marks the one the home page shows as an example (an admin's own report).
CREATE TABLE IF NOT EXISTS shares (
  id text PRIMARY KEY,
  backtest_id text NOT NULL UNIQUE REFERENCES backtests(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "I want this offer" clicks, while online payment isn't open.
CREATE TABLE IF NOT EXISTS plan_interest (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  plan text NOT NULL,
  billing text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan)
);

-- Markets people would like on the site: one line per account and market.
CREATE TABLE IF NOT EXISTS market_requests (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  market text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market)
);

-- Choices of an account. No row means the defaults.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  test_emails boolean NOT NULL DEFAULT true
);

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

-- Telegram: the chat each account receives its alerts in, and the one-time codes that link them.
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  username text,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
-- The language of the site the chat was linked from ('fr' or 'en'): the bot writes in it.
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';
ALTER TABLE telegram_link_codes ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'fr';

-- Signal alerts: the worker checks each enabled strategy at every candle close.
CREATE TABLE IF NOT EXISTS alerts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  strategy_id text NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  -- Open time of the last candle checked, so each close is evaluated once.
  last_bar bigint,
  last_signal_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, strategy_id)
);
CREATE INDEX IF NOT EXISTS alerts_enabled ON alerts (enabled);

-- Recharges: credits bought (positive), used once the monthly quota is spent (negative), refunded when a backtest fails.
-- The balance is the sum; credits never expire.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL, -- ai | backtest
  delta integer NOT NULL,
  -- pack:<id> for a purchase, admin:<by> for a manual grant, job:<id> or ai:<event id> for a use, refund:<job id>.
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_by_user ON credit_ledger (user_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS credits_one_refund ON credit_ledger (reason) WHERE reason LIKE 'refund:%';
