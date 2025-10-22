import asyncio, json, websockets

CLIENTS = {}  # role -> set of websockets
STATE = {"timer":"--:--","task":"","phase":"paused","running":False}

async def register(ws, role):
    CLIENTS.setdefault(role, set()).add(ws)
    # push last known state to newcomers (especially GNOME)
    await ws.send(json.dumps({"type":"state", **STATE}))

async def unregister(ws):
    for s in CLIENTS.values():
        s.discard(ws)

async def handler(ws):
    role = "unknown"
    try:
        async for raw in ws:
            try: msg = json.loads(raw)
            except: continue

            if msg.get("type") == "hello":
                role = msg.get("client","unknown")
                await register(ws, role)
                continue

            if msg.get("type") == "state":
                # Update and fan out to GNOME
                for k in ("timer","task","phase","running"):
                    if k in msg: STATE[k] = msg[k]
                for g in CLIENTS.get("gnome", set()):
                    if g is not ws:
                        await g.send(json.dumps({"type":"state", **STATE}))
                continue

            if msg.get("type") == "command":
                # Relay commands from GNOME to browser
                for b in CLIENTS.get("browser", set()):
                    await b.send(json.dumps({"type":"command","cmd":msg.get("cmd")}))
                continue
    finally:
        await unregister(ws)

async def main():
    async with websockets.serve(handler, "127.0.0.1", 8787):
        print("Relay listening on ws://127.0.0.1:8787")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
