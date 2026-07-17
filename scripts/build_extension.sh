#!/usr/bin/env bash
# Build ws63-ide VS Code extension (.vsix)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/../extension"

# Prefer user-local Node (no sudo); fallback to PATH
if [ -x "$HOME/.local/node/bin/npm" ]; then
  export PATH="$HOME/.local/node/bin:$PATH"
fi

cd "$EXT_DIR"
npm install
npm run compile
npm run package
echo "VSIX: $EXT_DIR/ws63-ide-0.1.0.vsix"
