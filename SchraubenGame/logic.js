/* Schrauben-Puzzle – Spiellogik und Level-Generator (ohne DOM). */
const ScrewLogic = (() => {
  "use strict";

  const W = 360, H = 420;     // Spielfeld (SVG-Einheiten)
  const R = 13;               // Radius eines Schraubenkopfs
  const BOX_SIZE = 3;         // Schrauben je Kiste
  const ACTIVE_BOXES = 2;     // gleichzeitig offene Kisten
  const BUFFER = 5;           // Ablageplätze
  const SCREW_COLORS = ["#ff4d4d", "#3d8bff", "#ffd23f", "#3ddc84", "#b06bff", "#ff9a3c", "#ff6fcf", "#4fe3e3"];
  const ANGLES = [0, 0, 0, 90, 90, 15, -15, 30, -30, 45, -45, 60, -60];

  // ---------- Geometrie ----------

  function toWorld(p, lx, ly) {
    const a = p.a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
  }

  function toLocal(p, x, y) {
    const a = -p.a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = x - p.x, dy = y - p.y;
    return [dx * c - dy * s, dx * s + dy * c];
  }

  // Abstand eines Punkts zur Platte (0 = innen)
  function distToPlate(p, x, y) {
    const [lx, ly] = toLocal(p, x, y);
    const r = Math.min(p.r, p.w / 2, p.h / 2);
    const qx = Math.abs(lx) - (p.w / 2 - r), qy = Math.abs(ly) - (p.h / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }

  const screwPos = (st, s) => toWorld(st.plates[s.p], ...st.plates[s.p].holes[s.h]);

  // Eine Schraube ist frei, wenn keine höhere, noch hängende Platte ihren Kopf überdeckt.
  function isFree(st, s) {
    if (s.out || st.plates[s.p].fallen) return false;
    const [x, y] = screwPos(st, s);
    for (let q = s.p + 1; q < st.plates.length; q++) {
      const pl = st.plates[q];
      if (!pl.fallen && distToPlate(pl, x, y) < R * 0.75) return false;
    }
    return true;
  }

  // ---------- Kisten & Ablage ----------

  /* Legt eine Schraube der Farbe c ab. Verändert st.boxes / st.buffer / st.qi.
     Liefert eine Liste von Ereignissen für die Animation oder null, wenn die
     Ablage voll ist (verloren). */
  function place(st, c) {
    const events = [];
    let target = -1;
    st.boxes.forEach((b, i) => {
      if (b && b.c === c && b.n < BOX_SIZE && (target < 0 || b.n > st.boxes[target].n)) target = i;
    });
    if (target >= 0) {
      st.boxes[target].n++;
      events.push({ type: "box", box: target, slot: st.boxes[target].n - 1 });
    } else {
      if (st.buffer.length >= st.bufferCap) return null;
      st.buffer.push(c);
      events.push({ type: "buffer", slot: st.buffer.length - 1 });
    }
    settle(st, events);
    return events;
  }

  // Volle Kisten abräumen, nächste nachrücken lassen, Ablage einsortieren.
  function settle(st, events) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < st.boxes.length; i++) {
        const b = st.boxes[i];
        if (b && b.n >= BOX_SIZE) {
          st.boxes[i] = st.qi < st.queue.length ? { c: st.queue[st.qi++], n: 0 } : null;
          events.push({ type: "done", box: i });
          changed = true;
        }
      }
      for (let i = 0; i < st.boxes.length; i++) {
        const b = st.boxes[i];
        if (!b) continue;
        let k;
        while (b.n < BOX_SIZE && (k = st.buffer.indexOf(b.c)) >= 0) {
          st.buffer.splice(k, 1);
          b.n++;
          events.push({ type: "fromBuffer", from: k, box: i, slot: b.n - 1 });
          changed = true;
        }
      }
    }
  }

  // Schraube herausdrehen. Liefert { events, fell } oder { lost: true }.
  function removeScrew(st, idx) {
    const s = st.screws[idx];
    const events = place(st, s.c);
    if (!events) { st.lost = true; return { lost: true }; }
    s.out = true;
    const pl = st.plates[s.p];
    let fell = -1;
    if (st.screws.every((t) => t.p !== s.p || t.out)) { pl.fallen = true; fell = s.p; }
    if (st.screws.every((t) => t.out)) st.won = true;
    return { events, fell };
  }

  // ---------- Generator ----------

  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makePlate(rng) {
    const kind = rng();
    let w, h, holes;
    if (kind < 0.45) {                        // Leiste
      w = 140 + Math.floor(rng() * 110); h = 38;
      const e = w / 2 - 19;
      holes = [[-e, 0], [e, 0]];
      if (w > 215 && rng() < 0.5) holes.push([0, 0]);
    } else if (kind < 0.85) {                 // Rechteck
      w = 90 + Math.floor(rng() * 60); h = 70 + Math.floor(rng() * 45);
      const ex = w / 2 - 19, ey = h / 2 - 19;
      holes = rng() < 0.5
        ? [[-ex, -ey], [ex, -ey], [-ex, ey], [ex, ey]]
        : (rng() < 0.5 ? [[-ex, -ey], [ex, ey]] : [[ex, -ey], [-ex, ey]]);
    } else {                                  // kleines Quadrat
      w = h = 64 + Math.floor(rng() * 16);
      holes = [[0, 0]];
    }
    return { x: 0, y: 0, w, h, r: Math.min(16, h / 2), a: ANGLES[Math.floor(rng() * ANGLES.length)],
      hue: Math.floor(rng() * 360), holes, fallen: false };
  }

  function placePlates(count, rng) {
    const plates = [], points = [];
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 80; tries++) {
        const p = makePlate(rng);
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => toWorld({ ...p, x: 0, y: 0 }, sx * p.w / 2, sy * p.h / 2));
        const ex = Math.max(...corners.map((c) => Math.abs(c[0]))), ey = Math.max(...corners.map((c) => Math.abs(c[1])));
        if (2 * ex > W - 16 || 2 * ey > H - 16) continue;
        // Mitte bevorzugen, damit sich die Platten überlappen
        const spread = 0.55 + 0.45 * rng();
        p.x = W / 2 + (rng() * 2 - 1) * (W / 2 - 8 - ex) * spread;
        p.y = H / 2 + (rng() * 2 - 1) * (H / 2 - 8 - ey) * spread;
        const pts = p.holes.map(([lx, ly]) => toWorld(p, lx, ly));
        if (pts.some(([x, y]) => points.some(([u, v]) => Math.hypot(x - u, y - v) < 2 * R + 7))) continue;
        plates.push(p);
        points.push(...pts);
        break;
      }
    }
    return plates;
  }

  function settings(level) {
    return {
      plates: Math.min(4 + level, 17),
      colors: Math.min(3 + Math.floor(level / 2), SCREW_COLORS.length),
      maxBuffer: level <= 2 ? 2 : level <= 5 ? 3 : 4,
      window: Math.min(6 + level, 18),
      mixing: Math.min(1 + level * 0.4, 5)
    };
  }

  function freshState(plates, screws, queue) {
    return {
      plates, screws, queue,
      boxes: queue.slice(0, ACTIVE_BOXES).map((c) => ({ c, n: 0 })),
      qi: Math.min(ACTIVE_BOXES, queue.length),
      buffer: [], bufferCap: BUFFER, extraUsed: false, won: false, lost: false
    };
  }

  // Größte Ablagebelegung, wenn die Schrauben in der Reihenfolge `order` gelöst werden.
  function bufferNeed(colors, order, queue) {
    const st = { boxes: queue.slice(0, ACTIVE_BOXES).map((c) => ({ c, n: 0 })),
      qi: Math.min(ACTIVE_BOXES, queue.length), queue, buffer: [], bufferCap: Infinity };
    let max = 0;
    for (const i of order) {
      place(st, colors[i]);
      max = Math.max(max, st.buffer.length);
    }
    return max;
  }

  function generate(level, seed = (Math.random() * 2 ** 31) | 0) {
    const rng = mulberry(seed);
    const cfg = settings(level);
    const plates = placePlates(cfg.plates, rng);
    let screws = [];
    plates.forEach((p, pi) => p.holes.forEach((_, h) => screws.push({ p: pi, h, c: 0, out: false })));
    // Anzahl durch 3 teilbar machen: überzählige Löcher entfernen
    while (screws.length % BOX_SIZE) {
      const cand = screws.filter((s) => plates[s.p].holes.length > 1);
      const s = cand.length ? cand[Math.floor(rng() * cand.length)] : screws[screws.length - 1];
      plates[s.p].holes.splice(s.h, 1);
      screws = [];
      plates.forEach((p, pi) => p.holes.forEach((_, h) => screws.push({ p: pi, h, c: 0, out: false })));
    }
    if (!screws.length) return generate(level, seed + 1);

    // Eine mögliche Lösereihenfolge auswürfeln
    const sim = freshState(plates.map((p) => ({ ...p, fallen: false })), screws.map((s) => ({ ...s })), []);
    const order = [];
    while (order.length < screws.length) {
      const free = sim.screws.map((s, i) => i).filter((i) => isFree(sim, sim.screws[i]));
      const i = free[Math.floor(rng() * free.length)];
      order.push(i);
      const s = sim.screws[i];
      s.out = true;
      if (sim.screws.every((t) => t.p !== s.p || t.out)) sim.plates[s.p].fallen = true;
    }

    // Kistenfolge: Farben in Dreiergruppen entlang der Reihenfolge, dann vermischen
    const boxes = screws.length / BOX_SIZE;
    const queue = [];
    for (let b = 0; b < boxes; b++) {
      let c;
      do { c = Math.floor(rng() * cfg.colors); } while (b >= 1 && c === queue[b - 1] && cfg.colors > 1 && rng() < 0.8);
      queue.push(c);
    }
    const colors = new Array(screws.length);
    order.forEach((idx, t) => { colors[idx] = queue[Math.floor(t / BOX_SIZE)]; });

    const tries = Math.floor(screws.length * cfg.mixing * 4);
    for (let k = 0; k < tries; k++) {
      const t1 = Math.floor(rng() * order.length);
      const t2 = Math.min(order.length - 1, Math.max(0, t1 + Math.floor((rng() * 2 - 1) * cfg.window)));
      const i1 = order[t1], i2 = order[t2];
      if (colors[i1] === colors[i2]) continue;
      [colors[i1], colors[i2]] = [colors[i2], colors[i1]];
      if (bufferNeed(colors, order, queue) > cfg.maxBuffer) [colors[i1], colors[i2]] = [colors[i2], colors[i1]];
    }
    screws.forEach((s, i) => { s.c = colors[i]; });
    return freshState(plates, screws, queue);
  }

  return { W, H, R, BOX_SIZE, BUFFER, SCREW_COLORS, toWorld, screwPos, isFree, removeScrew, settle, generate, bufferNeed };
})();

if (typeof module !== "undefined") module.exports = ScrewLogic;
