#!/bin/sh
set -e

echo "[entrypoint] applying database migrations (never a dev reset/seed)"
node dist/database/migrate.js

echo "[entrypoint] starting backend"
exec "$@"