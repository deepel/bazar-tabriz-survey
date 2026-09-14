-- Internal app messaging between admin and surveyors.
-- One row per recipient; a broadcast fan-out creates one row per surveyor so
-- per-user read state is trivial to track. No external services involved.

CREATE TABLE IF NOT EXISTS messages (
  id           SERIAL PRIMARY KEY,
  sender_id    INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages (recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_id);