-- Independent historic bazaar entrances. Doors are geographic records, not
-- shops or services, and intentionally have no relation to polygon shops.
CREATE TABLE IF NOT EXISTS door_points (
  id             SERIAL PRIMARY KEY,
  door_point_id  TEXT UNIQUE NOT NULL,
  geometry       JSONB NOT NULL,
  longitude      DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude       DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  name           TEXT NOT NULL,
  opening_time   TIME NOT NULL,
  closing_time   TIME NOT NULL,
  notes          TEXT,
  created_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT door_points_geometry_point CHECK (
    geometry->>'type' = 'Point'
    AND jsonb_typeof(geometry->'coordinates') = 'array'
    AND jsonb_array_length(geometry->'coordinates') = 2
  )
);

CREATE INDEX IF NOT EXISTS door_points_coordinates_idx
  ON door_points (longitude, latitude);
CREATE INDEX IF NOT EXISTS door_points_name_idx
  ON door_points (name);
CREATE INDEX IF NOT EXISTS door_points_created_by_idx
  ON door_points (created_by);
