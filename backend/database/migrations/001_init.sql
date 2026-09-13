-- Bazar Tabriz Survey - initial schema
-- The PostgreSQL database is the source of truth. GeoJSON files are only
-- imported into it; survey data is never derived from a GIS file.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'surveyor')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shops are the GIS layer, always stored in EPSG:4326 (WGS84).
-- shop_id is an immutable stable identifier assigned on first import.
-- geom_fingerprint is a SHA-256 of the current geometry and is used for fast
-- non-destructive merge matching.
CREATE TABLE IF NOT EXISTS shops (
  id                  SERIAL PRIMARY KEY,
  shop_id             TEXT UNIQUE NOT NULL,
  geometry            JSONB NOT NULL,          -- GeoJSON geometry, WGS84
  geom_fingerprint    TEXT UNIQUE NOT NULL,    -- SHA-256 over canonical geometry
  entity_handle       TEXT,                    -- AutoCAD handle of the source feature
  centroid_lat        DOUBLE PRECISION NOT NULL,
  centroid_lon        DOUBLE PRECISION NOT NULL,
  min_lon             DOUBLE PRECISION NOT NULL,
  min_lat             DOUBLE PRECISION NOT NULL,
  max_lon             DOUBLE PRECISION NOT NULL,
  max_lat             DOUBLE PRECISION NOT NULL,
  original_properties JSONB NOT NULL DEFAULT '{}',
  source_file         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shops_source_file_length CHECK (char_length(source_file) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_shops_entity_handle ON shops (entity_handle);
CREATE INDEX IF NOT EXISTS idx_shops_bbox ON shops (min_lon, max_lon, min_lat, max_lat);
CREATE INDEX IF NOT EXISTS idx_shops_fingerprint ON shops (geom_fingerprint);

-- One current survey per shop (upserted on re-submission).
CREATE TABLE IF NOT EXISTS surveys (
  id                 SERIAL PRIMARY KEY,
  shop_id            TEXT UNIQUE NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  shop_name          TEXT,
  activity           TEXT,
  activity_other     TEXT,
  building_condition TEXT,
  surveyor_id        INTEGER NOT NULL REFERENCES users(id),
  surveyed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  survey_lat         DOUBLE PRECISION,
  survey_lon         DOUBLE PRECISION,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_shop_id ON surveys (shop_id);
CREATE INDEX IF NOT EXISTS idx_surveys_surveyor_id ON surveys (surveyor_id);

-- Small key/value store for internal state (GitHub sync counters, last import).
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);