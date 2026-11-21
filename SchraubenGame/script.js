(() => {
  "use strict";

  const L = ScrewLogic;
  const SVGNS = "http://www.w3.org/2000/svg";
  const SAVE_KEY = "schrauben-stand";

  const board = document.getElementById("board");
  const boxesEl = document.getElementById("boxes");
  const bufferEl = document.getElementById("buffer");
  const levelEl = document.getElementById("level");
  const leftEl = document.getElementById("left");
  const boxesLeftEl = document.getElementById("boxes-left");
  const undoBtn = document.getElementById("undo-btn");
  const slotBtn = document.getElementById("slot-btn");
  const freeBtn = document.getElementById("free-btn");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const overlayBtn = document.getElementById("overlay-btn");
  const overlayAlt = document.getElementById("overlay-alt");

  let level = 1;
  let st = null;
  let initial = null;
  let history = [];
  let busy = false;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function save() {
    store.set(SAVE_KEY, JSON.stringify({ level, st, initial }));
  }

  function load() {
    try {
      const s = JSON.parse(store.get(SAVE_KEY));
      if (!s || !Number.isInteger(s.level) || !s.st || !Array.isArray(s.st.screws) || !Array.isArray(s.st.plates)) return false;
      level = Math.max(1, s.level);
      if (s.st.won) { level++; return false; }
      st = s.st; initial = s.initial || clone(s.st); st.lost = false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function newLevel() {
    initial = L.generate(level);
    restart();
  }

  function restart() {
    st = clone(initial);
    history = [];
    busy = false;
    overlay.classList.add("hidden");
    renderAll();
    save();
  }

  // ---------- Darstellung ----------

  const el = (name, attrs = {}) => {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  function screwGlyph(color, x, y, rot) {
    const g = el("g", { class: "screw", transform: `translate(${x} ${y}) rotate(${rot})` });
    g.appendChild(el("circle", { class: "rim", r: L.R + 1.5 }));
    g.appendChild(el("circle", { r: L.R - 0.5, fill: color }));
    g.appendChild(el("circle", { class: "shine", r: 4, cx: -4, cy: -4 }));
    g.appendChild(el("line", { class: "slotline", x1: -6, y1: 0, x2: 6, y2: 0 }));
    g.appendChild(el("line", { class: "slotline", x1: 0, y1: -6, x2: 0, y2: 6 }));
    return g;
  }

  function renderBoard(falling = -1) {
    board.innerHTML = "";
    st.plates.forEach((p, pi) => {
      if (p.fallen && pi !== falling) return;
      const outer = el("g");
      if (pi === falling) {
        outer.setAttribute("class", "falling");
        outer.style.setProperty("--fx", `${(Math.random() * 2 - 1) * 60}px`);
        outer.style.setProperty("--fr", `${(Math.random() * 2 - 1) * 70}deg`);
      }
      const g = el("g", { class: "plate", transform: `translate(${p.x} ${p.y}) rotate(${p.a})` });
      g.appendChild(el("rect", {
        x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: p.r,
        fill: `hsla(${p.hue}, 45%, 72%, 0.62)`, stroke: `hsla(${p.hue}, 60%, 88%, 0.95)`
      }));
      p.holes.forEach(([lx, ly]) => g.appendChild(el("circle", { class: "hole", cx: lx, cy: ly, r: L.R - 2 })));
      outer.appendChild(g);
      // Schrauben gehören über ihre Platte, aber unter höhere Platten
      st.screws.forEach((s, si) => {
        if (s.p !== pi || s.out) return;
        const [x, y] = L.screwPos(st, s);
        const sg = screwGlyph(L.SCREW_COLORS[s.c], x, y, p.a + 20);
        sg.dataset.id = si;
        if (L.isFree(st, s)) sg.classList.add("free");
        outer.appendChild(sg);
      });
      board.appendChild(outer);
    });
  }

  function headEl(color, pending) {
    const h = document.createElement("div");
    h.className = "head" + (pending ? " pending" : "");
    h.style.setProperty("--c", L.SCREW_COLORS[color]);
    return h;
  }

  function renderTrays() {
    boxesEl.innerHTML = "";
    st.boxes.forEach((b) => {
      const box = document.createElement("div");
      box.className = "box" + (b ? "" : " empty");
      if (b) box.style.setProperty("--box", L.SCREW_COLORS[b.c]);
      for (let k = 0; k < L.BOX_SIZE; k++) {
        const slot = document.createElement("div");
        slot.className = "slot";
        if (b && k < b.n) slot.appendChild(headEl(b.c));
        box.appendChild(slot);
      }
      boxesEl.appendChild(box);
    });
    bufferEl.innerHTML = "";
    for (let k = 0; k < st.bufferCap; k++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      if (k < st.buffer.length) slot.appendChild(headEl(st.buffer[k]));
      bufferEl.appendChild(slot);
    }
    bufferEl.classList.toggle("warn", st.buffer.length >= st.bufferCap - 1);
  }

  function renderHud() {
    levelEl.textContent = level;
    leftEl.textContent = st.screws.filter((s) => !s.out).length;
    boxesLeftEl.textContent = st.queue.length - st.qi + st.boxes.filter(Boolean).length;
    undoBtn.disabled = !history.length;
    slotBtn.disabled = st.extraUsed;
  }

  function renderAll() {
    renderBoard();
    renderTrays();
    renderHud();
  }

  // Schraubenkopf von a nach b fliegen lassen (Bildschirmkoordinaten)
  async function fly(color, from, toEl) {
    const r = toEl.getBoundingClientRect();
    const size = r.width;
    const f = document.createElement("div");
    f.className = "fly";
    f.style.width = f.style.height = size + "px";
    f.style.left = from.x - size / 2 + "px";
    f.style.top = from.y - size / 2 + "px";
    f.appendChild(headEl(color));
    f.firstChild.style.width = f.firstChild.style.height = "100%";
    document.body.appendChild(f);
    f.getBoundingClientRect();
    f.style.transform = `translate(${r.left + size / 2 - from.x}px, ${r.top + size / 2 - from.y}px)`;
    await wait(330);
    f.remove();
  }

  const centerOf = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const slotIn = (boxIdx, slot) => boxesEl.children[boxIdx].children[slot];

  // ---------- Spielzug ----------

  function svgPoint(evt) {
    const pt = board.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(board.getScreenCTM().inverse());
  }

  function screwAt(x, y) {
    let best = -1;
    st.screws.forEach((s, i) => {
      if (s.out || st.plates[s.p].fallen) return;
      const [sx, sy] = L.screwPos(st, s);
      if (Math.hypot(sx - x, sy - y) <= L.R + 5 && (best < 0 || s.p > st.screws[best].p)) best = i;
    });
    return best;
  }

  async function onTap(evt) {
    if (busy || st.won || st.lost) return;
    const { x, y } = svgPoint(evt);
    const idx = screwAt(x, y);
    if (idx < 0) return;
    const s = st.screws[idx];
    const glyph = board.querySelector(`.screw[data-id="${idx}"]`);
    if (!L.isFree(st, s)) {
      glyph.classList.remove("shake");
      void glyph.getBBox();
      glyph.classList.add("shake");
      return;
    }
    busy = true;
    const from = centerOf(glyph);
    const before = clone(st);
    const preBoxes = clone(st.boxes);
    const preBuffer = st.buffer.slice();
    const res = L.removeScrew(st, idx);
    if (res.lost) {
      st = before;           // Zug nicht ausführen, aber Undo anbieten
      st.lost = true;
      busy = false;
      showLost();
      return;
    }
    history.push(before);
    renderBoard(res.fell);
    renderHud();
    await animateEvents(res.events, s.c, from, preBoxes, preBuffer);
    renderAll();
    save();
    busy = false;
    if (st.won) setTimeout(showWon, 500);
  }

  /* Spielt die Ereignisse aus place() nach. Dazu wird ein Zwischenstand der
     Kisten/Ablage schrittweise aufgebaut und angezeigt. */
  async function animateEvents(events, color, from, boxes, buffer) {
    const view = { boxes, buffer, bufferCap: st.bufferCap };
    const show = () => {
      const real = { boxes: st.boxes, buffer: st.buffer };
      st.boxes = view.boxes; st.buffer = view.buffer;
      renderTrays();
      st.boxes = real.boxes; st.buffer = real.buffer;
    };
    let qi = initialQi(boxes);
    for (const ev of events) {
      if (ev.type === "box" || ev.type === "buffer") {
        const target = ev.type === "box" ? slotIn(ev.box, ev.slot) : bufferEl.children[ev.slot];
        await fly(color, from, target);
        if (ev.type === "box") view.boxes[ev.box].n++; else view.buffer.push(color);
        show();
        const t = ev.type === "box" ? slotIn(ev.box, ev.slot) : bufferEl.children[ev.slot];
        t.firstChild && t.firstChild.classList.add("pop");
      } else if (ev.type === "done") {
        await wait(180);
        boxesEl.children[ev.box].classList.add("leaving");
        await wait(330);
        view.boxes[ev.box] = qi < st.queue.length ? { c: st.queue[qi++], n: 0 } : null;
        show();
        await wait(150);
      } else if (ev.type === "fromBuffer") {
        const src = centerOf(bufferEl.children[ev.from]);
        const c = view.buffer[ev.from];
        view.buffer.splice(ev.from, 1);
        show();
        await fly(c, src, slotIn(ev.box, ev.slot));
        view.boxes[ev.box].n++;
        show();
      }
    }
    function initialQi() {
      // Wie viele Kisten waren vor dem Zug schon vergeben?
      const doneCount = events.filter((e) => e.type === "done").length;
      return st.qi - doneCount;
    }
  }

  function showWon() {
    overlayTitle.textContent = "Geschafft!";
    overlayText.innerHTML = `Level <strong>${level}</strong> gelöst – alle Platten sind gefallen.`;
    overlayBtn.textContent = "Nächstes Level";
    overlayAlt.classList.add("hidden");
    overlay.classList.remove("hidden");
  }

  function showLost() {
    overlayTitle.textContent = "Ablage voll!";
    overlayText.textContent = "Für diese Schraube ist kein Platz mehr. Nimm Züge zurück oder versuch es neu.";
    overlayBtn.textContent = "Neu starten";
    overlayAlt.classList.toggle("hidden", !history.length && st.extraUsed);
    overlayAlt.textContent = history.length ? "Zug zurück" : "Ablageplatz +1";
    overlay.classList.remove("hidden");
  }

  function undo() {
    if (busy || !history.length) return;
    st = history.pop();
    st.lost = false;
    overlay.classList.add("hidden");
    renderAll();
    save();
  }

  function addSlot() {
    if (busy || st.extraUsed) return;
    history.push(clone(st));
    st.extraUsed = true;
    st.lost = false;
    st.bufferCap++;
    overlay.classList.add("hidden");
    renderAll();
    save();
  }

  // ---------- Ereignisse ----------

  board.addEventListener("pointerdown", onTap);
  undoBtn.addEventListener("click", undo);
  slotBtn.addEventListener("click", addSlot);
  freeBtn.addEventListener("click", () => {
    const on = !board.classList.contains("free-on");
    board.classList.toggle("free-on", on);
    freeBtn.setAttribute("aria-pressed", String(on));
  });
  document.getElementById("restart-btn").addEventListener("click", () => { if (!busy) restart(); });
  overlayBtn.addEventListener("click", () => {
    if (st.won) { level++; newLevel(); } else restart();
  });
  overlayAlt.addEventListener("click", () => { if (history.length) undo(); else addSlot(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  });

  if (load()) { history = []; renderAll(); } else newLevel();
})();
