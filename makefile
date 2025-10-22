.PHONY: relay-venv relay-start relay-enable gnome-install firefox-dev

relay-venv:
	python3 -m venv ~/.venvs/pomo-relay
	~/.venvs/pomo-relay/bin/pip install -U pip
	~/.venvs/pomo-relay/bin/pip install -r relay/requirements.txt

relay-start:
	~/.venvs/pomo-relay/bin/python relay/server.py

relay-enable: relay-venv
	mkdir -p ~/.config/systemd/user
	cp scripts/relay.service ~/.config/systemd/user/pomodoro-relay.service
	systemctl --user daemon-reload
	systemctl --user enable --now pomodoro-relay.service
	systemctl --user status pomodoro-relay.service --no-pager

gnome-install:
	bash scripts/install-gnome.sh

firefox-dev:
	echo "Open about:debugging#/runtime/this-firefox → Load Temporary Add-on → select firefox-ext/manifest.json"
