/*
 * GNOME Shell extension: Pomodoro Panel
 *
 * This extension displays the current pomodoro timer, task and state in the top
 * bar and allows the user to start or pause the timer directly from the
 * panel menu.  It communicates with a local WebSocket relay server which
 * brokers messages between this extension and the Firefox content script
 * injected into pomodoro-tracker.com.  The extension changes the colour of
 * the top bar depending on whether the timer is running (work), on break,
 * paused or when the user is not logged in.
 */

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Main from 'resource:///org/gnome/shell/ui/main.js';
import PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import Soup from 'gi://Soup?version=3.0';
import Extension from 'resource:///org/gnome/shell/extensions/extension.js';

const WS_URL = 'ws://127.0.0.1:8787';

export default class PomodoroPanelExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._label = null;
        this._startItem = null;
        this._pauseItem = null;
        this._state = {
            timer: '--:--',
            task: '',
            phase: 'paused',
            running: false,
            loggedIn: false,
        };
        this._wsSession = null;
        this._reconnectId = 0;
    }

    /**
     * Load the extension stylesheet.  This must be called before any
     * style classes are added to the panel.
     */
    _loadStylesheet() {
        try {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            const theme = themeContext.get_theme();
            const file = this.dir.get_child('stylesheet.css');
            if (file.query_exists(null)) {
                theme.load_stylesheet(file);
            }
        } catch (e) {
            // Failing to load the stylesheet is non-fatal.  Log the error
            // for debugging but do not interrupt extension initialisation.
            logError(e, 'Failed to load stylesheet');
        }
    }

    enable() {
        this._loadStylesheet();
        // Create a new panel button.  The second argument is a tooltip.
        this._indicator = new PanelMenu.Button(0.0, 'Pomodoro Panel');

        // Create the label displaying the timer/task/glyph.  Use a
        // monospaced dash for the initial placeholder.
        this._label = new St.Label({ text: '🍅 --:--' });
        this._label.add_style_class_name('pomo-label');
        this._indicator.add_child(this._label);

        // Add menu items for starting and pausing the timer.  The labels
        // will remain constant; sensitivity will be controlled depending
        // on whether the user is logged in and whether the timer is running.
        this._startItem = new PopupMenu.PopupMenuItem('Start');
        this._pauseItem = new PopupMenu.PopupMenuItem('Pause');
        this._indicator.menu.addMenuItem(this._startItem);
        this._indicator.menu.addMenuItem(this._pauseItem);
        this._startItem.connect('activate', () => this._sendCmd('start'));
        this._pauseItem.connect('activate', () => this._sendCmd('pause'));

        // Add the indicator to the right side of the status area using the
        // extension UUID for uniqueness.
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');

        // Apply the initial panel class and label text based on state.
        this._applyPanelClass();
        this._updateLabel();
        this._updateMenuSensitivity();

        // Connect to the local WebSocket relay.
        this._connectWebSocket();
    }

    /**
     * Disable the extension and clean up resources.  Remove panel colour
     * classes, close any WebSocket connection and destroy the indicator.
     */
    disable() {
        // Remove our style classes from the panel.
        const classes = ['pomodoro-work', 'pomodoro-break', 'pomodoro-paused', 'pomodoro-login'];
        for (const c of classes) {
            Main.panel.remove_style_class_name(c);
        }
        // Close the WebSocket session if present.
        if (this._wsSession) {
            try { this._wsSession.close(1000, 'bye'); } catch {};
            this._wsSession = null;
        }
        if (this._reconnectId) {
            GLib.source_remove(this._reconnectId);
            this._reconnectId = 0;
        }
        // Remove the indicator from the panel.
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    /**
     * Determine which style class to apply to the panel based on the
     * current state and update the panel accordingly.  The classes
     * correspond to work, break, paused and login states.
     */
    _applyPanelClass() {
        // Remove previous classes to prevent stacking.
        const classes = ['pomodoro-work', 'pomodoro-break', 'pomodoro-paused', 'pomodoro-login'];
        for (const c of classes) {
            Main.panel.remove_style_class_name(c);
        }
        // Choose the appropriate class.
        let cls = 'pomodoro-paused';
        if (!this._state.loggedIn) {
            cls = 'pomodoro-login';
        } else if (this._state.running && this._state.phase === 'work') {
            cls = 'pomodoro-work';
        } else if (this._state.running && this._state.phase === 'break') {
            cls = 'pomodoro-break';
        } else {
            cls = 'pomodoro-paused';
        }
        Main.panel.add_style_class_name(cls);
    }

    /**
     * Update the label text to reflect the current state.  If the user is
     * not logged in show a login prompt; otherwise display task, timer and
     * a glyph indicating running or paused state.
     */
    _updateLabel() {
        if (!this._state.loggedIn) {
            this._label.set_text('🍅 Login required');
            return;
        }
        const task = (this._state.task || '').trim() || 'No task';
        const timer = this._state.timer || '--:--';
        const glyph = this._state.running ? '⏱' : '⏸';
        this._label.set_text(`🍅 ${task} | ${timer} | ${glyph}`);
    }

    /**
     * Enable or disable menu items based on login status.  When the user is
     * not logged in the Start/Pause items are insensitive to avoid
     * confusion.
     */
    _updateMenuSensitivity() {
        const sensitive = this._state.loggedIn;
        if (this._startItem) this._startItem.setSensitive(sensitive);
        if (this._pauseItem) this._pauseItem.setSensitive(sensitive);
    }

    /**
     * Connect to the local WebSocket relay and handle reconnection logic.
     */
    _connectWebSocket() {
        // Close any existing connection before reconnecting.
        if (this._wsSession) {
            try { this._wsSession.close(1000, 'reconnect'); } catch {};
            this._wsSession = null;
        }
        const session = new Soup.Session();
        const msg = Soup.Message.new('GET', WS_URL);
        session.websocket_connect_async(
            msg,
            null,
            null,
            GLib.PRIORITY_DEFAULT,
            (sess, res) => {
                try {
                    this._wsSession = session.websocket_connect_finish(res);
                } catch (e) {
                    this._scheduleReconnect();
                    return;
                }
                // Identify as a GNOME client.
                this._send({ type: 'hello', client: 'gnome' });
                // Handle incoming messages.
                this._wsSession.connect('message', (_conn, type, data) => {
                    if (type !== Soup.WebsocketDataType.TEXT) return;
                    try {
                        const payload = JSON.parse(imports.byteArray.toString(data));
                        this._handleMessage(payload);
                    } catch {
                        // Ignore invalid JSON.
                    }
                });
                this._wsSession.connect('closed', () => this._scheduleReconnect());
                this._wsSession.connect('error', () => this._scheduleReconnect());
            }
        );
    }

    /**
     * Schedule a reconnect attempt after a short delay.
     */
    _scheduleReconnect() {
        if (this._reconnectId) return;
        this._reconnectId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._reconnectId = 0;
            this._connectWebSocket();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Handle incoming state messages from the relay by updating our state
     * object and refreshing the UI.  Unknown fields are ignored.
     */
    _handleMessage(msg) {
        if (msg.type === 'state') {
            for (const key of ['timer', 'task', 'phase', 'running', 'loggedIn']) {
                if (Object.prototype.hasOwnProperty.call(msg, key)) {
                    this._state[key] = msg[key];
                }
            }
            this._applyPanelClass();
            this._updateLabel();
            this._updateMenuSensitivity();
        }
    }

    /**
     * Send a JSON message over the WebSocket if the connection is open.
     */
    _send(obj) {
        if (!this._wsSession || this._wsSession.get_state() !== Soup.WebsocketState.OPEN) return;
        try {
            this._wsSession.send_text(JSON.stringify(obj));
        } catch {
            // Ignore send errors.
        }
    }

    /**
     * Send a control command (start or pause) to the relay.  Commands are
     * forwarded to the browser content script.
     */
    _sendCmd(cmd) {
        this._send({ type: 'command', cmd });
    }
}