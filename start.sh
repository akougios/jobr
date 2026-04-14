#!/bin/bash
# Jobr.dk – starter lokal server med rigtige jobs fra Jobnet.dk
# Brug: ./start.sh

cd "$(dirname "$0")"

# Tjek Python 3
if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 er ikke installeret. Installer fra https://python.org"
  exit 1
fi

# Installer requests hvis den mangler
python3 -c "import requests" 2>/dev/null || {
  echo "📦  Installerer requests..."
  pip3 install requests --quiet
}

echo "🚀  Starter Jobr.dk..."
python3 server.py
