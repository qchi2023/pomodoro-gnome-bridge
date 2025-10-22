// Robust selectors (best-effort; adjust if site changes)
function textOf(sel) {
  const el = document.querySelector(sel);
  return el ? el.textContent.trim() : "";
}
function clickButton(labelRegex) {
  const btns = Array.from(document.querySelectorAll("button, [role=button]"));
  const btn = btns.find(b => labelRegex.test((b.innerText || b.ariaLabel || "").trim()));
  if (btn) btn.click();
}

function readPhase() {
  // Heuristic: look for "Break" in UI, else work if running, else paused
  const bodyText = document.body.innerText.toLowerCase();
  if (bodyText.includes("break")) return "break";
  return isRunning() ? "work" : "paused";
}
function isRunning() {
  // If there's a visible Pause button, assume running
  const btns = Array.from(document.querySelectorAll("button, [role=button]"));
  return btns.some(b => /pause/i.test(b.innerText || b.ariaLabel || ""));
}
function readTimer() {
  // Common formats: 25:00, 05:00
  const m = document.body.innerText.match(/\b\d{1,2}:\d{2}\b/);
  return m ? m[0] : "--:--";
}
function readTask() {
  // Try known inputs/headings; fallback to title
  const candidates = [
    'input[name="task"]',
    'input[placeholder*="task" i]',
    '[data-testid="task"]',
    'h1', 'h2', '.task', '.current-task'
  ];
  for (const sel of candidates) {
    const t = textOf(sel);
    if (t) return t;
    const el = document.querySelector(sel);
    if (el && el.value) return String(el.value).trim();
  }
  return (document.title || "").replace(/\s*-+\s*pomodoro.*/i, "").trim();
}

let wsReady = false; // we send via background, not directly

function sendState() {
  const msg = {
    type: "state",
    timer: readTimer(),
    task: readTask(),
    phase: readPhase(),
    running: isRunning()
  };
  browser.runtime.sendMessage(msg).catch(() => {});
}

// Observe changes to keep in sync
const obs = new MutationObserver(() => sendState());
obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

window.addEventListener("load", sendState);
setInterval(sendState, 1000);

// Receive commands from background (coming from GNOME)
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "command") return;
  if (msg.cmd === "start") {
    // If already running, do nothing; else click Start
    if (!isRunning()) clickButton(/start|resume/i);
  } else if (msg.cmd === "pause") {
    if (isRunning()) clickButton(/pause|stop/i);
  }
});
