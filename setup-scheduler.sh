#!/bin/bash
set -e

REPO_DIR="/run/media/jeet/New Volume/wellfound"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_NAME="wellfound-auto-apply"

mkdir -p "$SERVICE_DIR"
cp "$REPO_DIR/wellfound-auto-apply.service" "$SERVICE_DIR/"
cp "$REPO_DIR/wellfound-auto-apply.timer" "$SERVICE_DIR/"

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME.timer"
systemctl --user start "$SERVICE_NAME.timer"

echo "Done. Timer installed."
echo ""
echo "Commands:"
echo "  systemctl --user status $SERVICE_NAME.timer    # Check timer status"
echo "  systemctl --user list-timers --all              # List all timers"
echo "  systemctl --user start $SERVICE_NAME.service    # Run manually now"
echo "  journalctl --user -u $SERVICE_NAME.service -f   # Watch live logs"
echo "  systemctl --user stop $SERVICE_NAME.timer       # Disable"
echo "  systemctl --user disable $SERVICE_NAME.timer    # Remove timer"
