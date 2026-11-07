"use strict";

// ---------- Motive ----------
// Jedes Motiv hat eine Gruppe ("group"): zwei Würfel passen zusammen, wenn die Gruppe gleich ist.
const NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WINDS = [["東", "O"], ["南", "S"], ["西", "W"], ["北", "N"]];

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

// Alle 34 regulären Motive (ohne Blumen/Jahreszeiten)
function buildMotifs() {
  const list = [];
  for (let n = 1; n <= 9; n++) {
    list.push({ group: `dot${n}`, html: `<div class="motif">${pipsHtml("dot", n)}</div>` });
    list.push({
      group: `bam${n}`, html: n === 1
        ? `<div class="motif"><span class="bird">🦚</span></div>`
        : `<div class="motif">${pipsHtml("bar", n)}</div>`
    });
    list.push({ group: `chr${n}`, html: `<div class="motif char cjk"><span class="char__num">${NUMS[n - 1]}</span><span class="char__wan">萬</span></div>` });
  }
  WINDS.forEach(([c, l], i) =>
    list.push({ group: `wind${i}`, html: `<div class="motif"><span class="big cjk wind">${c}</span><span class="corner">${l}</span></div>` }));
  list.push({ group: "dragon-red", html: `<div class="motif"><span class="big cjk dragon-red">中</span></div>` });
  list.push({ group: "dragon-green", html: `<div class="motif"><span class="big cjk dragon-green">發</span></div>` });
  list.push({ group: "dragon-white", html: `<div class="motif"><span class="dragon-white"></span></div>` });
  return list;
}

// ---------- Turm ----------
// Würfel liegen auf einem ganzzahligen Gitter (x, z = Boden, y = Höhe).
// Schichten von unten nach oben: 7×7, 5×5, 5×5, 3×3, 3×3, 3×3, 1, 1 = 128 Würfel.
const TOWER = [7, 5, 5, 3, 3, 3, 1, 1];
const GRID = 7;

function buildTower() {
  const pos = [];
  TOWER.forEach((size, y) => {
    const off = (GRID - size) / 2;
    for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) pos.push({ x: x + off, y, z: z + off });
  });
  return pos;
}

// ---------- Zustand ----------
const sceneEl = document.getElementById("scene");
const worldEl = document.getElementById("world");
const leftEl = document.getElementById("left");
const movesEl = document.getElementById("moves");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const hintBtn = document.getElementById("hint-btn");
const undoBtn = document.getElementById("undo-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const freeBtn = document.getElementById("free-btn");
const newBtn = document.getElementById("new-btn");
const rotLeftBtn = document.getElementById("rot-left");
const rotRightBtn = document.getElementById("rot-right");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayBtn = document.getElementById("overlay-btn");
const overlayAlt = document.getElementById("overlay-alt");

const MOTIFS = buildMotifs();
const LAYOUT = buildTower();
const HEIGHT = TOWER.length;
const PAIRS_NEEDED = LAYOUT.length / 2;

// Seiten eines Würfels: Name, Nachbar-Versatz, CSS-Drehung
const SIDES = [
  { name: "top", d: [0, 1, 0], rot: "rotateX(90deg)" },
  { name: "front", d: [0, 0, 1], rot: "" },
  { name: "back", d: [0, 0, -1], rot: "rotateY(180deg)" },
  { name: "right", d: [1, 0, 0], rot: "rotateY(90deg)" },
  { name: "left", d: [-1, 0, 0], rot: "rotateY(-90deg)" }
];

let cubes = [];        // { x, y, z, face, removed, el, faces }
let grid = new Map();  // "x,y,z" -> Würfel (nur nicht entfernte)
let selected = null;
let history = [];
let hintPair = null;
let seconds = 0;
let timerId = null;
let started = false;
let finished = false;
let shuffles = 0;
let hintsUsed = 0;

let yaw = -35;   // Drehung um die senkrechte Achse
let tilt = -28;  // Blick von oben
let size = 48;   // Kantenlänge eines Würfels in px

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
  try { return parseInt(localStorage.getItem("mahjong3d-best") || "0", 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem("mahjong3d-best", String(v)); } catch (e) { /* egal */ }
}

const key = (x, y, z) => `${x},${y},${z}`;

function buildGrid(list) {
  const m = new Map();
  list.forEach((c) => m.set(key(c.x, c.y, c.z), c));
  return m;
}

// Frei: nichts darüber und mindestens zwei der vier Seiten (links, rechts, vorne, hinten) offen.
function isFreeIn(c, m) {
  if (m.has(key(c.x, c.y + 1, c.z))) return false;
  let open = 0;
  if (!m.has(key(c.x - 1, c.y, c.z))) open++;
  if (!m.has(key(c.x + 1, c.y, c.z))) open++;
  if (!m.has(key(c.x, c.y, c.z - 1))) open++;
  if (!m.has(key(c.x, c.y, c.z + 1))) open++;
  return open >= 2;
}

const active = () => cubes.filter((c) => !c.removed);
const isFree = (c) => isFreeIn(c, grid);

function findPairs() {
  const free = active().filter((c) => isFreeIn(c, grid));
  const byGroup = new Map();
  free.forEach((c) => {
    if (!byGroup.has(c.face.group)) byGroup.set(c.face.group, []);
    byGroup.get(c.face.group).push(c);
  });
  const pairs = [];
  byGroup.forEach((g) => {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push([g[i], g[j]]);
  });
  return pairs;
}

// Garantiert lösbar: Der Turm wird gedanklich abgebaut (immer zwei freie Würfel),
// und jedes abgebaute Positionspaar bekommt ein passendes Motivpaar.
function assignSolvable(positions, facePairs) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const m = buildGrid(positions);
    const order = [];
    let ok = true;
    while (m.size) {
      const free = [...m.values()].filter((c) => isFreeIn(c, m));
      if (free.length < 2) { ok = false; break; }
      shuffleArray(free);
      const [a, b] = free;
      order.push([a, b]);
      m.delete(key(a.x, a.y, a.z));
      m.delete(key(b.x, b.y, b.z));
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
    for (let i = 0; i + 1 < g.length; i += 2) pairs.push([g[i], g[i + 1]]);
  });
  return pairs;
}

// Jedes Spiel nutzt zufällig ausgewählte Motive, je 4-mal
function dealFaces() {
  const groups = shuffleArray(MOTIFS.slice()).slice(0, Math.ceil(PAIRS_NEEDED / 2));
  const faces = [];
  groups.forEach((m) => { for (let i = 0; i < 4; i++) faces.push(m); });
  return faces.slice(0, LAYOUT.length);
}

// ---------- Darstellung ----------
function applyCamera() {
  worldEl.style.transform = `translateZ(${-size * 4}px) rotateX(${tilt}deg) rotateY(${yaw}deg)`;
}

function layoutScene() {
  const availW = sceneEl.clientWidth;
  const top = sceneEl.getBoundingClientRect().top + window.scrollY;
  const availH = Math.max(320, window.innerHeight - top - 70);
  size = Math.floor(Math.min(availW / 11, availH / 11, 60));
  size = Math.max(22, size);
  sceneEl.style.height = `${Math.round(size * 11)}px`;
  sceneEl.style.perspective = `${size * 26}px`;
  worldEl.style.setProperty("--s", `${size}px`);
  worldEl.style.setProperty("--tw", `${Math.round(size * 0.8)}px`);
  worldEl.style.setProperty("--th", `${size}px`);
  const mid = (GRID - 1) / 2;
  cubes.forEach((c) => {
    c.el.style.setProperty("--x", `${(c.x - mid) * size}px`);
    c.el.style.setProperty("--y", `${(HEIGHT / 2 - c.y - 0.5) * size}px`);
    c.el.style.setProperty("--z", `${(c.z - mid) * size}px`);
  });
  applyCamera();
}

function render() {
  worldEl.innerHTML = "";
  cubes.forEach((c, i) => {
    const el = document.createElement("div");
    el.className = "cube";
    el.dataset.index = i;
    c.faces = {};
    SIDES.forEach((s) => {
      const f = document.createElement("div");
      f.className = `side side--${s.name}`;
      f.style.transform = `${s.rot} translateZ(calc(var(--s) / 2))`;
      f.innerHTML = c.face.html;
      el.appendChild(f);
      c.faces[s.name] = f;
    });
    c.el = el;
    worldEl.appendChild(el);
  });
  layoutScene();
  refresh();
}

function refreshFaces() {
  cubes.forEach((c) => SIDES.forEach((s) => { c.faces[s.name].innerHTML = c.face.html; }));
}

function refresh() {
  grid = buildGrid(active());
  cubes.forEach((c) => {
    if (c.removed) return;
    c.el.classList.toggle("blocked", !isFreeIn(c, grid));
    // Verdeckte Seiten ausblenden – spart Rechenarbeit beim Zeichnen
    SIDES.forEach((s) => {
      const covered = grid.has(key(c.x + s.d[0], c.y + s.d[1], c.z + s.d[2]));
      c.faces[s.name].hidden = covered;
    });
  });
  leftEl.textContent = grid.size;
  const pairs = findPairs();
  movesEl.textContent = pairs.length;
  undoBtn.disabled = history.length === 0 || finished;
  hintBtn.disabled = finished || pairs.length === 0;
  shuffleBtn.disabled = finished || grid.size < 2;
  return pairs;
}

function clearHint() {
  if (hintPair) hintPair.forEach((c) => c.el.classList.remove("hint"));
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
  cubes = LAYOUT.map((p) => ({ ...p, face: null, removed: false, el: null, faces: null }));
  assignSolvable(cubes, makeFacePairs(shuffleArray(dealFaces())));
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

function onCubeClick(c) {
  if (finished || c.removed) return;
  if (!isFree(c)) {
    c.el.classList.remove("shake");
    void c.el.offsetWidth;
    c.el.classList.add("shake");
    return;
  }
  startTimer();

  if (selected === c) {
    c.el.classList.remove("selected");
    selected = null;
    return;
  }
  if (selected && selected.face.group === c.face.group) {
    removePair(selected, c);
    return;
  }
  if (selected) selected.el.classList.remove("selected");
  selected = c;
  c.el.classList.add("selected");
}

function removePair(a, b) {
  clearHint();
  a.el.classList.remove("selected");
  b.el.classList.remove("selected");
  selected = null;
  a.removed = b.removed = true;
  [a, b].forEach((c) => {
    c.el.classList.add("removing");
    setTimeout(() => { if (c.removed) c.el.classList.add("gone"); }, 280);
  });
  history.push([a, b]);
  const pairs = refresh();
  checkEnd(pairs);
}

function checkEnd(pairs) {
  const remaining = grid.size;
  if (remaining === 0) {
    finished = true;
    stopTimer();
    const best = loadBest();
    const record = !best || seconds < best;
    if (record) { saveBest(seconds); bestEl.textContent = formatTime(seconds); }
    refresh();
    showOverlay(
      "🎉 Turm abgetragen!",
      `Alle Würfel abgeräumt in ${formatTime(seconds)}.` +
      (record ? " Neue Bestzeit!" : ` Bestzeit: ${formatTime(best)}.`) +
      (hintsUsed || shuffles ? ` (Tipps: ${hintsUsed}, Mischen: ${shuffles})` : ""),
      "Neues Spiel", newGame
    );
  } else if (pairs.length === 0) {
    showOverlay(
      "Keine Züge mehr",
      `Es gibt keine passenden freien Paare mehr (${remaining} Würfel übrig). Mischen oder einen Zug zurücknehmen?`,
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
  [a, b].forEach((c) => {
    c.removed = false;
    c.el.classList.remove("gone", "removing");
  });
  refresh();
}

// Dreht den Turm so, dass ein Würfel möglichst zur Kamera zeigt
function faceTowards(c) {
  const mid = (GRID - 1) / 2;
  const dx = c.x - mid, dz = c.z - mid;
  if (!dx && !dz) return;
  // Kamera schaut entlang -z; Würfel mit Richtung (dx, dz) soll nach vorne (+z) zeigen
  const target = -Math.atan2(dx, dz) * 180 / Math.PI;
  let diff = ((target - yaw) % 360 + 540) % 360 - 180;
  yaw += diff;
  applyCamera();
}

function hint() {
  const pairs = findPairs();
  if (!pairs.length) return;
  clearHint();
  // Bevorzugt Paare, die höher liegen – das hilft meist am meisten
  const score = (p) => p[0].y + p[1].y;
  pairs.sort((p, q) => score(q) - score(p));
  const top = pairs.filter((p) => score(p) === score(pairs[0]));
  hintPair = top[Math.floor(Math.random() * top.length)];
  hintPair.forEach((c) => c.el.classList.add("hint"));
  faceTowards(hintPair[0]);
  hintsUsed++;
  startTimer();
}

function shuffleRemaining() {
  const list = active();
  if (list.length < 2) return;
  clearHint();
  if (selected) { selected.el.classList.remove("selected"); selected = null; }
  const ok = assignSolvable(list, makeFacePairs(shuffleArray(list.map((c) => c.face))));
  if (!ok) {
    const faces = shuffleArray(list.map((c) => c.face));
    list.forEach((c, i) => { c.face = faces[i]; });
  }
  shuffles++;
  history = []; // nach dem Mischen kein Zurück über das Mischen hinweg
  refreshFaces();
  const pairs = refresh();
  checkEnd(pairs);
}

function rotate(dYaw, dTilt = 0) {
  yaw += dYaw;
  tilt = Math.max(-75, Math.min(-5, tilt + dTilt));
  applyCamera();
}

// ---------- Eingabe: Ziehen dreht, Tippen wählt ----------
let drag = null;

sceneEl.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".overlay")) return;
  drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
});

sceneEl.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    sceneEl.setPointerCapture(e.pointerId);
    worldEl.classList.add("dragging");
  }
  rotate(dx * 0.4, -dy * 0.3);
  drag.x = e.clientX;
  drag.y = e.clientY;
});

function endDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const wasClick = !drag.moved;
  drag = null;
  worldEl.classList.remove("dragging");
  if (!wasClick || e.type === "pointercancel") return;
  const el = e.target.closest(".cube");
  if (el) onCubeClick(cubes[Number(el.dataset.index)]);
}
sceneEl.addEventListener("pointerup", endDrag);
sceneEl.addEventListener("pointercancel", endDrag);

hintBtn.addEventListener("click", hint);
undoBtn.addEventListener("click", undo);
shuffleBtn.addEventListener("click", shuffleRemaining);
rotLeftBtn.addEventListener("click", () => rotate(-45));
rotRightBtn.addEventListener("click", () => rotate(45));
newBtn.addEventListener("click", () => {
  if (started && !finished && !confirm("Aktuelles Spiel abbrechen und neu starten?")) return;
  newGame();
});
freeBtn.addEventListener("click", () => {
  const on = !worldEl.classList.contains("show-free");
  worldEl.classList.toggle("show-free", on);
  freeBtn.setAttribute("aria-pressed", String(on));
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "h" || e.key === "H") hint();
  else if ((e.key === "z" && (e.ctrlKey || e.metaKey)) || e.key === "Backspace") { e.preventDefault(); undo(); }
  else if (e.key === "Escape" && selected) { selected.el.classList.remove("selected"); selected = null; }
  else if (e.key === "ArrowLeft") { e.preventDefault(); rotate(-15); }
  else if (e.key === "ArrowRight") { e.preventDefault(); rotate(15); }
  else if (e.key === "ArrowUp") { e.preventDefault(); rotate(0, -8); }
  else if (e.key === "ArrowDown") { e.preventDefault(); rotate(0, 8); }
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layoutScene, 100);
});

newGame();
