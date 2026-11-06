#!/usr/bin/env bash
# Send a test Cal.com webhook to the local receiver.
# Usage: ./scripts/send-test.sh [valid|nosig|badsig|tampered]
set -euo pipefail

MODE="${1:-valid}"
URL="http://localhost:3000/api/cal-webhook"
SECRET=$(grep CAL_WEBHOOK_SECRET .env.local | cut -d= -f2)
BODY='{"triggerEvent":"BOOKING_CREATED"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')
echo $SIG
case "$MODE" in
  valid)    curl -i -X POST "$URL" -H 'Content-Type: application/json' -H "x-cal-signature-256: $SIG" -d "$BODY" ;;
  nosig)    curl -i -X POST "$URL" -H 'Content-Type: application/json' -d "$BODY" ;;
  badsig)   curl -i -X POST "$URL" -H 'Content-Type: application/json' -H "x-cal-signature-256: abc" -d "$BODY" ;;
  tampered) curl -i -X POST "$URL" -H 'Content-Type: application/json' -H "x-cal-signature-256: $SIG" -d '{"triggerEvent":"BOOKING_CANCELED"}' ;;
  *)        echo "Unknown mode: $MODE" >&2; exit 1 ;;
esac