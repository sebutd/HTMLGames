(() => {
  "use strict";

  const CAP = 4;
  const COLORS = [
    { c: "#ff4d4d", s: "●" }, { c: "#3d8bff", s: "■" }, { c: "#ffd23f", s: "▲" },
    { c: "#3ddc84", s: "◆" }, { c: "#b06bff", s: "★" }, { c: "#ff9a3c", s: "✚" },
    { c: "#4fe3e3", s: "♥" }, { c: "#ff6fcf", s: "♣" }, { c: "#8a5a2b", s: "♠" },
    { c: "#9aa4b5", s: "☾" }, { c: "#1f9e5a", s: "✿" }, { c: "#f2f2f2", s: "✱" }
  ];
  const SAVE_KEY = "sortieren-stand";
  const PREFS_KEY = "sortieren-symbole";

  const boardEl = document.getElementById("board");
  const levelEl = document.getElementById("level");
  const movesEl = document.getElementById("moves");
  const colorsEl = document.getElementById("colors");
  const messageEl = document.getElementById("message");
  const undoBtn = document.getElementById("undo-btn");
  const hintBtn = document.getElementById("hint-btn");
  const tubeBtn = document.getElementById("tube-btn");
  const symbolsBtn = document.getElementById("symbols-btn");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");

  let level = 1;
  let start = [];      // Ausgangslage des Levels
  let tubes = [];
  let history = [];
  let moves = 0;
  let extraUsed = false;
  let selected = -1;
  let busy = false;
  let won = false;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  };

  const colorsFor = (lvl) => Math.min(2 + lvl, COLORS.length);
  const clone = (t) => t.map((x) => x.slice());

  // ---------- Speichern ----------

  function save() {
    store.set(SAVE_KEY, JSON.stringify({ level, start, tubes, moves, extraUsed, won }));
  }

  function load() {
    try {
      const s = JSON.parse(store.get(SAVE_KEY));
      const valid = (arr) => Array.isArray(arr) && arr.every((t) => Array.isArray(t) && t.length <= CAP &&
        t.every((c) => Number.isInteger(c) && c >= 0 && c < COLORS.length));
      if (!s || !Number.isInteger(s.level) || s.level < 1 || !valid(s.start) || !valid(s.tubes)) return false;
      level = s.level;
      if (s.won) { level++; return false; }
      start = s.start; tubes = s.tubes; moves = s.moves | 0; extraUsed = !!s.extraUsed;
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Level ----------

  function newLevel() {
    start = SortSolver.generate(colorsFor(level), 2, CAP);
    resetLevel();
  }

  function resetLevel() {
    tubes = clone(start);
    history = [];
    moves = 0;
    extraUsed = false;
    selected = -1;
    won = false;
    overlay.classList.add("hidden");
    say("");
    render();
    save();
  }

  // ---------- Darstellung ----------

  function sizeTubes() {
    const n = tubes.length;
    const width = boardEl.clientWidth || 360;
    const perRow = n <= 7 ? n : Math.ceil(n / 2);
    const gap = width < 420 ? 10 : 14;
    const w = Math.max(30, Math.min(52, Math.floor((width - 8 - gap * (perRow - 1)) / perRow) - 4));
    const rows = Math.ceil(n / perRow);
    const availH = window.innerHeight - 330;
    const segByH = Math.floor((availH / rows - 60) / CAP);
    const seg = Math.max(26, Math.min(Math.round(w * 0.9), segByH, 46));
    document.documentElement.style.setProperty("--tube-w", w + "px");
    document.documentElement.style.setProperty("--seg-h", seg + "px");
  }

  function render(filled) {
    sizeTubes();
    boardEl.innerHTML = "";
    tubes.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.className = "tube";
      btn.style.setProperty("--cap", CAP);
      btn.dataset.index = i;
      btn.setAttribute("aria-label", `Glas ${i + 1}: ` +
        (t.length ? t.map((c) => COLORS[c].s).join(" ") : "leer"));
      if (i === selected) btn.classList.add("selected");
      if (t.length === CAP && SortSolver.isMono(t)) btn.classList.add("done");
      const glass = document.createElement("div");
      glass.className = "tube__glass";
      t.forEach((c, k) => {
        const seg = document.createElement("div");
        seg.className = "seg";
        seg.style.background = COLORS[c].c;
        seg.innerHTML = `<span>${COLORS[c].s}</span>`;
        if (filled && filled.tube === i && k >= t.length - filled.n) seg.classList.add("fill-in");
        glass.appendChild(seg);
      });
      btn.appendChild(glass);
      boardEl.appendChild(btn);
    });
    levelEl.textContent = level;
    movesEl.textContent = moves;
    colorsEl.textContent = colorsFor(level);
    undoBtn.disabled = !history.length;
    tubeBtn.disabled = extraUsed || won;
  }

  function say(text) { messageEl.textContent = text; }

  const tubeEl = (i) => boardEl.children[i];

  // ---------- Spielzüge ----------

  async function tryPour(a, b) {
    if (!SortSolver.canPour(tubes, CAP, a, b)) {
      tubeEl(b).classList.add("shake");
      setTimeout(() => tubeEl(b) && tubeEl(b).classList.remove("shake"), 320);
      return;
    }
    busy = true;
    history.push(clone(tubes));
    await animatePour(a, b);
    const n = SortSolver.pour(tubes, CAP, a, b);
    moves++;
    selected = -1;
    render({ tube: b, n });
    save();
    busy = false;
    checkState();
  }

  function animatePour(a, b) {
    const from = tubeEl(a), to = tubeEl(b);
    const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect();
    const dir = tr.left >= fr.left ? 1 : -1;
    const dx = tr.left - fr.left - dir * fr.width * 0.55;
    const dy = tr.top - fr.top - fr.height * 0.25;
    from.classList.add("pouring");
    from.style.transform = `translate(${dx}px, ${dy}px) rotate(${dir * 55}deg)`;
    return new Promise((res) => setTimeout(res, 280));
  }

  function checkState() {
    if (SortSolver.isSolved(tubes, CAP)) {
      won = true;
      save();
      tubeBtn.disabled = true;
      setTimeout(() => {
        overlayText.innerHTML = `Level <strong>${level}</strong> in <strong>${moves}</strong> Zügen gelöst.`;
        overlay.classList.remove("hidden");
      }, 450);
      return;
    }
    // Sackgasse erkennen: kein einziger sinnvoller Zug mehr
    let any = false;
    for (let a = 0; a < tubes.length && !any; a++)
      for (let b = 0; b < tubes.length && !any; b++)
        if (SortSolver.canPour(tubes, CAP, a, b) &&
            !(tubes[b].length === 0 && SortSolver.isMono(tubes[a]))) any = true;
    if (!any) say("Keine Züge mehr – nimm Züge zurück oder starte neu.");
  }

  function onTubeClick(i) {
    if (busy || won) return;
    clearHint();
    if (selected === -1) {
      if (!tubes[i].length) return;
      selected = i;
      say("");
    } else if (selected === i) {
      selected = -1;
    } else {
      const a = selected;
      selected = -1;
      tubeEl(a).classList.remove("selected");
      tryPour(a, i);
      return;
    }
    [...boardEl.children].forEach((el, k) => el.classList.toggle("selected", k === selected));
  }

  function undo() {
    if (busy || !history.length || won) return;
    tubes = history.pop();
    moves++;
    selected = -1;
    say("");
    render();
    save();
  }

  function clearHint() {
    [...boardEl.children].forEach((el) => el.classList.remove("hint"));
  }

  function hint() {
    if (busy || won) return;
    clearHint();
    selected = -1;
    render();
    const res = SortSolver.solve(tubes, CAP, 80000);
    if (res.path && res.path.length) {
      const [a, b] = res.path[0];
      tubeEl(a).classList.add("hint");
      tubeEl(b).classList.add("hint");
      say(`Gieße Glas ${a + 1} in Glas ${b + 1}.`);
    } else if (res.exhausted) {
      say(extraUsed ? "Sackgasse – nimm Züge zurück." : "Sackgasse – nimm Züge zurück oder hol ein Glas dazu.");
    } else {
      say("Ich finde gerade keinen sicheren Weg – probier „Zurück“.");
    }
  }

  function addTube() {
    if (busy || extraUsed || won) return;
    extraUsed = true;
    history.push(clone(tubes));
    tubes.push([]);
    say("Ein leeres Glas dazu – einmal pro Level.");
    render();
    save();
  }

  // ---------- Ereignisse ----------

  boardEl.addEventListener("click", (e) => {
    const t = e.target.closest(".tube");
    if (t) onTubeClick(+t.dataset.index);
  });
  undoBtn.addEventListener("click", undo);
  hintBtn.addEventListener("click", hint);
  tubeBtn.addEventListener("click", addTube);
  document.getElementById("restart-btn").addEventListener("click", () => { if (!busy) resetLevel(); });
  document.getElementById("overlay-btn").addEventListener("click", () => { level++; newLevel(); });

  function setSymbols(on) {
    boardEl.classList.toggle("symbols", on);
    symbolsBtn.setAttribute("aria-pressed", String(on));
    store.set(PREFS_KEY, on ? "1" : "0");
  }
  symbolsBtn.addEventListener("click", () => setSymbols(!boardEl.classList.contains("symbols")));

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey) hint();
    else if (e.key === "Escape" && selected !== -1) { selected = -1; render(); }
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!busy) render(); }, 120);
  });

  // ---------- Start ----------
  setSymbols(store.get(PREFS_KEY) === "1");
  if (load()) { history = []; render(); checkState(); } else newLevel();
})();
