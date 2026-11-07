"use strict";

// ---------- Spielsteine ----------
// Jeder Stein hat eine Gruppe ("group"): zwei Steine passen zusammen, wenn die Gruppe gleich ist.
const NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WINDS = [["東", "O"], ["南", "S"], ["西", "W"], ["北", "N"]];
const DRAGONS = ["red", "green", "white"];
const FLOWERS = [["🌸", "梅"], ["🌺", "蘭"], ["🌼", "菊"], ["🎋", "竹"]];
const SEASONS = [["🌱", "春"], ["☀️", "夏"], ["🍁", "秋"], ["❄️", "冬"]];

// Farbmuster für die Kreise (Index = Anzahl)
const DOT_COLORS = {
  1: ["c3"], 2: ["c2", "c1"], 3: ["c1", "c3", "c2"], 4: ["c1", "c2", "c2", "c1"],
  5: ["c1", "c2", "c3", "c2", "c1"], 6: ["c2", "c2", "c2", "c3", "c3", "c3"],
  7: ["c2", "c2", "c2", "c3", "c3", "c3", "c1"], 8: Array(8).fill("c1"), 9: ["c1", "c1", "c1", "c3", "c3", "c3", "c2", "c2", "c2"]
};

function pipsHtml(kind, n) {
  let inner = "";
  for (let i = 0; i < n; i++) {
    if (kind === "dot") inner += `<span class="dot ${DOT_COLORS[n][i]}"></span>`;
    else inner += `<span class="bar${(n === 5 || n === 7 || n === 9) && i === Math.floor(n / 2) ? " red" : ""}"></span>`;
  }
  return `<div class="pips pips--${n}">${inner}</div>`;
}

function buildFaces() {
  const faces = [];
  const add = (group, html, copies) => { for (let i = 0; i < copies; i++) faces.push({ group, html }); };

  for (let n = 1; n <= 9; n++) {
    add(`dot${n}`, `<div class="face">${pipsHtml("dot", n)}</div>`, 4);
    add(`bam${n}`, n === 1
      ? `<div class="face"><span class="bird">🦚</span></div>`
      : `<div class="face">${pipsHtml("bar", n)}</div>`, 4);
    add(`chr${n}`, `<div class="face char cjk"><span class="char__num">${NUMS[n - 1]}</span><span class="char__wan">萬</span></div>`, 4);
  }
  WINDS.forEach(([c, l], i) =>
    add(`wind${i}`, `<div class="face"><span class="big cjk wind">${c}</span><span class="corner">${l}</span></div>`, 4));
  DRAGONS.forEach((d) => {
    const html = d === "white"
      ? `<div class="face"><span class="dragon-white"></span></div>`
      : `<div class="face"><span class="big cjk dragon-${d}">${d === "red" ? "中" : "發"}</span></div>`;
    add(`dragon-${d}`, html, 4);
  });
  FLOWERS.forEach(([icon, label]) =>
    add("flower", `<div class="face bonus bonus--flower"><span class="bonus__icon">${icon}</span><span class="bonus__label cjk">${label}</span></div>`, 1));
  SEASONS.forEach(([icon, label]) =>
    add("season", `<div class="face bonus bonus--season"><span class="bonus__icon">${icon}</span><span class="bonus__label cjk">${label}</span></div>`, 1));
  return faces; // 144 Steine
}

// ---------- Layout "Schildkröte" ----------
// Koordinaten in halben Steinbreiten/-höhen, damit versetzte Steine möglich sind.
function buildTurtle() {
  const pos = [];
  const add = (x, y, z) => pos.push({ x: Math.round(x * 2), y: Math.round(y * 2), z });

  const base = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
  base.forEach(([a, b], y) => { for (let x = a; x <= b; x++) add(x, y, 0); });
  add(0, 3.5, 0); add(13, 3.5, 0); add(14, 3.5, 0);
  for (let y = 1; y <= 6; y++) for (let x = 4; x <= 9; x++) add(x, y, 1);
  for (let y = 2; y <= 5; y++) for (let x = 5; x <= 8; x++) add(x, y, 2);
  for (let y = 3; y <= 4; y++) for (let x = 6; x <= 7; x++) add(x, y, 3);
  add(6.5, 3.5, 4);
  return pos; // 144 Positionen
}

// ---------- Zustand ----------
const boardEl = document.getElementById("board");
const wrapEl = document.getElementById("board-wrap");
const leftEl = document.getElementById("left");
const movesEl = document.getElementById("moves");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const hintBtn = document.getElementById("hint-btn");
const undoBtn = document.getElementById("undo-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const freeBtn = document.getElementById("free-btn");
const newBtn = document.getElementById("new-btn");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayBtn = document.getElementById("overlay-btn");
const overlayAlt = document.getElementById("overlay-alt");

const ALL_FACES = buildFaces();
const LAYOUT = buildTurtle();
const COLS = (Math.max(...LAYOUT.map((p) => p.x)) + 2) / 2;
const ROWS = (Math.max(...LAYOUT.map((p) => p.y)) + 2) / 2;
const MAX_Z = Math.max(...LAYOUT.map((p) => p.z));

let tiles = [];        // { x, y, z, face, removed, el }
let selected = null;
let history = [];      // Liste entfernter Paare
let hintPair = null;
let seconds = 0;
let timerId = null;
let started = false;
let finished = false;
let shuffles = 0;
let hintsUsed = 0;

// ---------- Hilfsfunktionen ----------
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function loadBest() {
  try { return parseInt(localStorage.getItem("mahjong-best") || "0", 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem("mahjong-best", String(v)); } catch (e) { /* egal */ }
}

// Ein Stein ist frei, wenn nichts auf ihm liegt und links ODER rechts kein Nachbar ist.
function isFreeIn(t, list) {
  let left = false, right = false;
  for (const o of list) {
    if (o === t) continue;
    if (o.z === t.z + 1 && Math.abs(o.x - t.x) < 2 && Math.abs(o.y - t.y) < 2) return false;
    if (o.z === t.z && Math.abs(o.y - t.y) < 2) {
      if (o.x === t.x - 2) left = true;
      else if (o.x === t.x + 2) right = true;
    }
  }
  return !(left && right);
}

const active = () => tiles.filter((t) => !t.removed);
const isFree = (t) => isFreeIn(t, active());

function findPairs() {
  const list = active();
  const free = list.filter((t) => isFreeIn(t, list));
  const byGroup = new Map();
  free.forEach((t) => {
    if (!byGroup.has(t.face.group)) byGroup.set(t.face.group, []);
    byGroup.get(t.face.group).push(t);
  });
  const pairs = [];
  byGroup.forEach((g) => {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push([g[i], g[j]]);
  });
  return pairs;
}

// Verteilt Paare so auf die Positionen, dass es garantiert eine Lösung gibt:
// Das Brett wird gedanklich abgebaut (immer zwei freie Steine) und jedes abgebaute
// Positionspaar bekommt ein passendes Steinpaar.
function assignSolvable(positions, facePairs) {
  for (let attempt = 0; attempt < 500; attempt++) {
    let alive = positions.slice();
    const order = [];
    let ok = true;
    while (alive.length) {
      const free = alive.filter((t) => isFreeIn(t, alive));
      if (free.length < 2) { ok = false; break; }
      shuffleArray(free);
      const a = free[0], b = free[1];
      order.push([a, b]);
      alive = alive.filter((t) => t !== a && t !== b);
    }
    if (!ok) continue;
    const pairs = shuffleArray(facePairs.slice());
    order.forEach(([a, b], i) => { a.face = pairs[i][0]; b.face = pairs[i][1]; });
    return true;
  }
  return false;
}

function makeFacePairs(faces) {
  const byGroup = new Map();
  faces.forEach((f) => {
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group).push(f);
  });
  const pairs = [];
  byGroup.forEach((g) => {
    shuffleArray(g);
    for (let i = 0; i + 1 < g.length; i += 2) pairs.push([g[i], g[i + 1]]);
  });
  return pairs;
}

// ---------- Darstellung ----------
let tileW = 48, tileH = 64, depth = 6;

function layoutBoard() {
  const availW = wrapEl.clientWidth;
  const top = wrapEl.getBoundingClientRect().top + window.scrollY;
  const availH = Math.max(260, window.innerHeight - top - 70);
  const ratio = 1.32;
  // Breite: COLS Steine + Tiefenversatz; Höhe entsprechend
  tileW = Math.min((availW - 8) / (COLS + 0.6), (availH - 8) / (ROWS * ratio + 0.6), 72);
  tileW = Math.max(18, Math.floor(tileW));
  tileH = Math.round(tileW * ratio);
  depth = Math.max(2, Math.round(tileW * 0.12));

  const pad = depth * (MAX_Z + 1);
  boardEl.style.setProperty("--tw", `${tileW}px`);
  boardEl.style.setProperty("--th", `${tileH}px`);
  boardEl.style.setProperty("--d", `${depth}px`);
  boardEl.style.width = `${COLS * tileW + pad + depth}px`;
  boardEl.style.height = `${ROWS * tileH + pad + depth}px`;

  tiles.forEach((t) => {
    t.el.style.left = `${(t.x / 2) * tileW + pad - t.z * depth}px`;
    t.el.style.top = `${(t.y / 2) * tileH + pad - t.z * depth}px`;
  });
}

function render() {
  boardEl.innerHTML = "";
  tiles.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.index = i;
    el.innerHTML = t.face.html;
    el.style.zIndex = t.z * 1000 + t.x * 15 + t.y;
    t.el = el;
    boardEl.appendChild(el);
  });
  layoutBoard();
  refresh();
}

function refreshFaces() {
  tiles.forEach((t) => { t.el.innerHTML = t.face.html; });
}

function refresh() {
  const list = active();
  tiles.forEach((t) => {
    if (t.removed) return;
    t.el.classList.toggle("blocked", !isFreeIn(t, list));
  });
  leftEl.textContent = list.length;
  const pairs = findPairs();
  movesEl.textContent = pairs.length;
  undoBtn.disabled = history.length === 0 || finished;
  hintBtn.disabled = finished || pairs.length === 0;
  shuffleBtn.disabled = finished || list.length < 2;
  return pairs;
}

function clearHint() {
  if (hintPair) hintPair.forEach((t) => t.el.classList.remove("hint"));
  hintPair = null;
}

function startTimer() {
  if (started) return;
  started = true;
  timerId = setInterval(() => {
    seconds++;
    timeEl.textContent = formatTime(seconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

// ---------- Spielablauf ----------
function newGame() {
  stopTimer();
  overlay.classList.add("hidden");
  tiles = LAYOUT.map((p) => ({ ...p, face: null, removed: false, el: null }));
  assignSolvable(tiles, makeFacePairs(ALL_FACES));
  selected = null;
  history = [];
  hintPair = null;
  seconds = 0;
  started = false;
  finished = false;
  shuffles = 0;
  hintsUsed = 0;
  timeEl.textContent = "0:00";
  const best = loadBest();
  bestEl.textContent = best ? formatTime(best) : "–";
  render();
}

function onTileClick(t) {
  if (finished || t.removed) return;
  if (!isFree(t)) {
    t.el.classList.remove("shake");
    void t.el.offsetWidth;
    t.el.classList.add("shake");
    return;
  }
  startTimer();

  if (selected === t) {
    t.el.classList.remove("selected");
    selected = null;
    return;
  }
  if (selected && selected.face.group === t.face.group) {
    removePair(selected, t);
    return;
  }
  if (selected) selected.el.classList.remove("selected");
  selected = t;
  t.el.classList.add("selected");
}

function removePair(a, b) {
  clearHint();
  a.el.classList.remove("selected");
  b.el.classList.remove("selected");
  selected = null;
  a.removed = b.removed = true;
  [a, b].forEach((t) => {
    t.el.classList.add("removing");
    setTimeout(() => { if (t.removed) t.el.classList.add("gone"); }, 260);
  });
  history.push([a, b]);
  const pairs = refresh();
  checkEnd(pairs);
}

function checkEnd(pairs) {
  const remaining = active().length;
  if (remaining === 0) {
    finished = true;
    stopTimer();
    const best = loadBest();
    const record = !best || seconds < best;
    if (record) { saveBest(seconds); bestEl.textContent = formatTime(seconds); }
    refresh();
    showOverlay(
      "🎉 Geschafft!",
      `Alle Steine abgeräumt in ${formatTime(seconds)}.` +
      (record ? " Neue Bestzeit!" : ` Bestzeit: ${formatTime(best)}.`) +
      (hintsUsed || shuffles ? ` (Tipps: ${hintsUsed}, Mischen: ${shuffles})` : ""),
      "Neues Spiel", newGame
    );
  } else if (pairs.length === 0) {
    showOverlay(
      "Keine Züge mehr",
      `Es gibt keine passenden freien Paare mehr (${remaining} Steine übrig). Mischen oder einen Zug zurücknehmen?`,
      "🔀 Mischen", () => { overlay.classList.add("hidden"); shuffleRemaining(); },
      "↶ Zurück", () => { overlay.classList.add("hidden"); undo(); }
    );
  }
}

function showOverlay(title, text, btnLabel, btnAction, altLabel, altAction) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayBtn.textContent = btnLabel;
  overlayBtn.onclick = btnAction;
  if (altLabel) {
    overlayAlt.textContent = altLabel;
    overlayAlt.onclick = altAction;
    overlayAlt.classList.remove("hidden");
  } else {
    overlayAlt.classList.add("hidden");
  }
  overlay.classList.remove("hidden");
}

function undo() {
  if (!history.length || finished) return;
  clearHint();
  if (selected) { selected.el.classList.remove("selected"); selected = null; }
  const [a, b] = history.pop();
  [a, b].forEach((t) => {
    t.removed = false;
    t.el.classList.remove("gone", "removing");
  });
  refresh();
}

function hint() {
  const pairs = findPairs();
  if (!pairs.length) return;
  clearHint();
  // Bevorzugt Paare, die höher liegen – das hilft meist am meisten
  pairs.sort((p, q) => (q[0].z + q[1].z) - (p[0].z + p[1].z));
  const top = pairs.filter((p) => p[0].z + p[1].z === pairs[0][0].z + pairs[0][1].z);
  hintPair = top[Math.floor(Math.random() * top.length)];
  hintPair.forEach((t) => t.el.classList.add("hint"));
  hintsUsed++;
  startTimer();
}

function shuffleRemaining() {
  const list = active();
  if (list.length < 2) return;
  clearHint();
  if (selected) { selected.el.classList.remove("selected"); selected = null; }
  const ok = assignSolvable(list, makeFacePairs(list.map((t) => t.face)));
  if (!ok) {
    // Fallback: einfach zufällig verteilen
    const faces = shuffleArray(list.map((t) => t.face));
    list.forEach((t, i) => { t.face = faces[i]; });
  }
  shuffles++;
  history = []; // nach dem Mischen kein Zurück über das Mischen hinweg
  refreshFaces();
  const pairs = refresh();
  checkEnd(pairs);
}

// ---------- Events ----------
boardEl.addEventListener("click", (e) => {
  const el = e.target.closest(".tile");
  if (!el) return;
  onTileClick(tiles[Number(el.dataset.index)]);
});

hintBtn.addEventListener("click", hint);
undoBtn.addEventListener("click", undo);
shuffleBtn.addEventListener("click", shuffleRemaining);
newBtn.addEventListener("click", () => {
  if (started && !finished && !confirm("Aktuelles Spiel abbrechen und neu starten?")) return;
  newGame();
});
freeBtn.addEventListener("click", () => {
  const on = !boardEl.classList.contains("show-free");
  boardEl.classList.toggle("show-free", on);
  freeBtn.setAttribute("aria-pressed", String(on));
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "h" || e.key === "H") hint();
  else if ((e.key === "z" && (e.ctrlKey || e.metaKey)) || e.key === "Backspace") { e.preventDefault(); undo(); }
  else if (e.key === "Escape" && selected) { selected.el.classList.remove("selected"); selected = null; }
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layoutBoard, 100);
});

newGame();
