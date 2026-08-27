#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KAFKA_DIR="$DEMO_DIR/kafka_2.13-4.3.1"

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI is not set."
  echo "Set it first, for example:"
  echo "  export MONGODB_URI='mongodb://USER:PASSWORD@HOST:PORT/?authMechanism=PLAIN&authSource=\$external&ssl=true'"
  exit 1
fi

cd "$DEMO_DIR"

"$KAFKA_DIR/bin/connect-standalone.sh" \
  "$SCRIPT_DIR/config/connect-standalone.properties" \
  "$SCRIPT_DIR/config/mongodb-source-orders.properties"
