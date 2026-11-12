#!/usr/bin/env bash
# The deploy workflow's verify steps (.github/actions/verify) on Linux, with Node 22 and Chromium, in a throw-away container: the place
# where a browser test that depends on fonts, on "localhost" or on speed shows itself before CI does.
#
#   npm run ci:linux            clone HEAD, install, check, lint, typecheck, unit tests, build, size, addresses, browser tests
#
# It runs what is COMMITTED (it clones the repository), so commit first. Needs Docker. Takes several minutes.
set -u
repo="$(cd "$(dirname "$0")/../.." && pwd)"
docker run --rm -v "$repo:/src:ro" node:22-bookworm bash -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq chromium git curl >/dev/null 2>&1
  git config --global --add safe.directory "*"
  git clone -q /src /work && cd /work || exit 1
  echo "clone at $(git log --oneline -1); node $(node -v)"
  fail=0
  step() { name="$1"; shift; echo; echo "=== $name"; "$@" > /tmp/step.log 2>&1; code=$?; tail -${SHOW:-6} /tmp/step.log; [ $code = 0 ] || { echo ">>> FAILED ($code): $name"; fail=1; }; return $code; }
  SHOW=2 step "npm ci" npm ci --no-audit --no-fund || exit 1
  SHOW=2 step "practice content" npm run practice:build
  SHOW=3 step "check" npm run check
  SHOW=4 step "coding problems" npm run check:code
  SHOW=3 step "lint" npm run lint
  SHOW=3 step "typecheck" npm run typecheck
  SHOW=8 step "unit tests" npm test
  SHOW=3 step "build" npm run build || exit 1
  SHOW=8 step "bundle size" npm run check:bundle
  SHOW=3 step "addresses" npm run check:urls
  export E2E_EXECUTABLE="$(command -v chromium)"
  npm run preview > /tmp/preview.log 2>&1 &
  for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:4180/ && break; sleep 1; done
  SHOW=30 step "browser tests" npm run test:e2e
  echo; [ "$fail" = 0 ] && echo "LINUX CI: ALL STEPS PASSED" || echo "LINUX CI: SOME STEPS FAILED"
  [ "$fail" = 0 ]
'
