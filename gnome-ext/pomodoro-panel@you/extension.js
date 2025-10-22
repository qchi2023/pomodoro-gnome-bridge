import St from 'gi://St';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

let button, label, session, updateLoopId;

export function enable() {
    log('[PomodoroPanel] Enabling extension...');
    try {
        // Create panel button
        button = new PanelMenu.Button(0.0, 'PomodoroPanel', false);
        label = new St.Label({
            text: 'Pomodoro: Loading...',
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.add_child(label);
        Main.panel.addToStatusArea('pomodoro-panel', button);

        // Initialize HTTP session
        session = new Soup.Session();

        // Start periodic updates
        updatePomodoro();
        updateLoopId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            updatePomodoro();
            return GLib.SOURCE_CONTINUE;
        });

        log('[PomodoroPanel] Extension enabled successfully.');
    } catch (e) {
        logError(e, '[PomodoroPanel] Failed to enable extension.');
    }
}

function updatePomodoro() {
    try {
        const msg = Soup.Message.new('GET', 'http://localhost:4545/status');
        session.send_and_read_async(msg, 0, null, (src, res) => {
            try {
                const bytes = session.send_and_read_finish(res);
                const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                const displayText = `${data.task || 'No Task'} (${data.time || '--:--'})`;
                label.set_text(displayText);
            } catch (err) {
                logError(err, '[PomodoroPanel] Failed to parse status response.');
                label.set_text('Pomodoro: Error');
            }
        });
    } catch (e) {
        logError(e, '[PomodoroPanel] HTTP request failed.');
        label.set_text('Pomodoro: Error');
    }
}

export function disable() {
    log('[PomodoroPanel] Disabling extension...');
    try {
        if (updateLoopId) {
            GLib.source_remove(updateLoopId);
            updateLoopId = null;
        }

        if (button) {
            button.destroy();
            button = null;
        }

        if (session) {
            session.abort();
            session = null;
        }

        log('[PomodoroPanel] Extension disabled cleanly.');
    } catch (e) {
        logError(e, '[PomodoroPanel] Error during disable.');
    }
}
