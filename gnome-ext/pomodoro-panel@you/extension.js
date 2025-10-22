import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
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

        wsSession = new Soup.Session();
        connectWebSocket();
    } catch (e) {
        logError(e, '[PomodoroPanel] enable() failed');
    }
}

function connectWebSocket() {
    try {
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
        logError(e, '[PomodoroPanel] Failed to parse WS message');
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
        label = null;
        log('[PomodoroPanel] Extension disabled cleanly.');
    } catch (e) {
        logError(e, '[PomodoroPanel] disable() failed');
    }
}
