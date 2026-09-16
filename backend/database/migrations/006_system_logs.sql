-- Durable, searchable operational logs. Passwords and tokens are never stored
-- here; logger sanitizes detail values before inserting them.
CREATE TABLE IF NOT EXISTS system_logs (
  id         BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level      TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event      TEXT NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs (level);
CREATE INDEX IF NOT EXISTS idx_system_logs_event ON system_logs (event);
