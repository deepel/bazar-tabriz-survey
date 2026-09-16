-- A team assignment remains one compact area, but its shops can be painted
-- with each selected member's snapshot color so every team member is visible
-- on the map. Existing assignments keep the primary color fallback.
ALTER TABLE assignment_shops
  ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_assignment_shops_member
  ON assignment_shops (assignment_id, member_id);
