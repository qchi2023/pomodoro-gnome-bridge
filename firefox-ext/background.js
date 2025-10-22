let ws;
function connect() {
  ws = new WebSocket("ws://127.0.0.1:8787");
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", client: "browser" }));
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "command") {
        // forward command to content script (active tab)
        browser.tabs.query({ url: "*://pomodoro-tracker.com/*" }).then(tabs => {
          for (const t of tabs) browser.tabs.sendMessage(t.id, msg);
        });
      }
    } catch {}
  };
  ws.onclose = () => setTimeout(connect, 1500);
  ws.onerror = () => { try { ws.close(); } catch {} };
}
connect();

// Receive state from content script and forward to relay
browser.runtime.onMessage.addListener((msg) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (msg && msg.type === "state") ws.send(JSON.stringify(msg));
});
