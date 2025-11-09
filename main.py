# backend/main.py
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime

app = FastAPI(title="Server Shepherd - Backend (Simple)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        living = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
                living.append(connection)
            except Exception:
                # drop dead socket
                pass
        self.active_connections = living

manager = ConnectionManager()

# In-memory storage of recent events
RECENT_EVENTS = []  # keep up to N events
MAX_EVENTS = 200

def parse_log_line(line: str) -> dict:
    """
    Very simple log parser for common combined log formats.
    If the log doesn't match, returns minimal parsed dict.
    Example nginx log:
    127.0.0.1 - - [09/Nov/2025:10:00:00 +0000] "GET /path HTTP/1.1" 200 612 "-" "User-Agent"
    """
    try:
        parts = line.strip().split('"')
        # parts example: ['127.0.0.1 - - [date] ', 'GET /path HTTP/1.1', ' 200 612 ', ' - ', 'User-Agent']
        pre = parts[0].strip()
        request = parts[1].strip() if len(parts) > 1 else "-"
        post = parts[2].strip() if len(parts) > 2 else ""
        # status is the first number in post
        status = None
        size = None
        post_parts = post.split()
        if len(post_parts) >= 1:
            try:
                status = int(post_parts[0])
            except:
                status = None
        if len(post_parts) >= 2:
            try:
                size = int(post_parts[1])
            except:
                size = None
        ip = pre.split()[0] if pre.split() else "unknown"
        ts = None
        # try find timestamp between []
        if "[" in pre and "]" in pre:
            start = pre.index("[") + 1
            end = pre.index("]")
            ts_raw = pre[start:end]
            ts = ts_raw
        parsed = {
            "raw": line.strip(),
            "ip": ip,
            "request": request,
            "status": status or 0,
            "size": size,
            "timestamp": ts or datetime.utcnow().isoformat(),
        }
        return parsed
    except Exception:
        return {
            "raw": line.strip(),
            "ip": "unknown",
            "request": "-",
            "status": 0,
            "size": None,
            "timestamp": datetime.utcnow().isoformat(),
        }

@app.post("/ingest")
async def ingest(request: Request):
    """
    Endpoint for the log agent to POST new log lines.
    Body: { "line": "<raw log line>" }
    """
    data = await request.json()
    line = data.get("line", "")
    parsed = parse_log_line(line)
    parsed["received_at"] = datetime.utcnow().isoformat()
    # add id
    parsed["id"] = int(datetime.utcnow().timestamp() * 1000)
    # add "severity" or type to help frontend:
    if parsed["status"] >= 500:
        parsed["type"] = "error"
    elif parsed["status"] >= 400:
        parsed["type"] = "warning"
    else:
        parsed["type"] = "ok"

    RECENT_EVENTS.append(parsed)
    if len(RECENT_EVENTS) > MAX_EVENTS:
        RECENT_EVENTS.pop(0)

    # Broadcast to connected WebSocket clients
    asyncio.create_task(manager.broadcast({"event": "new_log", "data": parsed}))
    return {"ok": True, "parsed": parsed}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for frontend clients to receive live events.
    """
    await manager.connect(websocket)
    try:
        # Send initial batch
        await websocket.send_json({"event": "init", "data": RECENT_EVENTS})
        while True:
            # Keep connection alive; we don't expect messages from frontend for now.
            msg = await websocket.receive_text()
            # allow clients to request stats or ack messages by sending JSON strings
            try:
                payload = json.loads(msg)
                if payload.get("action") == "ack":
                    ack_id = payload.get("id")
                    # mark event as acknowledged in memory
                    for ev in RECENT_EVENTS:
                        if ev.get("id") == ack_id:
                            ev["acknowledged"] = True
                            ev["ack_time"] = datetime.utcnow().isoformat()
                            # broadcast ack update
                            await manager.broadcast({"event": "ack", "data": ev})
                            break
            except Exception:
                # ignore non-json pings
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/events")
def get_events():
    """Return recent events for quick debugging"""
    return {"events": RECENT_EVENTS}
