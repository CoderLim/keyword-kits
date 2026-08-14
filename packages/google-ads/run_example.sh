#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

TEST_CUSTOMER_ID="1265134925"

if [[ ! -f google-ads.yaml ]]; then
  echo "Missing google-ads.yaml. Run generate_refresh_token.py first." >&2
  exit 1
fi

python keyword_volume.py \
  --config google-ads.yaml \
  --login-customer-id "${TEST_CUSTOMER_ID}" \
  --customer-id "${TEST_CUSTOMER_ID}" \
  --json \
  "独立站"

python keyword_volume.py \
  --config google-ads.yaml \
  --login-customer-id "${TEST_CUSTOMER_ID}" \
  --customer-id "${TEST_CUSTOMER_ID}" \
  --language-id 1000 \
  --json \
  "google ads"

python keyword_ideas.py \
  --config google-ads.yaml \
  --login-customer-id "${TEST_CUSTOMER_ID}" \
  --customer-id "${TEST_CUSTOMER_ID}" \
  --language-id 1000 \
  --limit 5 \
  --json \
  "google ads"
