#!/usr/bin/env bash
# Runs one branch's production build with a copy of bench-anon.dump, next to the others. See README.md.
#
#   ./stack.sh dump [db container]                       bench-anon.dump: a running database (default: the prisma
#                                                        one), anonymized before it leaves Docker
#   ./stack.sh up <name> <git ref> <port prefix> <pg port>   build, start, restore, wait for PowerSync
#   ./stack.sh up <name> <git ref> <port prefix> <pg port> <name> ...   several stacks in parallel
#   ./stack.sh down <name>                               stop, delete its volumes, worktree and image
#
# Settings and secrets come from SOURCE_ENV (default envs/.env.prisma).
set -euo pipefail
export MSYS_NO_PATHCONV=1

winpwd() { pwd -W 2>/dev/null || pwd; }
DIR=$(cd "$(dirname "$0")" && winpwd)
ROOT=$(cd "$DIR/.." && winpwd)
SOURCE_ENV=${SOURCE_ENV:-$ROOT/envs/.env.prisma}
WORKTREES=${BENCH_WORKTREES:-$(cd "${TMPDIR:-/tmp}" && winpwd)/resanorp-bench}

get() { grep -E "^$1 *=" "$2" | sed -E 's/^[^=]*= *"?([^"]*)"?.*/\1/'; }
DB_USER=$(get POSTGRES_USER "$SOURCE_ENV")
DB_NAME=$(get POSTGRES_DB "$SOURCE_ENV")

worktree() {
  [ -d "$WORKTREES/$1" ] || git -C "$ROOT" worktree add --detach "$WORKTREES/$1" "$2"
}

compose() {
  local name=$1
  shift
  docker compose -p "resanorp-bench-$name" --project-directory "$WORKTREES/$name" \
    -f "$WORKTREES/$name/docker/docker-compose.base.yml" -f "$DIR/compose.bench.yml" \
    --env-file "$DIR/stacks/$name/.env" --profile bench "$@"
}

case ${1:-} in
  dump)
    source=${2:-resanorp-prisma-db-1}
    container=resanorp-bench-anonymize
    docker run -d --name "$container" -e POSTGRES_PASSWORD=anonymize -e POSTGRES_DB=bench postgres:16 > /dev/null
    trap 'docker rm -f "$container" > /dev/null' EXIT
    # The image's entrypoint starts a temporary server first: the second ready line is the real one
    until [ "$(docker logs "$container" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ]; do sleep 1; done
    # Piped from one container to the other, so the real data is never written to a file. The dump also creates the
    # public schema, which already exists: pg_restore's one expected error
    docker exec "$source" pg_dump -U "$DB_USER" -d "$DB_NAME" -n public --no-owner --no-privileges --no-publications -Fc \
      | docker exec -i "$container" pg_restore -U postgres -d bench --no-owner 2> /dev/null || true
    docker cp "$DIR/anonymize.sql" "$container:/tmp/anonymize.sql"
    docker exec "$container" psql -U postgres -d bench -q -f /tmp/anonymize.sql
    docker exec "$container" pg_dump -U postgres -d bench -n public --no-owner --no-privileges --no-publications -Fc \
      -f /tmp/bench-anon.dump
    docker cp "$container:/tmp/bench-anon.dump" "$DIR/bench-anon.dump"
    docker exec "$container" psql -U postgres -d bench -Atc \
      "analyze; select 'rows: ' || sum(n_live_tup) from pg_stat_user_tables where schemaname = 'public'"
    ;;

  up)
    if [ $# -gt 5 ]; then
      shift
      [ $(($# % 4)) -eq 0 ] || { echo "up takes <name> <git ref> <port prefix> <pg port> per stack" >&2; exit 1; }
      # One at a time: concurrent worktree adds race on the repository's locks
      for ((i = 1; i <= $#; i += 4)); do worktree "${!i}" "${@:i+1:1}"; done
      pids=()
      while [ $# -gt 0 ]; do
        ("$0" up "$1" "$2" "$3" "$4" 2>&1 | sed -u "s/^/[$1] /") &
        pids+=($!)
        shift 4
      done
      failed=0
      for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
      exit $failed
    fi
    name=$2 ref=$3 port=$4 pg=$5
    stack_dir="$DIR/stacks/$name"
    # Volumes and networks are named after VITE_ENV_NAME, so each stack needs its own or they share a database
    mkdir -p "$stack_dir/env/caddy" "$stack_dir/env/LOGS"
    sed -E \
      -e "s|^NODE_ENV.*|NODE_ENV = \"production\"|" \
      -e "s|^VITE_ENV_NAME.*|VITE_ENV_NAME = \"bench-$name\"|" \
      -e "s|^VITE_CADDY_HTTPS_PORT.*|VITE_CADDY_HTTPS_PORT = ${port}443|" \
      -e "s|^POSTGRES_PORT.*|POSTGRES_PORT = $pg|" \
      -e "s#@(localhost|127\.0\.0\.1):[0-9]+/#@\1:$pg/#" \
      -e "s|^ENV_PATH.*|ENV_PATH = \"$stack_dir/env\"|" \
      "$SOURCE_ENV" > "$stack_dir/.env"
    # The Electric commits' compose files also publish Caddy's HTTP port, which the env files no longer set
    printf 'VITE_CADDY_HTTP_PORT = %s080\nVITE_ELECTRIC_PORT = %s000\nBENCH_ENV_FILE = "%s"\nBENCH_IMAGE = "resanorp-app:bench-%s"\nAPP_IMAGE = "resanorp-app:bench-%s"\n' \
      "$port" "$port" "$stack_dir/.env" "$name" "$name" >> "$stack_dir/.env"

    worktree "$name" "$ref"
    docker build -q -f "$WORKTREES/$name/docker/Dockerfile" --target production -t "resanorp-app:bench-$name" \
      "$WORKTREES/$name"

    compose "$name" up -d --wait db
    db="resanorp-bench-$name-db-1"
    docker cp "$DIR/bench-anon.dump" "$db:/tmp/bench.dump"
    # The dump also creates the public schema, which already exists: that one error is expected
    docker exec "$db" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner /tmp/bench.dump || true
    docker exec "$db" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
      "analyze; select 'rows restored: ' || sum(n_live_tup) from pg_stat_user_tables where schemaname = 'public'"
    compose "$name" up -d --wait

    # Measuring before PowerSync has snapshotted every table would time its replication
    if docker inspect "resanorp-bench-$name-powersync-1" > /dev/null 2>&1; then
      until docker logs "resanorp-bench-$name-powersync-1" 2>&1 | grep -q "Activated new replication stream"; do
        sleep 3
      done
      docker exec "$db" psql -U "$DB_USER" -d powersync_storage -Atc \
        "select 'PowerSync operations: ' || count(*) from powersync.bucket_data"
    fi
    echo "$name: https://$(get VITE_HOST "$stack_dir/.env"):${port}443, Caddy container resanorp-bench-$name-caddy-1"
    ;;

  down)
    name=$2
    compose "$name" down -v
    git -C "$ROOT" worktree remove --force "$WORKTREES/$name"
    docker rmi "resanorp-app:bench-$name"
    rm -rf "$DIR/stacks/$name"
    ;;

  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
