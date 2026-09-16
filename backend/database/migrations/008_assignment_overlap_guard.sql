-- Keep the application-level advisory lock and add a database guard so a
-- future writer cannot reserve a shop in two active assignments.
CREATE OR REPLACE FUNCTION prevent_active_assignment_shop_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM assignment_shops existing
    JOIN assignments a ON a.id = existing.assignment_id
    WHERE existing.shop_id = NEW.shop_id
      AND existing.assignment_id <> NEW.assignment_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_assignment_overlap' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_shop_overlap_guard ON assignment_shops;
CREATE TRIGGER assignment_shop_overlap_guard
BEFORE INSERT ON assignment_shops
FOR EACH ROW EXECUTE FUNCTION prevent_active_assignment_shop_overlap();

CREATE OR REPLACE FUNCTION prevent_reactivating_overlapping_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status <> 'active' AND EXISTS (
    SELECT 1
    FROM assignment_shops mine
    JOIN assignment_shops other ON other.shop_id = mine.shop_id
    JOIN assignments a ON a.id = other.assignment_id
    WHERE mine.assignment_id = NEW.id
      AND other.assignment_id <> NEW.id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_assignment_overlap' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_status_overlap_guard ON assignments;
CREATE TRIGGER assignment_status_overlap_guard
BEFORE UPDATE OF status ON assignments
FOR EACH ROW EXECUTE FUNCTION prevent_reactivating_overlapping_assignment();
