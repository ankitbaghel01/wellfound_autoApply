#!/usr/bin/env bash
# install.sh — installs wellfound-auto-apply as a systemd timer
# Run once after cloning/setup. Requires sudo for systemd.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="wellfound-auto-apply"
SYSTEMD_DIR="${PROJECT_DIR}/systemd"
USER_MODE="${1:-}"

echo "=== Wellfound Auto-Apply Scheduler Setup ==="
echo ""

# Detect if we should run as user or system service
if [ "$USER_MODE" = "--user" ]; then
    TARGET_DIR="${HOME}/.config/systemd/user"
    echo "Installing as user systemd service..."
else
    TARGET_DIR="/etc/systemd/system"
    echo "Installing as system systemd service (requires sudo)..."
fi

# Create target directory
if [ "$USER_MODE" = "--user" ]; then
    mkdir -p "${TARGET_DIR}"
else
    sudo mkdir -p "${TARGET_DIR}"
fi

# Copy unit files
if [ "$USER_MODE" = "--user" ]; then
    cp "${SYSTEMD_DIR}/${SERVICE_NAME}.service" "${TARGET_DIR}/"
    cp "${SYSTEMD_DIR}/${SERVICE_NAME}.timer" "${TARGET_DIR}/"
else
    sudo cp "${SYSTEMD_DIR}/${SERVICE_NAME}.service" "${TARGET_DIR}/"
    sudo cp "${SYSTEMD_DIR}/${SERVICE_NAME}.timer" "${TARGET_DIR}/"
fi

# Reload systemd
if [ "$USER_MODE" = "--user" ]; then
    systemctl --user daemon-reload
    systemctl --user enable "${SERVICE_NAME}.timer"
    systemctl --user start "${SERVICE_NAME}.timer"
    echo ""
    echo "Installed and started!"
    echo ""
    echo "Useful commands:"
    echo "  systemctl --user status ${SERVICE_NAME}.timer    # check timer status"
    echo "  systemctl --user list-timers --all              # list all timers"
    echo "  systemctl --user start ${SERVICE_NAME}.service  # run now manually"
    echo "  systemctl --user stop ${SERVICE_NAME}.timer     # disable timer"
    echo "  journalctl --user -u ${SERVICE_NAME}.service   # view logs"
else
    sudo systemctl daemon-reload
    sudo systemctl enable "${SERVICE_NAME}.timer"
    sudo systemctl start "${SERVICE_NAME}.timer"
    echo ""
    echo "Installed and started!"
    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl status ${SERVICE_NAME}.timer     # check timer status"
    echo "  systemctl list-timers --all                    # list all timers"
    echo "  sudo systemctl start ${SERVICE_NAME}.service   # run now manually"
    echo "  sudo systemctl stop ${SERVICE_NAME}.timer      # disable timer"
    echo "  sudo journalctl -u ${SERVICE_NAME}.service     # view logs"
fi

echo ""
echo "Schedule: Daily at 18:30"
echo "Persistent: true (runs on boot if system was off at 18:30)"
echo ""
