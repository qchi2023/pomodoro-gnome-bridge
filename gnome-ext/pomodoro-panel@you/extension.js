/* exported init enable disable */
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Main from 'resource:///org/gnome/shell/ui/main.js';
import PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import Soup from 'gi://Soup?version=3.0';

const WS_URL = 'ws://127.0.0.1:8787';

class PomoIndicator extends PanelMenu.Button {
  constructor() {
    super(0.0, 'Pomodoro Panel');

    this._label = new St.Label({ text: '🍅 —:—', y_align: St.Align.MIDDLE });
    this._label.add_style_class_name('pomo-label');
    this.add_child(this._label);

    this._startItem = new PopupMenu.PopupMenuItem('Start');
    this._pauseItem = new PopupMenu.PopupMenuItem('Pause');
    this.menu.addMenuItem(this._startItem);
    this.menu.addMenuItem(this._pauseItem);
    this._startItem.connect('activate', () => this._sendCmd('start'));
    this._pauseItem.connect('activate', () => this._sendCmd('pause'));

    this._state = { phase: 'paused', running: false, timer: '--:--', task: '' };
    this._wsSession = null;
    this._reconnectId = 0;

    this._applyPanelClass();
    this._updateLabel();
    this._connectWebSocket();
  }

  _applyPanelClass() {
    const panel = Main.panel;
    ['pomodoro-work','pomodoro-break','pomodoro-paused'].forEach(c => panel.remove_style_class_name(c));
    let klass = 'pomodoro-paused';
    if (this._state.running && this._state.phase === 'work') klass = 'pomodoro-work';
    if (this._state.running && this._state.phase === 'break') klass = 'pomodoro-break';
    panel.add_style_class_name(klass);
  }

  _updateLabel() {
    const task = this._state.task?.trim() || 'No task';
    const t = this._state.timer || '--:--';
    const glyph = this._state.running ? '⏱' : '⏸';
    this._label.set_text(`🍅 ${task} | ${t} | ${glyph}`);
  }

  _connectWebSocket() {
    if (this._wsSession) {
      try { this._wsSession.close(1000, 'reconnect'); } catch {}
      this._wsSession = null;
    }
    const session = new Soup.Session();
    const msg = Soup.Message.new('GET', WS_URL);

    session.websocket_connect_async(msg, null, null, GLib.PRIORITY_DEFAULT, (sess, res) => {
      try {
        this._wsSession = session.websocket_connect_finish(res);
      } catch (e) {
        this._scheduleReconnect();
        return;
      }

      this._send({ type: 'hello', client: 'gnome' });

      this._wsSession.connect('message', (_c, type, data) => {
        if (type !== Soup.WebsocketDataType.TEXT) return;
        try {
          const s = imports.byteArray.toString(data);
          const payload = JSON.parse(s);
          this._handleMessage(payload);
        } catch {}
      });

      this._wsSession.connect('closed', () => this._scheduleReconnect());
      this._wsSession.connect('error', () => this._scheduleReconnect());
    });
  }

  _scheduleReconnect() {
    if (this._reconnectId) return;
    this._reconnectId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
      this._reconnectId = 0;
      this._connectWebSocket();
      return GLib.SOURCE_REMOVE;
    });
  }

  _handleMessage(msg) {
    if (msg.type === 'state') {
      this._state = {
        timer: msg.timer ?? this._state.timer,
        task: msg.task ?? this._state.task,
        phase: msg.phase ?? this._state.phase,
        running: msg.running ?? this._state.running,
      };
      this._applyPanelClass();
      this._updateLabel();
    }
  }

  _send(obj) {
    if (!this._wsSession || this._wsSession.get_state() !== Soup.WebsocketState.OPEN) return;
    this._wsSession.send_text(JSON.stringify(obj));
  }

  _sendCmd(cmd) { this._send({ type: 'command', cmd }); }

  destroy() {
    const panel = Main.panel;
    ['pomodoro-work','pomodoro-break','pomodoro-paused'].forEach(c => panel.remove_style_class_name(c));
    if (this._wsSession) { try { this._wsSession.close(1000, 'bye'); } catch {} this._wsSession = null; }
    if (this._reconnectId) { GLib.source_remove(this._reconnectId); this._reconnectId = 0; }
    super.destroy();
  }
}

let indicator;

export function init() {
  // stylesheet is auto-loaded by GNOME; no-op is ok
}

export function enable() {
  indicator = new PomoIndicator();
  Main.panel.addToStatusArea('pomodoro-panel', indicator, 0, 'right');
}

export function disable() {
  if (indicator) { indicator.destroy(); indicator = null; }
}
