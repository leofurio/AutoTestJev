#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Compatibility wrapper; npm run setup uses the portable Node implementation.
npm run setup
