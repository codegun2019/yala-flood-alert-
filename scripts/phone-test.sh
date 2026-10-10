#!/usr/bin/env bash
# Open the app on your phone over HTTPS (required for install + push notifications).
# Uses a temporary Cloudflare quick tunnel -> the URL is PUBLIC while this runs. Ctrl+C to stop.
#   Needs: cloudflared (brew install cloudflared), backend running on :8000.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export NEXT_DIST_DIR=.next-prod
echo "▶ building production web app…"
npm run build >/tmp/yala-web-build.log 2>&1 || { tail -20 /tmp/yala-web-build.log; exit 1; }
echo "▶ starting web on :3001"
npx next start -p 3001 >/tmp/yala-web-prod.log 2>&1 &
WEB=$!
trap 'kill $WEB 2>/dev/null || true' EXIT
sleep 3
echo "▶ opening tunnel — look for the https://….trycloudflare.com URL below, open it on your phone"
cloudflared tunnel --no-autoupdate --url http://localhost:3001
