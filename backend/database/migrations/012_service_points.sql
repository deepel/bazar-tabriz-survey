-- Supplementary bazaar facilities are independent from both polygon shops and
-- supplementary business points. service_type is validated by the service
-- layer (centralized options) rather than a DB enum/check so new service types
-- can be added without another migration.
CREATE TABLE IF NOT EXISTS service_points (
  id               SERIAL PRIMARY KEY,
  service_point_id TEXT UNIQUE NOT NULL,
  geometry         JSONB NOT NULL,
  longitude        DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude         DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  service_type     TEXT NOT NULL,
  name             TEXT,
  notes            TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_points_geometry_point CHECK (
    geometry->>'type' = 'Point'
    AND jsonb_typeof(geometry->'coordinates') = 'array'
    AND jsonb_array_length(geometry->'coordinates') = 2
  )
);

CREATE INDEX IF NOT EXISTS service_points_coordinates_idx
  ON service_points (longitude, latitude);
CREATE INDEX IF NOT EXISTS service_points_type_idx
  ON service_points (service_type);
CREATE INDEX IF NOT EXISTS service_points_created_by_idx
  ON service_points (created_by);
