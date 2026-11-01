#!/bin/sh
set -eu

database_file="${PLANNER_DATA_FILE:-/var/lib/tiles-clash-planner/database.json}"
backup_dir="${PLANNER_BACKUP_DIR:-/var/backups/tiles-clash-planner}"
mkdir -p "$backup_dir"
backup_file="$backup_dir/database-$(date -u +%Y%m%dT%H%M%SZ).json"
cp "$database_file" "$backup_file.tmp"
mv "$backup_file.tmp" "$backup_file"
