(() => {
  "use strict";

  const S = Solitaire;
  const OPTIONS = {
    klondike: [{ v: 1, label: "1 Karte ziehen" }, { v: 3, label: "3 Karten" }],
    spider: [{ v: 1, label: "1 Farbe" }, { v: 2, label: "2 Farben" }, { v: 4, label: "4 Farben" }],
    freecell: []
  };
  const DEFAULT_OPT = { klondike: 1, spider: 1, freecell: 0 };

  const tableEl = document.getElementById("table");
  const optionsEl = document.getElementById("options");
  const timeEl = document.getElementById("time");
  const movesEl = document.getElementById("moves");
  const messageEl = document.getElementById("message");
  const undoBtn = document.getElementById("undo-btn");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");
  const variantBtns = [...document.querySelectorAll(".variant")];

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } }
  };

  let variant = "klondike";
  let opts = { ...DEFAULT_OPT };
  let rules = S.VARIANTS.klondike;
  let state = null;
  let history = [];
  let moves = 0;
  let seconds = 0;
  let started = false;
  let won = false;
  let busy = false;
  let drag = null;
  let geo = null;
  let msgTimer = 0;
  const cardEls = new Map();

  // ---------- Speichern & Statistik ----------

  const saveKey = () => "solitaer-spiel-" + variant;
  const statKey = () => `${variant}-${state ? state.opt : opts[variant]}`;

  function save() {
    if (won) { store.set(saveKey(), null); return; }
    store.set(saveKey(), { opt: state.opt, piles: state.piles, moves, seconds, started });
  }

  function loadSaved() {
    const s = store.get(saveKey());
    if (!s || !Array.isArray(s.piles)) return false;
    const fresh = S.newState(variant, s.opt);
    if (fresh.piles.length !== s.piles.length) return false;
    const count = s.piles.reduce((n, p) => n + (Array.isArray(p.cards) ? p.cards.length : 0), 0);
    if (count !== fresh.piles.reduce((n, p) => n + p.cards.length, 0)) return false;
    state = { ...fresh, piles: s.piles };
    opts[variant] = s.opt;
    moves = s.moves | 0; seconds = s.seconds | 0; started = !!s.started;
    return true;
  }

  function stats() {
    const all = store.get("solitaer-statistik") || {};
    return all[statKey()] || { played: 0, won: 0, best: 0 };
  }

  function setStats(st) {
    const all = store.get("solitaer-statistik") || {};
    all[statKey()] = st;
    store.set("solitaer-statistik", all);
  }

  // ---------- Spielstart ----------

  function selectVariant(v) {
    variant = v;
    rules = S.VARIANTS[v];
    store.set("solitaer-variante", v);
    variantBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.variant === v)));
    clearCards();
    if (loadSaved()) {
      history = []; won = false;
      renderOptions(); render(); updateHud();
    } else {
      newGame();
    }
  }

  function newGame() {
    busy = true;
    say("Mische …", 0);
    renderOptions();
    setTimeout(() => {
      const opt = opts[variant];
      state = variant === "klondike" ? S.winnableKlondike(opt).state : S.newState(variant, opt);
      history = []; moves = 0; seconds = 0; started = false; won = false; busy = false;
      overlay.classList.add("hidden");
      clearCards();
      say(variant === "klondike" ? "Dieses Spiel ist garantiert lösbar." : "", 2500);
      render(true);
      updateHud();
      save();
    }, 20);
  }

  function renderOptions() {
    optionsEl.innerHTML = "";
    if (!OPTIONS[variant].length) {
      optionsEl.innerHTML = '<span class="note">Alle Karten offen · 4 freie Zellen</span>';
      return;
    }
    for (const o of OPTIONS[variant]) {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = o.label;
      b.setAttribute("aria-pressed", String(opts[variant] === o.v));
      b.addEventListener("click", () => {
        if (busy || opts[variant] === o.v) return;
        opts[variant] = o.v;
        store.set("solitaer-optionen", opts);
        newGame();
      });
      optionsEl.appendChild(b);
    }
  }

  // ---------- Darstellung ----------

  function computeGeometry() {
    const W = tableEl.clientWidth;
    const cols = rules.cols;
    const gap = Math.max(3, Math.min(14, W * 0.012));
    const cw = Math.min(104, (W - 2 * gap - gap * (cols - 1)) / cols);
    const ch = cw * 1.4;
    const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2;
    const top = Math.max(6, gap);
    const tabY = top + ch + gap * 2;
    const rect = tableEl.getBoundingClientRect();
    const H = Math.max(tabY + ch * 3.2, window.innerHeight - rect.top - 40 + window.scrollY * 0);
    tableEl.style.height = H + "px";
    const colX = (i) => x0 + i * (cw + gap);
    const pos = [];
    const v = state.v;
    if (variant === "klondike") {
      pos[v.stock] = [colX(0), top]; pos[v.waste] = [colX(1), top];
      v.found.forEach((f, k) => { pos[f] = [colX(3 + k), top]; });
    } else if (variant === "freecell") {
      v.cells.forEach((c, k) => { pos[c] = [colX(k), top]; });
      v.found.forEach((f, k) => { pos[f] = [colX(4 + k), top]; });
    } else {
      pos[v.stock] = [colX(0), top];
      v.found.forEach((f, k) => { pos[f] = [colX(2 + k), top]; });
    }
    v.tab.forEach((t, k) => { pos[t] = [colX(k), tabY]; });
    tableEl.style.setProperty("--cw", cw + "px");
    tableEl.style.setProperty("--ch", ch + "px");
    tableEl.classList.toggle("tiny", cw < 52);
    geo = { cw, ch, gap, pos, H, tabY };
  }

  // y-Versatz der Karten einer Spalte, so dass sie auf den Tisch passt
  function tabOffsets(cards) {
    const { ch, H, tabY, gap } = geo;
    let down = Math.max(ch * 0.12, 6), up = Math.max(ch * (variant === "spider" ? 0.24 : 0.27), 21);
    const need = cards.slice(0, -1).reduce((s, c) => s + (c.up ? up : down), 0);
    const avail = H - tabY - ch - gap;
    if (need > avail && need > 0) { const f = avail / need; down *= f; up *= f; }
    const ys = [];
    let y = 0;
    cards.forEach((c) => { ys.push(y); y += c.up ? up : down; });
    return ys;
  }

  function cardPositions() {
    const out = new Map();
    const { cw, pos } = geo;
    let z = 1;
    state.piles.forEach((p, pi) => {
      const [x, y] = pos[pi];
      const n = p.cards.length;
      if (p.kind === "tab") {
        const ys = tabOffsets(p.cards);
        p.cards.forEach((c, k) => out.set(c.id, { x, y: y + ys[k], z: z++, pi, k }));
      } else if (p.kind === "waste") {
        const fan = state.opt === 3 ? Math.min(3, n) : 1;
        p.cards.forEach((c, k) => {
          const f = Math.max(0, k - (n - fan));
          out.set(c.id, { x: x + f * cw * 0.24, y, z: z++, pi, k });
        });
      } else if (p.kind === "stock" && variant === "spider") {
        p.cards.forEach((c, k) => out.set(c.id, { x: x + Math.floor(k / 10) * cw * 0.08, y, z: z++, pi, k }));
      } else if (p.kind === "found" && variant === "spider") {
        p.cards.forEach((c, k) => out.set(c.id, { x, y, z: z + (n - k), pi, k }));
        z += n + 1;
      } else {
        p.cards.forEach((c, k) => out.set(c.id, { x, y, z: z++, pi, k }));
      }
    });
    return out;
  }

  function clearCards() {
    tableEl.innerHTML = "";
    cardEls.clear();
  }

  function makeCard(c) {
    const el = document.createElement("div");
    el.className = "card" + (S.isRed(c) ? " red" : "");
    const r = S.RANKS[c.r], s = S.SUITS[c.s];
    const face = c.r > 10 || c.r === 1;
    el.innerHTML = `<span class="tl">${r}<i>${s}</i></span><span class="tr">${s}</span>` +
      `<span class="mid${face && c.r !== 1 ? " face" : ""}">${c.r > 10 ? r + s : s}</span>`;
    el.dataset.id = c.id;
    tableEl.appendChild(el);
    cardEls.set(c.id, el);
    return el;
  }

  function renderSlots() {
    tableEl.querySelectorAll(".slot").forEach((e) => e.remove());
    state.piles.forEach((p, pi) => {
      const el = document.createElement("div");
      el.className = "slot " + p.kind;
      el.dataset.pile = pi;
      const [x, y] = geo.pos[pi];
      el.style.left = x + "px";
      el.style.top = y + "px";
      if (p.kind === "found") el.textContent = variant === "spider" ? "K" : "A";
      if (p.kind === "stock") el.textContent = variant === "klondike" ? "↻" : "";
      if (p.kind === "cell") el.textContent = "";
      tableEl.prepend(el);
    });
  }

  function render(instant = false) {
    computeGeometry();
    renderSlots();
    const positions = cardPositions();
    for (const [id, el] of cardEls) if (!positions.has(id)) { el.remove(); cardEls.delete(id); }
    state.piles.forEach((p) => p.cards.forEach((c) => {
      const el = cardEls.get(c.id) || makeCard(c);
      const at = positions.get(c.id);
      el.classList.toggle("down", !c.up);
      el.classList.remove("hint");
      el.dataset.pile = at.pi;
      el.dataset.idx = at.k;
      const left = at.x.toFixed(1) + "px", top = at.y.toFixed(1) + "px";
      const moved = !!el.style.left && (el.style.left !== left || el.style.top !== top);
      if (instant) el.style.transition = "none";
      el.style.left = left;
      el.style.top = top;
      if (moved && !instant) {
        el.style.zIndex = 600 + at.z;
        clearTimeout(el._zt);
        el._zt = setTimeout(() => { el.style.zIndex = at.z; }, 260);
      } else {
        el.style.zIndex = at.z;
      }
      if (instant) { void el.offsetWidth; el.style.transition = ""; }
    }));
    undoBtn.disabled = !history.length || won;
  }

  function updateHud() {
    movesEl.textContent = moves;
    timeEl.textContent = fmt(seconds);
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function say(text, ms = 2500) {
    messageEl.textContent = text;
    clearTimeout(msgTimer);
    if (ms) msgTimer = setTimeout(() => { messageEl.textContent = ""; }, ms);
  }

  // ---------- Züge ----------

  const snapshot = () => ({ piles: JSON.parse(JSON.stringify(state.piles)), moves });

  function markStarted() {
    if (started) return;
    started = true;
    const st = stats(); st.played++; setStats(st);
  }

  function doMove(from, idx, to) {
    history.push(snapshot());
    const cards = state.piles[from].cards.splice(idx);
    state.piles[to].cards.push(...cards);
    moves++;
    markStarted();
    const done = rules.after(state);
    if (done.length) say(done.length > 1 ? "Folgen komplett!" : "Folge komplett!", 1500);
    render();
    updateHud();
    afterMove();
  }

  function stockClick() {
    if (busy || won) return;
    const snap = snapshot();
    const r = rules.stock(state);
    if (r === "blocked") { say("Erst alle Spalten belegen, dann austeilen."); return; }
    if (!r) return;
    history.push(snap);
    moves++;
    markStarted();
    rules.after(state);
    render();
    updateHud();
    afterMove();
  }

  // Automatische Züge auf die Ablage (FreeCell: sichere Karten, Klondike: Endspurt)
  function nextAutoMove() {
    const finishing = rules.canAutoFinish(state);
    if (variant !== "freecell" && !finishing) return null;
    const sources = [...state.v.tab, ...state.v.cells];
    for (const pi of sources) {
      const c = S.top(state.piles[pi]);
      if (!c || !c.up) continue;
      if (finishing || S.safeToFoundation(state, c)) {
        const f = S.foundationFor(state, c);
        if (f >= 0) return [pi, state.piles[pi].cards.length - 1, f];
      }
    }
    return null;
  }

  async function afterMove() {
    let m;
    busy = true;
    while ((m = nextAutoMove())) {
      await new Promise((r) => setTimeout(r, rules.canAutoFinish(state) ? 90 : 140));
      const cards = state.piles[m[0]].cards.splice(m[1]);
      state.piles[m[2]].cards.push(...cards);
      rules.after(state);
      render();
    }
    busy = false;
    if (rules.won(state)) return win();
    save();
  }

  function win() {
    won = true;
    const st = stats();
    st.won++;
    const record = !st.best || seconds < st.best;
    if (record) st.best = seconds;
    setStats(st);
    save();
    render();
    setTimeout(() => {
      overlayText.innerHTML = `${rules.name} in <strong>${fmt(seconds)}</strong> mit <strong>${moves}</strong> Zügen.` +
        (record ? "<br>Neue Bestzeit!" : `<br>Bestzeit: ${fmt(st.best)}`) +
        `<br>Gewonnen: ${st.won} von ${st.played} Spielen`;
      overlay.classList.remove("hidden");
    }, 500);
  }

  function undo() {
    if (busy || !history.length || won) return;
    const snap = history.pop();
    state.piles = snap.piles;
    moves = snap.moves;
    render();
    updateHud();
    save();
  }

  // Bestes Ziel beim Antippen
  function autoDestination(pi, idx) {
    const cards = state.piles[pi].cards;
    const c = cards[idx];
    const single = idx === cards.length - 1;
    const can = (to) => to !== pi && rules.canDrop(state, pi, idx, to);
    if (single && variant !== "spider" && state.piles[pi].kind !== "found") {
      const f = S.foundationFor(state, c);
      if (f >= 0 && can(f)) return f;
    }
    const filled = state.v.tab.filter((t) => state.piles[t].cards.length && can(t));
    if (variant === "spider") {
      const same = filled.find((t) => S.top(state.piles[t]).s === c.s);
      if (same !== undefined) return same;
    }
    if (filled.length) return filled[0];
    const emptyOk = !(state.piles[pi].kind === "tab" && idx === 0);
    const empty = state.v.tab.find((t) => !state.piles[t].cards.length && can(t));
    if (empty !== undefined && emptyOk) return empty;
    if (single && variant === "freecell") {
      const cell = state.v.cells.find((k) => can(k));
      if (cell !== undefined) return cell;
    }
    return -1;
  }

  // ---------- Tipp ----------

  function findHint() {
    let best = null;
    const consider = (score, from, idx, to) => { if (!best || score > best.score) best = { score, from, idx, to }; };
    state.piles.forEach((p, pi) => {
      if (!["tab", "waste", "cell"].includes(p.kind) || !p.cards.length) return;
      const starts = p.kind === "tab" ? p.cards.map((_, k) => k) : [p.cards.length - 1];
      for (const idx of starts) {
        if (!rules.canDrag(state, pi, idx)) continue;
        const c = p.cards[idx];
        const below = p.cards[idx - 1];
        state.piles.forEach((d, to) => {
          if (to === pi || !rules.canDrop(state, pi, idx, to)) return;
          const t = S.top(d);
          let score = 0;
          if (d.kind === "found") score = 50;
          else if (d.kind === "cell") score = below && !below.up ? 0 : 4;
          else if (p.kind === "waste") score = 30;
          else if (p.kind === "cell") score = t ? 35 : 12;
          else if (below && !below.up) score = 40;
          else if (!t) score = idx > 0 && below && !fitsUnder(below, c) ? 10 : 0;
          else if (variant === "spider") score = t.s === c.s && (!below || below.s !== c.s || below.r !== c.r + 1) ? 22 :
            (!below ? 0 : (below.r !== c.r + 1 ? 15 : 0));
          else if (below && !fitsUnder(below, c)) score = 15;
          else if (below && below.up && S.foundationFor(state, below) >= 0) score = 25;
          if (variant === "spider" && t && t.s === c.s) score += 3;
          if (score > 0) consider(score, pi, idx, to);
        });
      }
    });
    return best;
  }

  // Liegt c regelgerecht auf b? (dann ist ein Umlegen meist sinnlos)
  function fitsUnder(b, c) {
    if (!b.up) return false;
    if (variant === "spider") return b.r === c.r + 1 && b.s === c.s;
    return b.r === c.r + 1 && S.isRed(b) !== S.isRed(c);
  }

  function hint() {
    if (busy || won) return;
    tableEl.querySelectorAll(".hint, .target").forEach((e) => e.classList.remove("hint", "target"));
    const h = findHint();
    if (h) {
      state.piles[h.from].cards.slice(h.idx).forEach((c) => cardEls.get(c.id).classList.add("hint"));
      const t = S.top(state.piles[h.to]);
      if (t) cardEls.get(t.id).classList.add("hint");
      else tableEl.querySelector(`.slot[data-pile="${h.to}"]`).classList.add("target");
      setTimeout(() => tableEl.querySelectorAll(".hint, .target").forEach((e) => e.classList.remove("hint", "target")), 1600);
      return;
    }
    const v = state.v;
    if (v.stock >= 0 && (state.piles[v.stock].cards.length || (v.waste >= 0 && state.piles[v.waste].cards.length))) {
      say(state.piles[v.stock].cards.length ? "Zieh eine neue Karte vom Stapel." : "Stapel umdrehen und weiterziehen.");
      const t = S.top(state.piles[v.stock]);
      if (t) { cardEls.get(t.id).classList.add("hint"); setTimeout(() => cardEls.get(t.id) && cardEls.get(t.id).classList.remove("hint"), 1600); }
    } else {
      say("Keine sinnvollen Züge mehr – nimm Züge zurück oder starte neu.", 4000);
    }
  }

  // ---------- Ziehen & Ablegen ----------

  function shake(el) {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }

  tableEl.addEventListener("pointerdown", (e) => {
    if (busy || won || drag || e.button > 0) return;
    const cardEl = e.target.closest(".card");
    const slotEl = e.target.closest(".slot");
    if (!cardEl) {
      if (slotEl && slotEl.classList.contains("stock")) stockClick();
      return;
    }
    const pi = +cardEl.dataset.pile, idx = +cardEl.dataset.idx;
    const pile = state.piles[pi];
    if (pile.kind === "stock") { stockClick(); return; }
    if (!rules.canDrag(state, pi, idx)) { if (pile.cards[idx].up) shake(cardEl); return; }
    const els = pile.cards.slice(idx).map((c) => cardEls.get(c.id));
    drag = { pi, idx, els, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
    tableEl.setPointerCapture(e.pointerId);
  });

  tableEl.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.els.forEach((el, k) => { el.classList.add("dragging"); el.style.zIndex = 1500 + k; });
    }
    drag.dx = dx; drag.dy = dy;
    drag.els.forEach((el) => { el.style.transform = `translate(${dx}px, ${dy}px)`; });
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      if (cancelled) return;
      const to = autoDestination(d.pi, d.idx);
      if (to >= 0) doMove(d.pi, d.idx, to);
      else shake(d.els[0]);
      return;
    }
    // Karten an der Loslass-Stelle festhalten, dann animiert ans Ziel bzw. zurück
    d.els.forEach((el) => {
      el.style.left = parseFloat(el.style.left) + d.dx + "px";
      el.style.top = parseFloat(el.style.top) + d.dy + "px";
      el.style.transform = "";
    });
    const to = cancelled ? -1 : dropTarget(d);
    void tableEl.offsetWidth;
    d.els.forEach((el) => el.classList.remove("dragging"));
    if (to >= 0) doMove(d.pi, d.idx, to);
    else render();
  }

  function dropTarget(d) {
    const first = d.els[0];
    const x = parseFloat(first.style.left), y = parseFloat(first.style.top);
    const { cw, ch, pos } = geo;
    let best = -1, bestArea = 0;
    state.piles.forEach((p, pi) => {
      if (pi === d.pi || !["tab", "found", "cell"].includes(p.kind)) return;
      const [px, py] = pos[pi];
      let h = ch;
      const t = S.top(p);
      if (t && p.kind === "tab") h = parseFloat(cardEls.get(t.id).style.top) - py + ch;
      const ox = Math.max(0, Math.min(x + cw, px + cw) - Math.max(x, px));
      const oy = Math.max(0, Math.min(y + ch, py + h) - Math.max(y, py));
      const area = ox * oy;
      if (area > bestArea && rules.canDrop(state, d.pi, d.idx, pi)) { best = pi; bestArea = area; }
    });
    return best;
  }

  tableEl.addEventListener("pointerup", (e) => endDrag(e, false));
  tableEl.addEventListener("pointercancel", (e) => endDrag(e, true));

  // ---------- Bedienung ----------

  variantBtns.forEach((b) => b.addEventListener("click", () => {
    if (busy || b.dataset.variant === variant) return;
    selectVariant(b.dataset.variant);
  }));
  document.getElementById("new-btn").addEventListener("click", () => { if (!busy) newGame(); });
  document.getElementById("overlay-btn").addEventListener("click", () => newGame());
  undoBtn.addEventListener("click", undo);
  document.getElementById("hint-btn").addEventListener("click", hint);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey) hint();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state && !drag) render(true); }, 100);
  });

  setInterval(() => {
    if (started && !won && !document.hidden && state) {
      seconds++;
      timeEl.textContent = fmt(seconds);
      if (seconds % 10 === 0) save();
    }
  }, 1000);

  // ---------- Start ----------
  const savedOpts = store.get("solitaer-optionen");
  if (savedOpts) for (const k in DEFAULT_OPT) if (OPTIONS[k].some((o) => o.v === savedOpts[k])) opts[k] = savedOpts[k];
  const savedVariant = store.get("solitaer-variante");
  selectVariant(S.VARIANTS[savedVariant] ? savedVariant : "klondike");
})();
