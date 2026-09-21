#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
npm --prefix frontend ci --no-audit --no-fund
if [ ! -f .env ]; then
  cp .env.example .env
fi
npm run build
echo "Pronto. Usa npm start oppure npm run dev."
