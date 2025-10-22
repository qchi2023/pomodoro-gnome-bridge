let ws = null;

console.log("\U0001f527 Background script loaded");

// Establish or re-establish a WebSocket connection
function connect() {
  console.log("\U0001f310 Connecting to WebSocket...");
  ws = new WebSocket('ws://127.0.0.1:8787');

  ws.addEventListener('open', () => {
    console.log("\u2705 WebSocket connected");
    ws.send(JSON.stringify({ type: 'hello', client: 'browser' }));
  });

  ws.addEventListener('message', (event) => {
    console.log("\U0001f4e8 Got message from relay:", event.data);
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'command') {
        browser.tabs.query({ url: '*://pomodoro-tracker.com/*' }).then((tabs) => {
          for (const tab of tabs) {
            browser.tabs.sendMessage(tab.id, msg).catch(() => {});
          }
        });
      }
    } catch (err) {
      console.warn("\u274c Failed to parse relay message:", err);
    }
  });

  ws.addEventListener('close', () => {
    console.log("\U0001f50c WebSocket closed, reconnecting...");
    setTimeout(connect, 1500);
  });

  ws.addEventListener('error', (e) => {
    console.error("\U0001f4a5 WebSocket error:", e);
    try { ws.close(); } catch {};
  });
}

connect();

// Listen for messages from the content script
browser.runtime.onMessage.addListener((msg) => {
  console.log("\U0001f4e4 Got message from content script:", msg);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (msg && msg.type === 'state') {
    console.log("\u27a1\ufe0f Forwarding state to relay:", msg);
    ws.send(JSON.stringify(msg));
  }
});
