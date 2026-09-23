#!/usr/bin/env bash
# scheduler.sh — wrapper that runs the wellfound auto-apply job
# Called by systemd timer (or manually). Logs output and handles errors.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${PROJECT_DIR}/auto-apply-scheduler.log"
LOCK_FILE="/tmp/wellfound-auto-apply.lock"

# Prevent overlapping runs
exec 200>"${LOCK_FILE}"
flock -n 200 || { echo "[$(date)] Another run is already in progress, skipping." >> "${LOG_FILE}"; exit 0; }

echo "============================================" >> "${LOG_FILE}"
echo "[$(date)] Starting scheduled wellfound auto-apply run" >> "${LOG_FILE}"

cd "${PROJECT_DIR}"

# Ensure node_modules exist
if [ ! -d "node_modules" ]; then
    echo "[$(date)] Installing dependencies..." >> "${LOG_FILE}"
    npm install --production 2>&1 | tail -5 >> "${LOG_FILE}"
fi

# Run the auto-apply script in live mode
node auto-apply-runner.js wellfound --live 2>&1 | while IFS= read -r line; do
    echo "[$(date)] $line" >> "${LOG_FILE}"
done

EXIT_CODE=${PIPESTATUS[0]}

if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[$(date)] auto-apply-runner exited with code $EXIT_CODE" >> "${LOG_FILE}"
else
    echo "[$(date)] Run completed successfully" >> "${LOG_FILE}"
fi

echo "============================================" >> "${LOG_FILE}"
