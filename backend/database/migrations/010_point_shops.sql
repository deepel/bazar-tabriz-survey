-- Supplementary point locations are independent from polygon shops/surveys.
CREATE TABLE IF NOT EXISTS point_shops (
  id                  SERIAL PRIMARY KEY,
  point_shop_id       TEXT UNIQUE NOT NULL,
  geometry            JSONB NOT NULL,
  longitude           DOUBLE PRECISION NOT NULL,
  latitude            DOUBLE PRECISION NOT NULL,
  shop_name           TEXT,
  activity            TEXT NOT NULL,
  activity_other      TEXT,
  building_condition  TEXT NOT NULL,
  floor               TEXT NOT NULL CHECK (floor IN ('ground_floor', 'basement', 'floor_1', 'floor_2')),
  instagram_status    TEXT NOT NULL CHECK (instagram_status IN ('has', 'does_not_have', 'not_checked')),
  phone               TEXT,
  notes               TEXT,
  created_by          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT point_shops_geometry_type CHECK (geometry->>'type' = 'Point'),
  CONSTRAINT point_shops_longitude_range CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT point_shops_latitude_range CHECK (latitude BETWEEN -90 AND 90)
);

CREATE INDEX IF NOT EXISTS idx_point_shops_coordinates ON point_shops (longitude, latitude);
CREATE INDEX IF NOT EXISTS idx_point_shops_created_by ON point_shops (created_by);
CREATE INDEX IF NOT EXISTS idx_point_shops_floor ON point_shops (floor);
CREATE INDEX IF NOT EXISTS idx_point_shops_instagram_status ON point_shops (instagram_status);
