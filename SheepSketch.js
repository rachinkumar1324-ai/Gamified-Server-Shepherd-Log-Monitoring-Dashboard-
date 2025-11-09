// client/src/SheepSketch.js
import React, { useEffect, useRef } from "react";
import p5 from "p5";

export default function SheepSketch({ events = [], onSelectEvent }) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);
  const sheepPositionsRef = useRef({}); // map event.id -> {x,y,size}

  useEffect(() => {
    const sketch = (s) => {
      const width = 800;
      const height = 600;

      s.setup = () => {
        const cnv = s.createCanvas(width, height);
        cnv.parent(containerRef.current);
        s.frameRate(20);
      };

      s.draw = () => {
        s.background(250);
        s.noStroke();

        // simple layout: place sheep randomly but stable per id
        const pad = 40;
        const cols = 6;
        const wcell = (width - pad * 2) / cols;
        const rows = Math.ceil(events.length / cols);
        events.forEach((ev, idx) => {
          let pos = sheepPositionsRef.current[ev.id];
          if (!pos) {
            // stable pseudo-random position based on id
            const rnd = (ev.id % 1000) / 1000;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = pad + col * wcell + wcell * 0.5;
            const y = pad + row * 80 + (rnd * 30);
            const size = 36;
            pos = { x, y, size };
            sheepPositionsRef.current[ev.id] = pos;
          }

          // draw sheep "bubble"
          if (ev.type === "error") {
            s.fill(255, 200, 200); // light red
            s.stroke(180, 30, 30);
          } else if (ev.type === "warning") {
            s.fill(255, 244, 200);
            s.stroke(200, 140, 0);
          } else {
            s.fill(220, 255, 230);
            s.stroke(20, 140, 80);
          }

          s.strokeWeight(1.8);
          s.ellipse(pos.x, pos.y, pos.size, pos.size * 0.8);

          // small face
          s.fill(50);
          s.noStroke();
          s.ellipse(pos.x - 6, pos.y - 4, 4, 4);
          s.ellipse(pos.x + 6, pos.y - 4, 4, 4);

          // if acknowledged, put a check
          if (ev.acknowledged) {
            s.fill(34, 139, 34);
            s.textSize(12);
            s.textAlign(s.CENTER, s.CENTER);
            s.text("✓", pos.x + pos.size/3, pos.y - pos.size/3);
          }
        });
      };

      s.mousePressed = () => {
        const mx = s.mouseX, my = s.mouseY;
        for (const ev of events) {
          const pos = sheepPositionsRef.current[ev.id];
          if (!pos) continue;
          const dx = mx - pos.x, dy = my - pos.y;
          if (dx * dx + dy * dy < (pos.size/2) * (pos.size/2)) {
            if (onSelectEvent) onSelectEvent(ev);
            break;
          }
        }
      };
    };

    instanceRef.current = new p5(sketch);

    return () => {
      if (instanceRef.current) {
        instanceRef.current.remove();
      }
    };
  }, [events, onSelectEvent]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
