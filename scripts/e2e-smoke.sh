#!/usr/bin/env bash
# scripts/e2e-smoke.sh — Automated manual smoke from AGENTS.md
# Usage:
#   bash ./scripts/e2e-smoke.sh                  # default: demo, no billing
#   bash ./scripts/e2e-smoke.sh demo stripe,chargily tanstack-start "eve,i18n" postgres
#   BILLING=polar,chargily,manual FRAMEWORK=tanstack-start FEATURES=eve bash ./scripts/e2e-smoke.sh
#   E2E_INSTALL=1 bash ./scripts/e2e-smoke.sh    # full install + typecheck/lint/build + check
#   E2E_INSTALL=1 E2E_HEALTH=1 bash ./scripts/e2e-smoke.sh  # + dev + /api/health
#
# Env overrides:
#   E2E_TMP        temp parent (default /tmp)
#   E2E_INSTALL    if 1, run the verified dependency bootstrap + full checks
#   E2E_HEALTH     if 1, run dev server + health probe (requires E2E_INSTALL=1)
#   E2E_CLEANUP    if 1, remove the generated gi-test workspace on exit
#   KEEP           if 1, retain the generated workspace even when E2E_CLEANUP=1
#   BILLING, FRAMEWORK, FEATURES, DATABASE override args 2-5
#   PROJECT_NAME   project folder name

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-${1:-demo}}"
BILLING="${BILLING:-${2:-}}"
FRAMEWORK="${FRAMEWORK:-${3:-nextjs}}"
FEATURES="${FEATURES:-${4:-}}"
DATABASE="${DATABASE:-${5:-postgres}}"
TMP_PARENT="${E2E_TMP:-/tmp}"
INSTALL="${E2E_INSTALL:-0}"
HEALTH="${E2E_HEALTH:-0}"
CLEANUP="${E2E_CLEANUP:-0}"
KEEP="${KEEP:-0}"

mkdir -p -- "$TMP_PARENT"
TMP_PARENT="$(cd -- "$TMP_PARENT" && pwd -P)"
ROOT_TMP="$TMP_PARENT/gi-test"

DEV_PID=""
DEV_PGID=""

assert_safe_workspace_path() {
  if [ -z "$TMP_PARENT" ] || [ "$TMP_PARENT" = "/" ]; then
    echo "[e2e-smoke] refusing unsafe temp parent: ${TMP_PARENT:-<empty>}" >&2
    return 1
  fi

  case "$ROOT_TMP" in
    "$TMP_PARENT"/gi-test) ;;
    *)
      echo "[e2e-smoke] refusing unsafe cleanup target: $ROOT_TMP" >&2
      return 1
      ;;
  esac
}

remove_generated_workspace() {
  assert_safe_workspace_path
  rm -rf -- "$ROOT_TMP"
}

dev_group_has_live_processes() {
  local pgid="$1"
  [ -n "$pgid" ] || return 1
  ps -eo pgid=,stat= 2>/dev/null | awk -v group="$pgid" '
    $1 == group && $2 !~ /^Z/ { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}

terminate_dev_process() {
  local pid="$DEV_PID"
  local pgid="$DEV_PGID"

  [ -n "$pid" ] || return 0

  # Clear the globals first so a repeated signal cannot target a reused PID.
  DEV_PID=""
  DEV_PGID=""

  if [ -n "$pgid" ]; then
    kill -TERM -- "-$pgid" 2>/dev/null || true
    for _ in $(seq 1 50); do
      if ! dev_group_has_live_processes "$pgid"; then
        break
      fi
      sleep 0.1
    done
    if dev_group_has_live_processes "$pgid"; then
      kill -KILL -- "-$pgid" 2>/dev/null || true
    fi
  else
    kill -TERM "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    echo "[e2e-smoke] dev process-tree cleanup could not be verified" >&2
    return 1
  fi

  wait "$pid" 2>/dev/null || true
  if dev_group_has_live_processes "$pgid"; then
    echo "[e2e-smoke] dev process group $pgid is still running after cleanup" >&2
    return 1
  fi
}

cleanup() {
  local exit_code=$?
  local cleanup_code=0

  trap - EXIT
  trap '' INT TERM
  terminate_dev_process || cleanup_code=$?

  if [ "$CLEANUP" = "1" ] && [ "$KEEP" != "1" ]; then
    remove_generated_workspace || cleanup_code=$?
  fi

  if [ "$exit_code" -eq 0 ] && [ "$cleanup_code" -ne 0 ]; then
    exit_code=$cleanup_code
  fi
  trap - INT TERM
  exit "$exit_code"
}

assert_safe_workspace_path
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

CLI="./dist/cli.js"

if [ ! -f "$CLI" ]; then
  echo "[e2e-smoke] dist/cli.js missing — building..."
  bun run build
fi

remove_generated_workspace
mkdir -p "$ROOT_TMP"

ARGS=()
[ -n "$BILLING" ]   && ARGS+=(--billing "$BILLING")
[ -n "$FRAMEWORK" ] && ARGS+=(--framework "$FRAMEWORK")
[ -n "$FEATURES" ]  && ARGS+=(--features "$FEATURES")
[ -n "$DATABASE" ]  && ARGS+=(--database "$DATABASE")

echo "[e2e-smoke] Creating $PROJECT_NAME in $ROOT_TMP with:"
echo "  framework=$FRAMEWORK billing=${BILLING:-none} features=${FEATURES:-none} database=$DATABASE"
echo ""

bun "$CLI" create "$PROJECT_NAME" \
  --cwd "$ROOT_TMP" \
  --no-install \
  --force \
  --json \
  "${ARGS[@]}"

PROJECT_ROOT="$ROOT_TMP/$PROJECT_NAME"

echo ""
echo "[e2e-smoke] Verifying file tree..."
for f in "package.json" "turbo.json" "bunfig.toml" ".env.example" ".env.local" "apps/web/package.json" "packages/auth/src/index.ts"; do
  if [ ! -f "$PROJECT_ROOT/$f" ]; then
    echo "  MISSING: $f"
    exit 1
  fi
done
echo "  minimal file tree OK"

echo "[e2e-smoke] Verifying capability-scoped turbo.json globalEnv..."
bun ./scripts/verify-generated-env.ts "$PROJECT_ROOT"

echo "[e2e-smoke] Checking ghostinit check (analyzeProject) — no HIGH/BLOCKER..."
bun -e "
  import { analyzeProject } from './src/lib/architecture/index.ts';
  const root = process.argv[1];
  const findings = await analyzeProject(root);
  const blocking = findings.filter(f => f.severity === 'HIGH' || f.severity === 'BLOCKER');
  console.log('  findings:', findings.length, 'blocking:', blocking.length);
  if (blocking.length > 0) {
    console.error(JSON.stringify(blocking, null, 2));
    process.exit(1);
  }
" "$PROJECT_ROOT"

echo "[e2e-smoke] Checking packaged CLI architecture command..."
bun "$CLI" check --cwd "$PROJECT_ROOT" --json

if [ "$INSTALL" = "1" ]; then
  echo ""
  echo "[e2e-smoke] E2E_INSTALL=1 — running verified dependency bootstrap + checks (heavy)"
  cd "$PROJECT_ROOT"
  bun run install:bootstrap
  echo "[e2e-smoke] dependency audit"
  bun run audit:dependencies
  echo "[e2e-smoke] format:check"
  bun run format:check
  echo "[e2e-smoke] lint"
  bun run lint
  echo "[e2e-smoke] typecheck"
  bun run typecheck
  echo "[e2e-smoke] build"
  bun run build
  echo "[e2e-smoke] full build OK"

  if [ "$HEALTH" = "1" ]; then
    echo ""
    echo "[e2e-smoke] E2E_HEALTH=1 — dev + /api/health probe"
    if ! command -v setsid > /dev/null 2>&1; then
      echo "  setsid is required for process-group cleanup" >&2
      exit 1
    fi

    setsid bun run dev &
    DEV_PID=$!
    DEV_PGID_CANDIDATE="$(ps -o pgid= -p "$DEV_PID" 2>/dev/null | tr -d '[:space:]' || true)"
    SHELL_PGID="$(ps -o pgid= -p "$$" 2>/dev/null | tr -d '[:space:]' || true)"
    case "$DEV_PGID_CANDIDATE" in
      "" | *[!0-9]*)
        echo "  dev server did not expose a safe process group" >&2
        exit 1
        ;;
    esac
    if [ "$DEV_PGID_CANDIDATE" -le 1 ] || [ "$DEV_PGID_CANDIDATE" = "$SHELL_PGID" ]; then
      echo "  dev server did not start in an isolated process group" >&2
      exit 1
    fi
    DEV_PGID="$DEV_PGID_CANDIDATE"
    echo "  dev PID $DEV_PID"

    READY=0
    for i in $(seq 1 90); do
      if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "  health ready after ${i}s"
        curl -s http://localhost:3000/api/health | head -c 500
        echo ""
        READY=1
        break
      fi
      sleep 1
      if ! kill -0 "$DEV_PID" 2>/dev/null; then
        echo "  dev server died early"
        wait "$DEV_PID" || true
        exit 1
      fi
    done

    terminate_dev_process

    if [ "$READY" != "1" ]; then
      echo "  health probe timeout"
      exit 1
    fi
    echo "  health check OK"
  fi
fi

echo ""
echo "[e2e-smoke] SUCCESS: $PROJECT_ROOT"
echo "  To keep:         KEEP=1 E2E_CLEANUP=1 bash ./scripts/e2e-smoke.sh"
echo "  Auto-clean:      E2E_CLEANUP=1 bash ./scripts/e2e-smoke.sh"
echo "  Billing profile: BILLING=polar,chargily,manual FRAMEWORK=tanstack-start FEATURES=eve E2E_INSTALL=1 bash ./scripts/e2e-smoke.sh"
