#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== LtrMgr 起動 ==="

# Frontend build (初回 or 明示的に rebuild)
if [ "$1" = "--build" ] || [ ! -d "$ROOT/backend/static_frontend" ]; then
  echo "[1/2] フロントエンドをビルド中..."
  cd "$ROOT/frontend"
  [ ! -d node_modules ] && npm install
  npm run build
fi

# Backend
cd "$ROOT/backend"
if [ ! -d venv ]; then
  echo "[2/2] Python 環境を構築中..."
  python3 -m venv venv
  venv/bin/pip install -q -r requirements.txt
fi

echo "バックエンドを起動しています... (http://0.0.0.0:8000)"
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "Cloudflare トンネルを開始しています..."
echo "（URLが表示されるまで数秒かかります）"
echo ""

# Ctrl+C で両方を終了
trap "kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM

cloudflared tunnel --url http://localhost:8000
