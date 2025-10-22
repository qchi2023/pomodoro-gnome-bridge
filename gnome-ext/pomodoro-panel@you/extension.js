// GNOME 46+ ESM extension using composition (no subclassing)
import * as St from 'gi://St';
import * as Gio from 'gi://Gio';
import * as GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Soup from 'gi://Soup?version=3.0';

const WS_URL = 'ws://127.0.0.1:8787';

function textDecode(bytes) {
  try { return imports.byteArray.toString(bytes); } catch { return ''; }
}

export default class PomodoroPanelExtension {
  constructor() {
    this._button = null;
    this._label = null;
    this._menu = null;
    this._startItem = null;
    this._pauseItem = null;

    this._state = { timer:'--:--', task:'', phase:'paused', running:false, loggedIn:false };
    this._session = null;
    this._reconnectId = 0;
  }

  enable() {
    // Build indicator without subclassing (avoids GType issues)
    this._button = new PanelMenu.Button(0.0, 'Pomodoro Panel');
    this._label = new St.Label({ text: '🍅 —:—' });
    this._label.add_style_class_name('pomo-label');
    this._button.add_child(this._label);

    this._menu = this._button.menu;
    this._startItem = new PopupMenu.PopupMenuItem('Start');
    this._pauseItem = new PopupMenu.PopupMenuItem('Pause');
    this._menu.addMenuItem(this._startItem);
    this._menu.addMenuItem(this._pauseItem);

    this._startItem.connect('activate', () => this._sendCmd('start'));
    this._pauseItem.connect('activate', () => this._sendCmd('pause'));

    Main.panel.addToStatusArea('pomodoro-panel', this._button, 0, 'right');

    this._applyPanelClass();
    this._updateLabel();
    this._connect();
  }

  disable() {
    this._teardownWS();
    if (this._button) {
      ['pomodoro-work','pomodoro-break','pomodoro-paused','pomodoro-login']
        .forEach(c => Main.panel.remove_style_class_name(c));
      this._button.destroy();
      this._button = null;
    }
  }

  _applyPanelClass() {
    ['pomodoro-work','pomodoro-break','pomodoro-paused','pomodoro-login']
      .forEach(c => Main.panel.remove_style_class_name(c));

    let klass = 'pomodoro-paused';
    if (!this._state.loggedIn) klass = 'pomodoro-login';
    else if (this._state.running && this._state.phase === 'work') klass = 'pomodoro-work';
    else if (this._state.running && this._state.phase === 'break') klass = 'pomodoro-break';

    Main.panel.add_style_class_name(klass);

    const disabled = !this._state.loggedIn;
    this._startItem.setSensitive(!disabled);
    this._pauseItem.setSensitive(!disabled);
  }

  _updateLabel() {
    if (!this._state.loggedIn) {
      this._label.set_text('🍅 Login required');
      return;
    }
    const task = (this._state.task || 'No task').trim();
    const t = this._state.timer || '--:--';
    const glyph = this._state.running ? '⏱' : '⏸';
    this._label.set_text(`🍅 ${task} | ${t} | ${glyph}`);
  }

  _connect() {
    this._teardownWS(); // ensure fresh
    const session = new Soup.Session();
    const msg = Soup.Message.new('GET', WS_URL);

    session.websocket_connect_async(
      msg, null, null, GLib.PRIORITY_DEFAULT,
      (_sess, res) => {
        try {
          this._session = session.websocket_connect_finish(res);
        } catch (e) {
          this._scheduleReconnect();
          return;
        }

        this._send({ type:'hello', client:'gnome' });

        this._session.connect('message', (_c, type, data) => {
          if (type !== Soup.WebsocketDataType.TEXT) return;
          try {
            const payload = JSON.parse(textDecode(data));
            this._handle(payload);
          } catch {}
        });

        this._session.connect('closed', () => this._scheduleReconnect());
        this._session.connect('error',  () => this._scheduleReconnect());
      }
    );
  }

  _handle(msg) {
    if (msg?.type === 'state') {
      this._state = {
        timer:   msg.timer   ?? this._state.timer,
        task:    msg.task    ?? this._state.task,
        phase:   msg.phase   ?? this._state.phase,
        running: msg.running ?? this._state.running,
        loggedIn: msg.loggedIn ?? this._state.loggedIn,
      };
      this._applyPanelClass();
      this._updateLabel();
    }
  }

  _send(obj) {
    if (!this._session || this._session.get_state() !== Soup.WebsocketState.OPEN) return;
    this._session.send_text(JSON.stringify(obj));
  }
  _sendCmd(cmd) { this._send({ type:'command', cmd }); }

  _scheduleReconnect() {
    if (this._reconnectId) return;
    this._reconnectId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
      this._reconnectId = 0;
      this._connect();
      return GLib.SOURCE_REMOVE;
    });
  }

  _teardownWS() {
    if (this._session) {
      try { this._session.close(1000, 'bye'); } catch {}
      this._session = null;
    }
    if (this._reconnectId) {
      GLib.source_remove(this._reconnectId);
      this._reconnectId = 0;
    }
  }
}
