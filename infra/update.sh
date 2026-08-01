#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_PATH="${DEPLOY_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BRANCH="${BRANCH:-bmb-production}"

green()  { echo -e "\033[1;32m$*\033[0m"; }
blue()   { echo -e "\033[1;34m$*\033[0m"; }
yellow() { echo -e "\033[1;33m$*\033[0m"; }

dc() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    sg docker -c "cd \"$DEPLOY_PATH\" && docker compose $(printf '%q ' "$@")"
  fi
}

cd "$DEPLOY_PATH"

blue "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
blue "  BirManat-Tickets SAAS SYSTEM LTD · KURWA · PRODUCTION · deploy"
blue "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

yellow "→ git pull ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || true
git pull --ff-only origin "$BRANCH"
green "✓ код обновлён: $(git log -1 --oneline)"
echo

yellow "→ docker compose up -d --build --remove-orphans"
dc up -d --build --remove-orphans
green "✓ контейнеры пересобраны и запущены"
echo

yellow "→ статус"
dc ps
echo
green "✓ готово"
