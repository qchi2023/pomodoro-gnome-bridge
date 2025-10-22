"""
WebSocket relay server for synchronising GNOME Shell, browser extension and web state.

This relay maintains a list of connected clients separated by roles ("gnome" for the GNOME
Shell extension and "browser" for the Firefox extension).  It stores the most recent
Pomodoro state received from the browser and forwards it to all connected GNOME clients.

The state dictionary now includes a `loggedIn` boolean to indicate whether the user is
authenticated on the pomodoro-tracker.com website.  GNOME extensions can use this flag
to display an appropriate message when the user is not logged in.
"""

import asyncio
import json
import websockets

# Mapping of role to a set of websocket connections.  Roles can be "gnome" or
# "browser".  Each time a client connects it identifies itself with the hello message.
CLIENTS: dict[str, set] = {}

# Global state of the pomodoro.  Includes the timer display, current task name,
# phase ("work", "break", "paused"), whether the timer is running, and whether
# the user is logged in on pomodoro-tracker.com.  When a browser client sends
# a state update these fields are updated.
STATE = {
    "timer": "--:--",
    "task": "",
    "phase": "paused",
    "running": False,
    "loggedIn": False,
}


async def register(ws: websockets.WebSocketServerProtocol, role: str) -> None:
    """Register a websocket under a role and send the current state."""
    if role not in CLIENTS:
        CLIENTS[role] = set()
    CLIENTS[role].add(ws)
    # Immediately send the last known state to the new client.  This ensures
    # newly connected GNOME extensions display up-to-date information.
    await ws.send(json.dumps({"type": "state", **STATE}))


async def unregister(ws: websockets.WebSocketServerProtocol) -> None:
    """Unregister a websocket from all roles."""
    for conns in CLIENTS.values():
        conns.discard(ws)


async def handler(ws: websockets.WebSocketServerProtocol) -> None:
    """Handle incoming messages from a client websocket."""
    role = "unknown"
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                # Ignore malformed messages.
                continue

            # Handle hello message to register the client.
            if msg.get("type") == "hello":
                role = msg.get("client", "unknown")
                await register(ws, role)
                continue

            # Handle incoming state updates from the browser.  Update the global
            # state and forward it to all connected GNOME clients.  Unknown keys
            # are ignored.  The browser should include `loggedIn` in its state.
            if msg.get("type") == "state":
                for key in ("timer", "task", "phase", "running", "loggedIn"):
                    if key in msg:
                        STATE[key] = msg[key]
                # Send the updated state to all GNOME clients (excluding sender).
                for gws in CLIENTS.get("gnome", set()):
                    if gws is not ws:
                        await gws.send(json.dumps({"type": "state", **STATE}))
                continue

            # Handle command messages coming from the GNOME extension.  Relay
            # command to all browser clients (to control the timer on the site).
            if msg.get("type") == "command":
                for bws in CLIENTS.get("browser", set()):
                    await bws.send(json.dumps({"type": "command", "cmd": msg.get("cmd")}))
                continue
    finally:
        # Unregister the websocket when it closes or errors.
        await unregister(ws)


async def main() -> None:
    """Start the WebSocket relay server on localhost:8787."""
    async with websockets.serve(handler, "127.0.0.1", 8787):
        print("Relay listening on ws://127.0.0.1:8787")
        await asyncio.Future()  # Run forever.


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass