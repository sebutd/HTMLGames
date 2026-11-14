"use strict";

/* ---------- Konstanten ---------- */
const MARGIN = 1.6;        // Rand um das Bild (in Feldern), darin läuft die Bahn
const TRACK_OFFSET = 0.85; // Abstand der Bahn vom Bild (in Feldern)
const MAX_CAPACITY = 12;   // größter Trupp
const MAX_LAPS = 2;        // so viele Runden plant der Generator höchstens je Trupp
const START_GAP = 1.6;     // Mindestabstand (in Haltepunkten) zwischen zwei startenden Trupps
const STORAGE_KEY = "pixelabbau-fortschritt";

/* ---------- Reine Spiellogik (ohne DOM) ---------- */

function parseGrid(rows) {
  return rows.map((row) => [...row].map((ch) => (ch === "." ? null : ch)));
}

function countBlocks(grid) {
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell) n++;
  return n;
}

// Die Bahn hat 2·(B+H) Haltepunkte: unten (links→rechts), rechts (unten→oben),
// oben (rechts→links), links (oben→unten). Von jedem Haltepunkt aus ist der
// erste Block in Blickrichtung erreichbar.
function stopCount(grid) {
  return 2 * (grid.length + grid[0].length);
}

function firstBlock(grid, k) {
  const H = grid.length, W = grid[0].length;
  if (k < W) {
    for (let r = H - 1; r >= 0; r--) if (grid[r][k]) return [r, k];
  } else if (k < W + H) {
    const r = H - 1 - (k - W);
    for (let c = W - 1; c >= 0; c--) if (grid[r][c]) return [r, c];
  } else if (k < 2 * W + H) {
    const c = W - 1 - (k - W - H);
    for (let r = 0; r < H; r++) if (grid[r][c]) return [r, c];
  } else {
    const r = k - 2 * W - H;
    for (let c = 0; c < W; c++) if (grid[r][c]) return [r, c];
  }
  return null;
}

// Ein Trupp steht an Haltepunkt k: Block abbauen, falls die Farbe passt.
function workAtStop(grid, crew, k) {
  if (crew.cap <= 0) return null;
  const hit = firstBlock(grid, k);
  if (!hit || grid[hit[0]][hit[1]] !== crew.color) return null;
  grid[hit[0]][hit[1]] = null;
  crew.cap--;
  return hit;
}

function simulateLap(grid, crew) {
  let eaten = 0;
  const n = stopCount(grid);
  for (let k = 0; k < n; k++) if (workAtStop(grid, crew, k)) eaten++;
  return eaten;
}

// Erzeugt die Trupps so, dass das Bild garantiert lösbar ist: Das Bild wird
// probeweise Runde für Runde abgetragen; die dabei entstehende Reihenfolge
// bleibt beim Verteilen auf die Reihen erhalten.
function generateCrews(rows, laneCount, rng = Math.random) {
  const grid = parseGrid(rows);
  const sequence = [];
  while (countBlocks(grid) > 0) {
    let best = null;
    for (const color of new Set(grid.flat().filter(Boolean))) {
      const trial = grid.map((row) => row.slice());
      const eaten = simulateLap(trial, { color, cap: MAX_CAPACITY });
      const score = eaten + rng() * 3;
      if (eaten > 0 && (!best || score > best.score)) best = { color, score };
    }
    const crew = { color: best.color, cap: MAX_CAPACITY };
    for (let lap = 0; lap < MAX_LAPS && crew.cap > 0; lap++) {
      if (simulateLap(grid, crew) === 0) break;
    }
    sequence.push({ color: best.color, cap: MAX_CAPACITY - crew.cap });
  }

  const lanes = Array.from({ length: laneCount }, () => []);
  const limit = Math.ceil(sequence.length / laneCount) + 1;
  sequence.forEach((crew, i) => {
    const open = lanes.filter((lane) => lane.length < limit);
    open[Math.floor(rng() * open.length)].push({ id: i, ...crew });
  });
  return { lanes, sequence };
}

/* ---------- Zustand ---------- */
const $ = (id) => document.getElementById(id);
const canvas = $("board");
const ctx = canvas.getContext("2d");

let levelIndex = 0;
let unlocked = 0;
let grid, W, H, stops, cell;
let lanes = [], bench = [], track = [], waiting = [], effects = [];
let remaining = 0;
let state = "play"; // play | won | lost
let lastTime = 0;

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  unlocked = Math.min(saved.unlocked || 0, LEVELS.length - 1);
  levelIndex = Math.min(saved.current ?? unlocked, unlocked);
} catch (e) { /* ohne Speicher spielbar */ }

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked, current: levelIndex }));
  } catch (e) { /* ignorieren */ }
}

function startLevel(index) {
  levelIndex = index;
  const level = LEVELS[index];
  grid = parseGrid(level.rows);
  H = grid.length;
  W = grid[0].length;
  stops = stopCount(grid);
  remaining = countBlocks(grid);
  lanes = generateCrews(level.rows, level.lanes).lanes;
  bench = [];
  track = [];
  waiting = [];
  effects = [];
  state = "play";
  $("overlay").classList.add("hidden");
  $("level-label").textContent = `Bild ${index + 1} / ${LEVELS.length}`;
  $("level-name").textContent = level.name;
  $("prev-btn").disabled = index === 0;
  $("next-btn").disabled = index >= unlocked;
  save();
  resize();
  renderPanels();
}

/* ---------- Trupps losschicken ---------- */
function launch(crew) {
  if (state !== "play") return;
  waiting.push(crew);
  renderPanels();
}

function releaseWaiting() {
  if (!waiting.length) return;
  if (track.some((t) => t.s < -1 + START_GAP)) return;
  track.push({ crew: waiting.shift(), s: -1, next: 0 });
}

function update(dt) {
  releaseWaiting();
  const speed = Math.max(13, stops / 3.2); // Haltepunkte pro Sekunde
  for (const t of track) {
    t.s += speed * dt;
    while (t.next < stops && t.s >= t.next && t.crew.cap > 0) {
      const hit = workAtStop(grid, t.crew, t.next);
      if (hit) {
        remaining--;
        const from = trackPoint(t.next);
        effects.push({ r: hit[0], c: hit[1], color: t.crew.color, age: 0, from });
      }
      t.next++;
    }
    if (t.crew.cap <= 0) {
      t.done = true;
      const p = trackPoint(t.s);
      effects.push({ pop: true, x: p.x, y: p.y, color: t.crew.color, age: 0 });
    } else if (t.s >= stops) {
      t.done = true;
      if (bench.length >= LEVELS[levelIndex].bench) lose();
      else bench.push(t.crew);
    }
  }
  if (track.some((t) => t.done)) {
    track = track.filter((t) => !t.done);
    renderPanels();
  }
  for (const e of effects) e.age += dt;
  effects = effects.filter((e) => e.age < 0.3);

  $("blocks").textContent = remaining;
  if (state === "play" && remaining === 0) win();
}

function win() {
  state = "won";
  const last = levelIndex === LEVELS.length - 1;
  if (!last) unlocked = Math.max(unlocked, levelIndex + 1);
  save();
  setTimeout(() => {
    $("overlay-title").textContent = "Geschafft!";
    $("overlay-text").textContent = last
      ? "Du hast alle Bilder abgebaut. Noch eine Runde von vorn?"
      : `„${LEVELS[levelIndex].name}“ ist komplett abgebaut.`;
    $("overlay-btn").textContent = last ? "Von vorn" : "Nächstes Bild";
    $("overlay").classList.remove("hidden");
  }, 450);
}

function lose() {
  if (state !== "play") return;
  state = "lost";
  $("overlay-title").textContent = "Bank voll!";
  $("overlay-text").textContent = "Ein Trupp fand keinen Platz mehr auf der Wartebank.";
  $("overlay-btn").textContent = "Nochmal";
  $("overlay").classList.remove("hidden");
}

/* ---------- Anzeige: Bank und Reihen ---------- */
function textColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#1b1b2f" : "#fff";
}

function crewButton(crew, enabled, onClick) {
  const btn = document.createElement("button");
  btn.className = "crew";
  btn.textContent = crew.cap;
  btn.style.background = PALETTE[crew.color];
  btn.style.color = textColor(PALETTE[crew.color]);
  btn.disabled = !enabled;
  btn.setAttribute("aria-label", `Trupp, noch ${crew.cap} Blöcke`);
  if (enabled) btn.addEventListener("click", onClick);
  return btn;
}

function renderPanels() {
  const size = LEVELS[levelIndex].bench;
  const benchEl = $("bench");
  benchEl.replaceChildren();
  benchEl.classList.toggle("bench--full", bench.length >= size);
  for (let i = 0; i < size; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    const crew = bench[i];
    if (crew) {
      slot.style.border = "0";
      slot.appendChild(crewButton(crew, true, () => {
        bench.splice(bench.indexOf(crew), 1);
        launch(crew);
      }));
    }
    benchEl.appendChild(slot);
  }
  $("bench-count").textContent = `${bench.length} / ${size}`;

  const lanesEl = $("lanes");
  lanesEl.replaceChildren();
  for (const lane of lanes) {
    const el = document.createElement("div");
    el.className = "lane";
    lane.slice(0, 4).forEach((crew, i) => {
      el.appendChild(crewButton(crew, i === 0, () => {
        lane.shift();
        launch(crew);
      }));
    });
    if (lane.length > 4) {
      const more = document.createElement("span");
      more.className = "lane__more";
      more.textContent = `+${lane.length - 4}`;
      el.appendChild(more);
    }
    lanesEl.appendChild(el);
  }
}

/* ---------- Anzeige: Spielfeld ---------- */
function resize() {
  const availW = Math.min(document.querySelector(".game").clientWidth - 20, 480);
  const availH = Math.max(230, window.innerHeight - 420);
  cell = Math.min(availW / (W + 2 * MARGIN), availH / (H + 2 * MARGIN));
  const w = Math.round(cell * (W + 2 * MARGIN));
  const h = Math.round(cell * (H + 2 * MARGIN));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Position (in Feldern) eines Haltepunkts; -1 und "stops" sind die Startecke.
function stopPoint(k) {
  const o = TRACK_OFFSET;
  if (k < 0 || k >= stops) return { x: MARGIN - o, y: MARGIN + H + o };
  if (k < W) return { x: MARGIN + k + 0.5, y: MARGIN + H + o };
  if (k < W + H) return { x: MARGIN + W + o, y: MARGIN + H - (k - W) - 0.5 };
  if (k < 2 * W + H) return { x: MARGIN + W - (k - W - H) - 0.5, y: MARGIN - o };
  return { x: MARGIN - o, y: MARGIN + (k - 2 * W - H) + 0.5 };
}

function trackPoint(s) {
  const k = Math.floor(s);
  const f = s - k;
  const a = stopPoint(k), b = stopPoint(k + 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBlock(r, c, color, scale = 1) {
  const pad = cell * 0.05;
  const size = (cell - 2 * pad) * scale;
  const x = (MARGIN + c + 0.5) * cell - size / 2;
  const y = (MARGIN + r + 0.5) * cell - size / 2;
  roundRect(x, y, size, size, size * 0.2);
  ctx.fillStyle = PALETTE[color];
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // kleiner Glanz oben links
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  roundRect(x + size * 0.14, y + size * 0.14, size * 0.38, size * 0.2, size * 0.08);
  ctx.fill();
}

function draw() {
  const w = cell * (W + 2 * MARGIN), h = cell * (H + 2 * MARGIN);
  ctx.clearRect(0, 0, w, h);

  // Bahn
  const o = TRACK_OFFSET * cell;
  roundRect(MARGIN * cell - o, MARGIN * cell - o, W * cell + 2 * o, H * cell + 2 * o, cell * 0.8);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = cell * 0.9;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([cell * 0.3, cell * 0.3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Blöcke
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) if (grid[r][c]) drawBlock(r, c, grid[r][c]);
  }

  // Abbau-Effekte
  for (const e of effects) {
    const p = e.age / 0.3;
    if (e.pop) {
      ctx.beginPath();
      ctx.arc(e.x * cell, e.y * cell, cell * (0.45 + p * 0.6), 0, Math.PI * 2);
      ctx.strokeStyle = PALETTE[e.color];
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.moveTo(e.from.x * cell, e.from.y * cell);
    ctx.lineTo((MARGIN + e.c + 0.5) * cell, (MARGIN + e.r + 0.5) * cell);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, cell * 0.12);
    ctx.lineCap = "round";
    ctx.stroke();
    drawBlock(e.r, e.c, e.color, 1 - p);
    ctx.globalAlpha = 1;
  }

  // Trupps auf der Bahn
  for (const t of track) {
    const p = trackPoint(Math.min(t.s, stops));
    const radius = cell * 0.52;
    ctx.beginPath();
    ctx.arc(p.x * cell, p.y * cell, radius, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE[t.crew.color];
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = textColor(PALETTE[t.crew.color]);
    ctx.font = `800 ${Math.round(radius * 1.05)}px "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.crew.cap, p.x * cell, p.y * cell + 1);
  }
}

function frame(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (state !== "lost") update(dt);
  draw();
  requestAnimationFrame(frame);
}

/* ---------- Bedienung ---------- */
$("new-btn").addEventListener("click", () => startLevel(levelIndex));
$("prev-btn").addEventListener("click", () => startLevel(levelIndex - 1));
$("next-btn").addEventListener("click", () => startLevel(levelIndex + 1));
$("overlay-btn").addEventListener("click", () => {
  if (state === "won") startLevel(levelIndex === LEVELS.length - 1 ? 0 : levelIndex + 1);
  else startLevel(levelIndex);
});
window.addEventListener("resize", resize);

startLevel(levelIndex);
requestAnimationFrame(frame);
