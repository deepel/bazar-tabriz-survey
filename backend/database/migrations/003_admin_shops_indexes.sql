-- Admin shop data table (GET /api/admin/shops) filters/sorts on these
-- survey columns. Indexes keep those queries cheap as the table grows to
-- thousands of shops without changing any behavior.

CREATE INDEX IF NOT EXISTS idx_surveys_activity ON surveys (activity);
CREATE INDEX IF NOT EXISTS idx_surveys_building_condition ON surveys (building_condition);
CREATE INDEX IF NOT EXISTS idx_surveys_surveyed_at ON surveys (surveyed_at);