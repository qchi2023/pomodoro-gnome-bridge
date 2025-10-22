/*
 * Content script injected into pomodoro-tracker.com.  It reads the current
 * timer, task, phase and running state directly from the DOM and sends
 * periodic state updates to the extension background script.  It also
 * determines whether the user is logged in by checking for common login
 * elements.  When the GNOME extension sends start/pause commands, this
 * script clicks the appropriate buttons on the page.
 */

// Helper function to safely get trimmed text from the first matching element.
function textOf(selector) {
  const el = document.querySelector(selector);
  return el ? (el.textContent || '').trim() : '';
}

// Determine if the pomodoro timer is currently running by checking if a
// "Pause" button is visible on the page.  If the timer is not running,
// there should be a "Start" or "Resume" button instead.
function isRunning() {
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
  return buttons.some(btn => /pause|stop/i.test(btn.innerText || btn.ariaLabel || ''));
}

// Read the current phase (work or break) by inspecting the page text.
function readPhase() {
  const body = document.body.innerText.toLowerCase();
  if (body.includes('break')) {
    return 'break';
  }
  return isRunning() ? 'work' : 'paused';
}

// Extract the timer in MM:SS format by searching the page text for a
// pattern.  Returns "--:--" if no timer is found.
function readTimer() {
  const match = document.body.innerText.match(/\b\d{1,2}:\d{2}\b/);
  return match ? match[0] : '--:--';
}

// Read the current task name from common selectors or fall back to the
// document title if nothing else is found.  Trims away any pomodoro
// tracker suffix from the title.
function readTask() {
  const selectors = [
    'input[name="task"]',
    'input[placeholder*="task" i]',
    '[data-testid="task"]',
    'h1',
    'h2',
    '.task',
    '.current-task',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    if (el.value) {
      const value = String(el.value).trim();
      if (value) return value;
    }
    const text = (el.textContent || '').trim();
    if (text) return text;
  }
  const title = (document.title || '').replace(/\s*-+\s*pomodoro.*/i, '').trim();
  return title || '';
}

// Determine if the user is logged in.  If the page contains login forms or
// prompts, assume the user is not logged in.  If none of the typical login
// elements are present, assume the user is logged in.
function isLoggedIn() {
  // Common login selectors: email/password fields or login buttons/links.
  const selectors = [
    'form[action*="login" i]',
    'input[type="email"]',
    'input[type="password"]',
    'button[type="submit"][name*="login" i]',
    'a[href*="login" i]',
    'div.login',
  ];
  for (const sel of selectors) {
    if (document.querySelector(sel)) {
      return false;
    }
  }
  return true;
}

// Click the first button whose label matches the provided regular expression.
function clickButton(regex) {
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
  for (const btn of buttons) {
    const label = (btn.innerText || btn.ariaLabel || '').trim();
    if (regex.test(label)) {
      btn.click();
      break;
    }
  }
}

// Send the current state to the background script so it can forward it to the
// relay and ultimately the GNOME extension.  This function runs on a timer
// and also when the DOM changes.
function sendState() {
  const state = {
    type: 'state',
    timer: readTimer(),
    task: readTask(),
    phase: readPhase(),
    running: isRunning(),
    loggedIn: isLoggedIn(),
  };
  browser.runtime.sendMessage(state).catch(() => {});
}

// Listen for mutation events to detect real-time updates to the timer or task.
const observer = new MutationObserver(() => sendState());
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

// Initial state emission and periodic updates.
window.addEventListener('load', sendState);
setInterval(sendState, 1000);

// Receive commands from the background script (originating from the GNOME panel)
// and trigger corresponding actions on the page.
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'command') return;
  switch (msg.cmd) {
    case 'start':
      if (!isRunning()) clickButton(/start|resume/i);
      break;
    case 'pause':
      if (isRunning()) clickButton(/pause|stop/i);
      break;
  }
});