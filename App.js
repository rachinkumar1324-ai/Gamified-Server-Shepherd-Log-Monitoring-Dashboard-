import React, { useEffect, useRef, useState } from "react";
import SheepSketch from "./SheepSketch";

const WS_URL = "ws://localhost:8000/ws";

export default function App() {
  const wsRef = useRef(null);
  const [events, setEvents] = useState([]); // recent events
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("ws open");
    };
    ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        if (payload.event === "init") {
          setEvents(payload.data || []);
        } else if (payload.event === "new_log") {
          setEvents((prev) => [...prev, payload.data].slice(-200));
        } else if (payload.event === "ack") {
          setEvents((prev) => prev.map(e => e.id === payload.data.id ? payload.data : e));
        }
      } catch (e) {
        console.error("ws parse error", e);
      }
    };
    ws.onclose = () => console.log("ws closed");
    return () => ws.close();
  }, []);

  function ackEvent(evId) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "ack", id: evId }));
    }
    // optimistic update
    setEvents((prev) => prev.map(e => e.id === evId ? { ...e, acknowledged: true, ack_time: new Date().toISOString() } : e));
  }

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", height: "100vh", display: "flex", gap: 8 }}>
      <div style={{ flex: 1, borderRight: "1px solid #ddd", padding: 8 }}>
        <h2>Server Shepherd — Live View</h2>
        <div style={{ width: "100%", height: "80vh", border: "1px solid #ccc" }}>
          <SheepSketch events={events} onSelectEvent={setSelected} />
        </div>
      </div>

      <div style={{ width: 360, padding: 12 }}>
        <h3>Recent Events</h3>
        <div style={{ maxHeight: "70vh", overflow: "auto" }}>
          {events.slice().reverse().map(ev => (
            <div key={ev.id} style={{ padding: 8, marginBottom: 6, border: "1px solid #eee", background: ev.type === "error" ? "#ffecec" : ev.type === "warning" ? "#fff7e6" : "#f2fff5" }}>
              <div style={{ fontSize: 12, color: "#333" }}><strong>{ev.status}</strong> — {ev.request}</div>
              <div style={{ fontSize: 11, color: "#666" }}>{ev.ip} • {ev.timestamp}</div>
              <div style={{ marginTop: 6 }}>
                <button onClick={() => setSelected(ev)} style={{ marginRight: 6 }}>Details</button>
                {!ev.acknowledged && <button onClick={() => ackEvent(ev.id)}>Acknowledge</button>}
                {ev.acknowledged && <span style={{ marginLeft: 8, fontSize: 12, color: "#228B22" }}>Acknowledged</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12 }}>
          <h4>Selected Event</h4>
          {selected ? (
            <div style={{ fontSize: 13 }}>
              <div><strong>Status:</strong> {selected.status}</div>
              <div><strong>Request:</strong> {selected.request}</div>
              <div><strong>IP:</strong> {selected.ip}</div>
              <div><strong>Raw:</strong><pre style={{ maxHeight: 120, overflow: "auto" }}>{selected.raw}</pre></div>
              {!selected.acknowledged ? (
                <button onClick={() => { wsRef.current.send(JSON.stringify({ action: "ack", id: selected.id })); setSelected(null); }}>Acknowledge</button>
              ) : <div style={{ color: "#228B22" }}>Already acknowledged</div>}
            </div>
          ) : <div>Click a recent event or a sheep to view details.</div>}
        </div>
      </div>
    </div>
  );
}
