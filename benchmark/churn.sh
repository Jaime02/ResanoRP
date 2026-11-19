#!/usr/bin/env bash
# ./churn.sh <stack name> <rounds>
# Each round changes every row of the two biggest tables and restores it: the data ends identical, but PowerSync keeps
# two operations per row and round until it compacts. Used to measure what compaction is worth, see README.md
set -euo pipefail
export MSYS_NO_PATHCONV=1
DIR=$(cd "$(dirname "$0")" && pwd)
get() { grep -E "^$1 *=" "$DIR/stacks/$2/.env" | sed -E 's/^[^=]*= *"?([^"]*)"?.*/\1/'; }
DB="resanorp-bench-$1-db-1"
DB_USER=$(get POSTGRES_USER "$1")
DB_NAME=$(get POSTGRES_DB "$1")

for _ in $(seq 1 "$2"); do
  docker exec "$DB" psql -U "$DB_USER" -d "$DB_NAME" -qc '
    UPDATE sell_order_line SET "pendingQuantity" = "pendingQuantity" + 1;
    UPDATE sell_order_line SET "pendingQuantity" = "pendingQuantity" - 1;
    UPDATE delivery_note_line SET quantity = quantity + 1;
    UPDATE delivery_note_line SET quantity = quantity - 1;'
done

# Until replication has stored every change
previous=-1
while :; do
  ops=$(docker exec "$DB" psql -U "$DB_USER" -d powersync_storage -Atc "select count(*) from powersync.bucket_data")
  [ "$ops" = "$previous" ] && break
  previous=$ops
  sleep 5
done
echo "PowerSync operations: $ops"
