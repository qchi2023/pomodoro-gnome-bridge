/*
 * Background service worker for the Firefox extension.  This file maintains
 * a WebSocket connection to the local relay (ws://127.0.0.1:8787) and
 * coordinates communication between the content script running on
 * pomodoro-tracker.com and the GNOME Shell extension via the relay.  It
 * forwards state updates from the content script to the relay and relays
 * commands from the GNOME extension to all active pomodoro-tracker tabs.
 */

let ws = null;

// Establish or re-establish a WebSocket connection.  When connected the
// extension identifies itself as a "browser" client.  Connection loss will
// trigger an automatic reconnection attempt.
function connect() {
  ws = new WebSocket('ws://127.0.0.1:8787');
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'hello', client: 'browser' }));
  });
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'command') {
        // Forward command to all tabs hosting pomodoro-tracker.com.
        browser.tabs.query({ url: '*://pomodoro-tracker.com/*' }).then((tabs) => {
          for (const tab of tabs) {
            browser.tabs.sendMessage(tab.id, msg).catch(() => {});
          }
        });
      }
    } catch {
      // Ignore parse errors.
    }
  });
  ws.addEventListener('close', () => {
    // Attempt to reconnect after a short delay.
    setTimeout(connect, 1500);
  });
  ws.addEventListener('error', () => {
    try { ws.close(); } catch {};
  });
}

connect();

// When the content script sends a state update, forward it to the relay if
// the socket is open.  Messages from other sources are ignored.
browser.runtime.onMessage.addListener((msg) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (msg && msg.type === 'state') {
    ws.send(JSON.stringify(msg));
  }
});