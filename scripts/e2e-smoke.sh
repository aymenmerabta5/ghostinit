#!/usr/bin/env bash
# scripts/e2e-smoke.sh — Automated manual smoke from AGENTS.md
# Usage:
#   ./scripts/e2e-smoke.sh                  # default: demo, no billing
#   ./scripts/e2e-smoke.sh demo stripe,chargily tanstack-start "eve,i18n" postgres
#   BILLING=all FRAMEWORK=tanstack-start FEATURES=eve ./scripts/e2e-smoke.sh
#   E2E_INSTALL=1 ./scripts/e2e-smoke.sh    # full install + typecheck/lint/build + check
#   E2E_INSTALL=1 E2E_HEALTH=1 ./scripts/e2e-smoke.sh  # + dev + /api/health
#
# Env overrides:
#   E2E_TMP        temp parent (default /tmp)
#   E2E_INSTALL    if 1, run bun install + full checks
#   E2E_HEALTH     if 1, run dev server + health probe (requires E2E_INSTALL=1)
#   BILLING, FRAMEWORK, FEATURES, DATABASE override args 2-5
#   PROJECT_NAME   project folder name

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-${1:-demo}}"
BILLING="${BILLING:-${2:-}}"
FRAMEWORK="${FRAMEWORK:-${3:-nextjs}}"
FEATURES="${FEATURES:-${4:-}}"
DATABASE="${DATABASE:-${5:-postgres}}"
TMP_PARENT="${E2E_TMP:-/tmp}"
ROOT_TMP="$TMP_PARENT/gi-test"
INSTALL="${E2E_INSTALL:-0}"
HEALTH="${E2E_HEALTH:-0}"

CLI="./dist/cli.js"

if [ ! -f "$CLI" ]; then
  echo "[e2e-smoke] dist/cli.js missing — building..."
  bun run build
fi

rm -rf "$ROOT_TMP"
mkdir -p "$ROOT_TMP"

ARGS=()
[ -n "$BILLING" ]   && ARGS+=(--billing "$BILLING")
[ -n "$FRAMEWORK" ] && ARGS+=(--framework "$FRAMEWORK")
[ -n "$FEATURES" ]  && ARGS+=(--features "$FEATURES")
[ -n "$DATABASE" ]  && ARGS+=(--database "$DATABASE")

echo "[e2e-smoke] Creating $PROJECT_NAME in $ROOT_TMP with:"
echo "  framework=$FRAMEWORK billing=${BILLING:-none} features=${FEATURES:-none} database=$DATABASE"
echo ""

node "$CLI" create "$PROJECT_NAME" \
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

COUNT=$(bun -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8')).globalEnv.length)" "$PROJECT_ROOT/turbo.json")
echo "[e2e-smoke] turbo.json globalEnv count: $COUNT"
if [ "$COUNT" -lt 50 ]; then
  echo "  FAIL: globalEnv < 50"
  exit 1
fi

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

if [ "$INSTALL" = "1" ]; then
  echo ""
  echo "[e2e-smoke] E2E_INSTALL=1 — running bun install + checks (heavy)"
  cd "$PROJECT_ROOT"
  bun install
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
    bun run dev &
    DEV_PID=$!
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
      if ! kill -0 $DEV_PID 2>/dev/null; then
        echo "  dev server died early"
        wait $DEV_PID || true
        exit 1
      fi
    done

    kill $DEV_PID || true
    wait $DEV_PID || true

    if [ "$READY" != "1" ]; then
      echo "  health probe timeout"
      exit 1
    fi
    echo "  health check OK"
  fi
fi

echo ""
echo "[e2e-smoke] SUCCESS: $PROJECT_ROOT"
echo "  To keep:         export KEEP=1 before run or comment rm"
echo "  To clean:        rm -rf $ROOT_TMP"
echo "  Full matrix:     ./scripts/e2e-smoke.sh && BILLING=all FRAMEWORK=tanstack-start FEATURES=eve E2E_INSTALL=1 ./scripts/e2e-smoke.sh"
