-- Contiguous survey assignments. Shops and surveys remain the source of truth;
-- assignments only reserve eligible shops and keep a permanent work history.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS assignment_color TEXT NOT NULL DEFAULT '#2563eb';

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY id) AS position
  FROM users
)
UPDATE users AS u
SET assignment_color = (ARRAY[
  '#2563eb', '#7c3aed', '#0891b2', '#d97706',
  '#db2777', '#4f46e5', '#0f766e', '#64748b'
])[(ranked.position - 1) % 8 + 1]
FROM ranked
WHERE ranked.id = u.id;

CREATE TABLE IF NOT EXISTS assignments (
  id              TEXT PRIMARY KEY,
  requested_count INTEGER NOT NULL CHECK (requested_count > 0),
  actual_count    INTEGER NOT NULL CHECK (actual_count >= 0),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  primary_color   TEXT NOT NULL,
  color_snapshot  JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'cancelled', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assignment_members (
  assignment_id     TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  username_snapshot TEXT NOT NULL,
  color_snapshot    TEXT NOT NULL,
  initials_snapshot TEXT NOT NULL,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignment_shops (
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  shop_id       TEXT NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, shop_id)
);

CREATE TABLE IF NOT EXISTS assignment_previews (
  id              TEXT PRIMARY KEY,
  created_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_count INTEGER NOT NULL CHECK (requested_count > 0),
  member_ids      INTEGER[] NOT NULL,
  shop_ids        TEXT[] NOT NULL,
  color_snapshot  JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'superseded', 'confirmed', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_members_user ON assignment_members (user_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_shops_shop ON assignment_shops (shop_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_previews_owner ON assignment_previews (created_by, status, created_at DESC);
