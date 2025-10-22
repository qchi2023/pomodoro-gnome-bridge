import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import Soup from 'gi://Soup';

let button, label;
let wsSession, wsConnection;
let reconnectTimeoutId;

const WS_URL = 'ws://127.0.0.1:8787';

export function enable() {
    log('[PomodoroPanel] Enabling WebSocket extension...');
    try {
        button = new PanelMenu.Button(0.0, 'PomodoroPanel', false);

        label = new St.Label({
            text: 'Pomodoro: Connecting...',
            y_align: Clutter.ActorAlign.CENTER,
        });

        button.add_child(label);
        Main.panel.addToStatusArea('pomodoro-panel', button);

<<<<<<< HEAD
        wsSession = new Soup.Session();
        connectWebSocket();
    } catch (e) {
        logError(e, '[PomodoroPanel] enable() failed');
=======
        session = new Soup.Session();

        updatePomodoro();
        updateLoopId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            updatePomodoro();
            return GLib.SOURCE_CONTINUE;
        });

        log('[PomodoroPanel] Extension enabled.');
    } catch (e) {
        logError(e, '[PomodoroPanel] enable() failed.');
>>>>>>> 5f14d65 (WIP: Save local changes before pulling latest)
    }
}

function connectWebSocket() {
    try {
<<<<<<< HEAD
        log('[PomodoroPanel] Connecting to relay...');
        Soup.Session.prototype.websocket_connect_async.call(
            wsSession,
            WS_URL,
            null, // origin
            [],   // protocols
            null, // cancellable
            (session, res) => {
                try {
                    wsConnection = session.websocket_connect_finish(res);
                    log('[PomodoroPanel] Connected to relay.');
                    label.set_text('Pomodoro: Connected');

                    // Identify as GNOME client
                    wsConnection.send_text(JSON.stringify({
                        type: 'hello',
                        client: 'gnome',
                    }));

                    wsConnection.connect('message', (_conn, type, msg) => {
                        if (type !== Soup.WebsocketDataType.TEXT)
                            return;
                        handleMessage(msg);
                    });

                    wsConnection.connect('closed', () => {
                        log('[PomodoroPanel] Connection closed, retrying...');
                        label.set_text('Pomodoro: Disconnected');
                        reconnectLater();
                    });
                } catch (err) {
                    logError(err, '[PomodoroPanel] Connection failed');
                    label.set_text('Pomodoro: Error');
                    reconnectLater();
                }
=======
        const msg = Soup.Message.new('GET', 'http://localhost:4545/status');
        session.send_and_read_async(msg, 0, null, (src, res) => {
            try {
                const bytes = session.send_and_read_finish(res);
                const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                const displayText = `${data.task || 'No Task'} (${data.time || '--:--'})`;
                label.set_text(displayText);
            } catch (err) {
                logError(err, '[PomodoroPanel] Failed to parse response');
                label.set_text('Pomodoro: Error');
>>>>>>> 5f14d65 (WIP: Save local changes before pulling latest)
            }
        );
    } catch (err) {
        logError(err, '[PomodoroPanel] websocket_connect_async failed');
        reconnectLater();
    }
}

function reconnectLater() {
    if (reconnectTimeoutId)
        GLib.source_remove(reconnectTimeoutId);
    reconnectTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
        connectWebSocket();
        return GLib.SOURCE_REMOVE;
    });
}

function handleMessage(text) {
    try {
        const msg = JSON.parse(text);
        if (msg.type === 'state') {
            const { task, timer, phase, loggedIn } = msg;
            if (!loggedIn) {
                label.set_text('Pomodoro: Not logged in');
            } else {
                const t = task || 'No Task';
                const time = timer || '--:--';
                label.set_text(`${t} (${time})`);
            }
        }
    } catch (e) {
<<<<<<< HEAD
        logError(e, '[PomodoroPanel] Failed to parse WS message');
=======
        logError(e, '[PomodoroPanel] updatePomodoro() failed');
        label.set_text('Pomodoro: Error');
>>>>>>> 5f14d65 (WIP: Save local changes before pulling latest)
    }
}

export function disable() {
    log('[PomodoroPanel] Disabling extension...');
    try {
        if (reconnectTimeoutId) {
            GLib.source_remove(reconnectTimeoutId);
            reconnectTimeoutId = null;
        }
        if (wsConnection) {
            wsConnection.close(Soup.WebsocketCloseCode.NORMAL, 'bye');
            wsConnection = null;
        }
        if (button) {
            button.destroy();
            button = null;
        }
        if (wsSession) {
            wsSession.abort();
            wsSession = null;
        }
<<<<<<< HEAD
        label = null;
        log('[PomodoroPanel] Extension disabled cleanly.');
    } catch (e) {
        logError(e, '[PomodoroPanel] disable() failed');
=======

        log('[PomodoroPanel] Extension disabled.');
    } catch (e) {
        logError(e, '[PomodoroPanel] disable() failed.');
>>>>>>> 5f14d65 (WIP: Save local changes before pulling latest)
    }
}
