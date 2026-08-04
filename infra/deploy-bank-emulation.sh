#!/usr/bin/env bash
# Deploy bank-emulation branch with BirManatBank simulator.
# Run on server: BRANCH=bank-emulation ./infra/deploy-bank-emulation.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_PATH="${DEPLOY_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BRANCH="${BRANCH:-bank-emulation}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/sites-available/ticketsbmb.conf}"

green()  { echo -e "\033[1;32m$*\033[0m"; }
blue()   { echo -e "\033[1;34m$*\033[0m"; }
yellow() { echo -e "\033[1;33m$*\033[0m"; }
die()    { echo -e "\033[1;31mERROR: $*\033[0m" >&2; exit 1; }

dc() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    sg docker -c "cd \"$DEPLOY_PATH\" && docker compose $(printf '%q ' "$@")"
  fi
}

cd "$DEPLOY_PATH"

blue "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
blue "  deploy · $BRANCH · BirManatBank"
blue "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

yellow "→ git pull ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
green "✓ $(git log -1 --oneline)"
echo

ENV_FILE="$DEPLOY_PATH/.env"
[[ -f "$ENV_FILE" ]] || die ".env not found"

if ! grep -q '^BIRMANAT_BANK_API_TOKEN=' "$ENV_FILE"; then
  yellow "→ generating bank tokens in .env"
  BANK_TOKEN="$(openssl rand -hex 24)"
  BANK_SECRET="$(openssl rand -hex 24)"
  cat >> "$ENV_FILE" <<EOF

# BirManatBank (added by deploy-bank-emulation.sh)
PAYMENT_PROVIDER=bank
PAYMENT_HOLD_MINUTES=15
PUBLIC_APP_URL=https://tickets.birmanat.band
PUBLIC_FRONTEND_URL=https://tickets.birmanat.band
PAYMENT_WEBHOOK_BASE_URL=http://backend:3000
BANK_API_BASE_URL=http://birmanat-bank
BANK_API_KEY=${BANK_TOKEN}
BANK_WEBHOOK_SECRET=${BANK_SECRET}
BIRMANAT_BANK_PORT=8082
BIRMANAT_BANK_PUBLIC_URL=https://tickets.birmanat.band/bank
BIRMANAT_BANK_API_TOKEN=${BANK_TOKEN}
BIRMANAT_BANK_WEBHOOK_SECRET=${BANK_SECRET}
BIRMANAT_BANK_ALLOWED_HOSTS=tickets.birmanat.band,backend
EOF
  green "✓ bank tokens added to .env"
else
  yellow "→ .env already has bank settings"
  # ensure PAYMENT_PROVIDER=bank
  if grep -q '^PAYMENT_PROVIDER=' "$ENV_FILE"; then
    sed -i 's/^PAYMENT_PROVIDER=.*/PAYMENT_PROVIDER=bank/' "$ENV_FILE"
  else
    echo 'PAYMENT_PROVIDER=bank' >> "$ENV_FILE"
  fi
fi
echo

if ! grep -q 'location /bank/' "$NGINX_CONF" 2>/dev/null; then
  yellow "→ nginx: add /bank/ proxy (needs sudo)"
  die "Add /bank/ block to $NGINX_CONF (see infra/DEPLOY.md) and run: sudo nginx -t && sudo systemctl reload nginx"
else
  green "✓ nginx /bank/ configured"
fi
echo

yellow "→ docker compose up -d --build --remove-orphans"
dc up -d --build --remove-orphans
echo

yellow "→ health checks"
sleep 5
curl -sf "http://127.0.0.1:${BACKEND_PORT:-3001}/health" | head -c 80 && echo
curl -sf -o /dev/null -w "bank local: %{http_code}\n" "http://127.0.0.1:${BIRMANAT_BANK_PORT:-8082}/health"
curl -sf -o /dev/null -w "bank public: %{http_code}\n" "https://tickets.birmanat.band/bank/health" || true

dc ps
echo
green "✓ deploy complete"
green "  app:  https://tickets.birmanat.band/"
green "  bank: https://tickets.birmanat.band/bank/"
