#!/usr/bin/env bash
# Runs every migration and the database tests on a throwaway local Postgres 15+ (PGHOST/PGUSER from the environment).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=renewly_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/db/stub.sql
for f in supabase/migrations/*.sql; do
  case "$f" in *storage*) continue ;; esac   # plain Postgres has no storage schema; tested on Supabase
  psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"
done
for t in tests/db/[0-9]*.sql; do
  echo "· $t"
  psql -q -o /dev/null -v ON_ERROR_STOP=1 -d $DB -f "$t"
done
echo "Database tests passed."
