-- Historical bazaar GIS reference layers.
-- One row per reference layer that can be shown on the survey map. The admin
-- manages the display name, on/off state and the HTTPS source URL for each
-- layer; surveyors only receive the (read-only) list so their map can display
-- the layers. `cache_version` is bumped by the admin's "refresh" action to
-- force clients to re-download that layer even when the URL did not change.

CREATE TABLE IF NOT EXISTS gis_layers (
  layer_key     TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  source_url    TEXT NOT NULL,
  order_index   INTEGER NOT NULL DEFAULT 0,
  cache_version INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gis_layers (layer_key, display_name, enabled, source_url, order_index)
VALUES
  ('bazar-area', 'محدوده بازار', TRUE, 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/bazar%20arse%20zone%20.geojson', 0),
  ('buildings', 'ساختمان‌ها', TRUE, 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/buldings.geojson', 10),
  ('lines', 'خطوط', TRUE, 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/lines.geojson', 20),
  ('ways', 'راه‌ها', TRUE, 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/ways.geojson', 30)
ON CONFLICT (layer_key) DO NOTHING;