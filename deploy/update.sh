#!/bin/sh
# Met à jour le serveur avec la dernière version du dépôt, sans perdre les données (volumes conservés).
set -e
cd "$(dirname "$0")"
git pull --ff-only
if grep -q '^DATABASE_URL=postgresql://multicord:.*@postgres:' .env 2>/dev/null; then profile="--profile local-db"; else profile=""; fi
docker compose $profile up -d --build
docker image prune -f >/dev/null
docker compose ps
