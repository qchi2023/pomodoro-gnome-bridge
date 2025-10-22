#!/usr/bin/env bash
set -euo pipefail
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/pomodoro-panel@you"
mkdir -p "${EXT_DIR}"
cp -r gnome-ext/pomodoro-panel@you/* "${EXT_DIR}/"
echo "Installed to ${EXT_DIR}"
echo "Restart GNOME Shell (Alt+F2 → r) and enable: gnome-extensions enable pomodoro-panel@you"
