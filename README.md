# Pomodoro GNOME Bridge

GNOME top-bar Pomodoro that syncs with https://pomodoro-tracker.com:
- Shows **task + timer** in the panel
- **Start/Pause** from GNOME (no reset)
- **Top bar color**: red (work) / green (break) / white (paused)
- Works with **Firefox** via a tiny WebExtension
- Uses a local WebSocket relay (Python)

## Quick start (Ubuntu / GNOME 42+)

```bash
git clone https://github.com/<you>/pomodoro-gnome-bridge.git
cd pomodoro-gnome-bridge

# 1) Relay (Python)
make relay-enable   # creates venv + systemd user service on ws://127.0.0.1:8787

# 2) GNOME extension
make gnome-install
# Restart GNOME Shell (Wayland: log out/in; Xorg: Alt+F2 then 'r')
gnome-extensions enable pomodoro-panel@you

# 3) Firefox extension (temporary load)
make firefox-dev
# then open pomodoro-tracker.com in Firefox
