-- Shared survey fields. Defaults preserve existing polygon survey rows and API clients.
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS floor TEXT NOT NULL DEFAULT 'ground_floor',
  ADD COLUMN IF NOT EXISTS instagram_status TEXT NOT NULL DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE surveys
  DROP CONSTRAINT IF EXISTS surveys_floor_check,
  ADD CONSTRAINT surveys_floor_check CHECK (floor IN ('ground_floor', 'basement', 'floor_1', 'floor_2'));

ALTER TABLE surveys
  DROP CONSTRAINT IF EXISTS surveys_instagram_status_check,
  ADD CONSTRAINT surveys_instagram_status_check CHECK (instagram_status IN ('has', 'does_not_have', 'not_checked'));

CREATE INDEX IF NOT EXISTS idx_surveys_floor ON surveys (floor);
CREATE INDEX IF NOT EXISTS idx_surveys_instagram_status ON surveys (instagram_status);
