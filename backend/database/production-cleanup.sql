-- ============================================================================
-- PRODUCTION DATA CLEAN-UP (controlled, NOT a schema reset)
-- ============================================================================
-- Purpose: remove ONLY development/test operational data so a production
-- deployment starts clean (zero test surveys, point data, assignments,
-- previews, shops, messages, logs, dev users, app_meta state).
--
-- This script NEVER:
--   * drops the schema or any table
--   * runs a destructive reset (DROP SCHEMA / DROP DATABASE)
--   * touches schema_migrations
--   * touches gis_layers / gis_render_settings (real GIS configuration)
--   * creates or seeds any user/password
--
-- Safe to run multiple times (idempotent: rows are already gone).
-- It is normally executed through production-cleanup.ts which wraps it in a
-- transaction and prints a before/after summary.
-- ============================================================================

-- Assignment data (rolls/previews/members/shops) first — these reference
-- users and shops, so they must go before either parent table.
DELETE FROM assignment_shops;
DELETE FROM assignment_members;
DELETE FROM assignment_previews;
DELETE FROM assignments;

-- Survey records reference shops and users.
DELETE FROM surveys;

-- Point systems reference users.
DELETE FROM point_shops;
DELETE FROM service_points;
DELETE FROM door_points;

-- Internal messages reference users.
DELETE FROM messages;

-- Durable operational logs (development noise only).
DELETE FROM system_logs;

-- Shop data: in the development database every shop came from test fixtures
-- (shops-test1 / shops-update1 / e2e-add / shops_seed). A clean production
-- database starts at zero shops; the real GIS shop export is imported later
-- through the normal import-review flow.
DELETE FROM shops;

-- Internal state (e.g. last_import marker pointing at a test fixture).
DELETE FROM app_meta;

-- Development users (admin/jafari/moradi/kamali and their dev passwords).
-- Production users are created afterwards via the interactive bootstrap CLI
-- (database/bootstrap-user.ts) — never through this script.
DELETE FROM users;