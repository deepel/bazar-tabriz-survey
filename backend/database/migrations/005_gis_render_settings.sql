-- Render settings for display-only reference layers. Shop data is deliberately
-- not part of this pipeline: shops remain interactive GeoJSON.
ALTER TABLE gis_layers
  ADD COLUMN IF NOT EXISTS min_zoom INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detail_zoom INTEGER NOT NULL DEFAULT 19;

UPDATE gis_layers
SET min_zoom = CASE layer_key
  WHEN 'lines' THEN 19
  WHEN 'buildings' THEN 17
  WHEN 'ways' THEN 18
  ELSE 0
END,
detail_zoom = CASE layer_key
  WHEN 'lines' THEN 20
  WHEN 'buildings' THEN 19
  WHEN 'ways' THEN 20
  ELSE 19
END
WHERE min_zoom = 0;
