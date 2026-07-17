#!/usr/bin/env bash
# Launch WS63 serial monitor in IDE dedicated terminal.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/../backend/ws63_cli.py" monitor --forever "$@"
