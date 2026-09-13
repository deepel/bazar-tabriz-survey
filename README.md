# Bazar Tabriz — Field Survey Management

Mobile-first web application for surveying shops in the historic covered bazaar of Tabriz, Iran.
It combines a live map, per-shop survey capture with GPS, an admin panel, and GeoJSON import/export in one simple app.

**GIS source data:** AutoCAD-exported GeoJSON files from
[deepel/bazar-tabriz-map-josn](https://github.com/deepel/bazar-tabriz-map-josn)
(branch `main`, folder `bazar tabriz/tests`, files `shops test.geojson` and `shops test1.geojson`).

---

## Architecture

```
Frontend (React + Vite + Tailwind + Leaflet)   -- REST/JSON + cookie session -->   Backend (Fastify + Node)
                                                                                          |
                                                                                          v
                                                                PostgreSQL  (the source of truth)
                                                                                          ^
                                        GitHub (optional) = raw backup only
```

- **PostgreSQL is the single source of truth.** GIS files are only *imported into* the database;
  survey data is never derived from a file.
- The surveyor phone, the admin panel and the GeoJSON export all read from the same database.
- The map is rendered with Leaflet and shops are loaded **per viewport** (bounding box), not all
  at once — important for performance in a dense bazaar.

### Data flow

1. Admin uploads a GeoJSON file (AutoCAD export, usually `EPSG:32638`).
2. A preview computes the planned changes with **no database writes**.
3. On confirmation, the whole import runs inside **one transaction**; any error rolls everything back.
4. The surveyor picks a shop on the map and saves its data; the GPS fix is captured server-side.
5. Data is stored in PostgreSQL and immediately visible to every other user.

---

## Identity and non-destructive merge

A known problem was observed in the source files:

- `EntityHandle` (the AutoCAD id) is unique *within* a file but **not stable across files** —
  e.g. handle `6E` points to one shop in one file and to a shop ~30 m away in another.

Therefore **the stable shop id is a SHA-256 fingerprint of the final WGS84 geometry**, and
`EntityHandle` is only used as a *secondary* matching fallback within
`SHOP_MATCH_DISTANCE` (default 15 m):

- fingerprint matches an existing shop → `unchanged`
- otherwise same `EntityHandle` with centroid distance ≤ 15 m → `geometry_update` (same shop, new geometry)
- otherwise → `new` shop

Guarantees:

- **Partial import**: importing only 50 of 100 existing shops deletes nothing.
- **Geometry updates never remove survey data**; a survey stays attached to its shop.

Implemented in `backend/src/services/geojson.service.ts` and `backend/src/services/import.service.ts`.

---

## Getting started

### Prerequisites

- Node.js >= 20
- PostgreSQL 14+ (or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Database

**Option A — Docker (recommended):**

```bash
docker compose up -d
```

Starts PostgreSQL 16 on port 5432 with user/password `survey`/`survey` and database `bazar_survey`.

**Option B — local PostgreSQL:**

```sql
-- run as a superuser:
CREATE ROLE survey LOGIN PASSWORD 'survey';
GRANT ALL PRIVILEGES ON DATABASE bazar_survey TO survey;
CREATE DATABASE bazar_survey OWNER survey;
```

### 3. Environment file

```bash
cp .env.example .env
```

Edit the database URL and, optionally, the `GITHUB_*` values. A GitHub token is optional.

### 4. Migrate & seed

```bash
npm run db:migrate
npm run db:seed
```

The seed creates development users and imports the 125 sample shops from the source GIS file.

**Development users (testing only):**

| username | role | password |
|---|---|---|
| admin | admin | admin123 |
| jafari | surveyor | jafari123 |
| moradi | surveyor | moradi123 |
| kamali | surveyor | kamali123 |

> Change these in `backend/database/seed.ts` before any production use.

### 5. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:4000   (health check: `GET /api/health`)

### 6. Production build

```bash
npm run build
npm run start     # built backend
npm run preview   # built frontend
```

---

## Scripts

| command | description |
|---|---|
| `npm run dev` | run backend + frontend together |
| `npm run build` | compile TypeScript + Vite build |
| `npm run typecheck` | type-check both workspaces |
| `npm test` | backend integration tests (isolated `bazar_survey_test` DB) |
| `npm run test:frontend` | frontend unit tests |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed users + sample shops |
| `npm run db:reset` | drop schema → migrate → seed |

---

## Roles

- **Admin**: user management, GeoJSON import/export, GitHub sync, stats.
- **Surveyor**: browse the map and save shop surveys.

Security: sessions are `HttpOnly` cookies carrying a short-lived JWT; passwords are bcrypt-hashed;
file size is capped; activity/condition lists are validated server-side.

---

## API summary

| method | path | access | description |
|---|---|---|---|
| POST | `/api/auth/login` | public | login |
| GET | `/api/auth/me` | session | current user |
| POST | `/api/auth/logout` | session | logout |
| GET | `/api/stats` | any | totals / surveyed / progress |
| GET | `/api/options` | any | activity & condition lists, GPS warning distance |
| GET | `/api/shops?bbMinLon=..&bbMinLat=..&bbMaxLon=..&bbMaxLat=..&limit=..` | any | shops inside a bbox |
| POST | `/api/surveys` | any | create/update a survey (upsert) |
| GET | `/api/surveys` | any | list surveys |
| POST | `/api/admin/geojson/import/preview` | admin | import preview |
| POST | `/api/admin/geojson/import/apply` | admin | transactional apply |
| GET | `/api/admin/geojson/export?download=1` | admin | GeoJSON export (WGS84) |
| POST | `/api/admin/github/sync` | admin | manual GitHub sync |
| GET | `/api/admin/github/status` | admin | sync status |
| GET/POST/PATCH | `/api/admin/users...` | admin | user management |

### Survey payload

```jsonc
{
  "shop_id": "<stable shop id>",
  "shop_name": "Sample shop",
  "activity": "فرش",               // one of the configured list; "سایر" requires activity_other
  "activity_other": null,
  "building_condition": "سالم",
  "survey_lat": 38.070123,
  "survey_lon": 46.290456
}
```

---

## GPS & distance

- The phone GPS is tracked with `watchPosition` (high accuracy); a blue dot is shown on the map.
- The distance from the surveyor to the shop centroid is computed with Turf.
- If the distance exceeds `GPS_WARNING_DISTANCE` (default 30 m) an orange warning is shown,
  but saving is **never blocked**.

---

## GitHub backup (optional)

- The token is only read server-side from `GITHUB_*` env vars, never sent to the browser.
- Auto-sync runs after every `GITHUB_SYNC_INTERVAL` successful surveys (0 disables it).
- A failed sync never affects survey saving; the last error/state is stored in `github.lastState`.
- The file is pushed with `PUT /repos/.../contents/...` using the current SHA (idempotent).
  For production, GitHub Actions + scheduled export is recommended (out of scope for this MVP).

---

## Tests

- **Backend (integration):** run against a dedicated `bazar_survey_test` database that is rebuilt on
  every run. Requires a running PostgreSQL server (same as dev).
- Key scenarios:
  - TEST A — partial merge without losing surveys (2000 → 2300 with 1500 surveys).
  - TEST B — geometry change keeps shop identity and its survey.
  - TEST C — subset import deletes nothing.
  - TEST D — failed transaction rolls back completely.
  - plus auth, survey upsert, stats, export and GitHub behavior.
- **Frontend (unit):** `distance` helpers (meters + Persian number formatting).

```bash
npm test
npm run test:frontend
```

---

## MVP limitations (intentional)

- No photos.
- `MultiPolygon` geometries are supported, but the source files are mostly `Polygon`.
- GitHub sync is one-way to the repository; the database remains the source of truth.
- No SSO/LDAP; users are defined directly in the database.

---

## Repository layout

```
bazar-tabriz-survey/
├─ backend/
│  ├─ database/
│  │  ├─ migrations/001_init.sql
│  │  ├─ migrate.ts / seed.ts / reset.ts
│  │  └─ seed-data/shops_seed.geojson
│  └─ src/
│     ├─ config.ts / logger.ts / db.ts / app.ts / index.ts
│     ├─ middleware/auth.ts
│     ├─ routes/          (auth, shops, surveys, stats, admin/...)
│     ├─ services/        (auth, import, export, geojson, survey, github)
│     └─ tests/           (integration tests)
├─ frontend/
│  └─ src/
│     ├─ pages/           (Login, SurveyMap, AdminDashboard, ImportGeoJSON)
│     ├─ components/      (MapView, ShopLayer, UserLocation, SurveyForm, ...)
│     ├─ hooks/           (useAuth, useGeolocation)
│     ├─ api/client.ts
│     └─ utils/           (distance, format)
└─ docker-compose.yml / .env.example / package.json
```