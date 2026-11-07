// =============================================================
//  Bonbon-Tausch – Match-3-Spiel (HTML5 / Vanilla JS)
//  inkl. Spezial-Bonbons, die in späteren Levels freigeschaltet werden
// =============================================================

const SIZE = 8;          // Spielfeld 8 x 8
const TYPES = 6;         // Anzahl Bonbon-Sorten
const SWAP_TIME = 220;   // ms – muss zur CSS-Transition passen
const POP_TIME = 300;
const FALL_TIME = 300;
const HINT_DELAY = 6000; // ms bis ein Tipp angezeigt wird

// Ab welchem Level welches Spezial-Bonbon entstehen kann
const UNLOCK = { striped: 2, bomb: 3, rainbow: 4 };

// Erklärung, die beim Erreichen des Levels angezeigt wird
const LEVEL_INFO = {
  2: {
    title: "Neu: Streifen-Bonbon",
    text: "Bilde 4 gleiche Bonbons in einer Reihe. Es entsteht ein Streifen-Bonbon, das beim Auslösen die ganze Zeile bzw. Spalte abräumt."
  },
  3: {
    title: "Neu: Bomben-Bonbon",
    text: "Bilde ein L oder T aus 5 gleichen Bonbons. Die Bombe sprengt beim Auslösen alle Bonbons im Umkreis (3×3)."
  },
  4: {
    title: "Neu: Regenbogen-Kugel",
    text: "Bilde 5 gleiche Bonbons in einer Reihe. Tausche die Kugel mit einem Bonbon – alle Bonbons dieser Farbe verschwinden."
  },
  5: {
    title: "Tipp: Kombinationen",
    text: "Tausche zwei Spezial-Bonbons miteinander – zusammen wirken sie viel stärker!"
  }
};

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const movesEl = document.getElementById("moves");
const levelEl = document.getElementById("level");
const targetEl = document.getElementById("target");
const bestEl = document.getElementById("best");
const progressEl = document.getElementById("progress-bar");
const comboEl = document.getElementById("combo");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayBtn = document.getElementById("overlay-btn");
const restartBtn = document.getElementById("restart-btn");

// grid[row][col] = { type, special, el }
//   type:    0..TYPES-1 (Farbe), -1 bei Regenbogen-Kugel
//   special: null | "h" | "v" | "bomb" | "rainbow"
let grid = [];
let score = 0;
let levelStartScore = 0;
let moves = 0;
let level = 1;
let target = 0;
let busy = false;        // während Animationen keine Eingaben
let selected = null;     // {r, c} bei Klick-Steuerung
let hintTimer = null;
let overlayAction = null;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const randType = () => Math.floor(Math.random() * TYPES);
const key = (r, c) => r * SIZE + c;
const rc = (k) => [Math.floor(k / SIZE), k % SIZE];
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const tileAt = (k) => grid[Math.floor(k / SIZE)][k % SIZE];

// ---------- Bestwert (optional, falls localStorage verfügbar) ----------
function loadBest() {
  try { return parseInt(localStorage.getItem("bonbon-best") || "0", 10); } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem("bonbon-best", String(v)); } catch (e) { /* egal */ }
}
let best = loadBest();

// =============================================================
//  Darstellung
// =============================================================
function createTile(type, r, c, special = null) {
  const el = document.createElement("div");
  el.innerHTML = '<div class="candy"><span class="core"></span></div>';
  const tile = { type, special, el };
  render(tile);
  setPos(el, r, c);
  boardEl.appendChild(el);
  return tile;
}

function render(tile) {
  let cls = "tile";
  if (tile.type >= 0) cls += " t" + tile.type;
  if (tile.special) cls += " sp-" + tile.special;
  tile.el.className = cls;
}

function setPos(el, r, c) {
  el.style.setProperty("--x", c);
  el.style.setProperty("--y", r);
}

function updateHud() {
  scoreEl.textContent = score;
  movesEl.textContent = moves;
  levelEl.textContent = level;
  targetEl.textContent = target;
  const span = target - levelStartScore;
  progressEl.style.width = Math.max(0, Math.min(100, ((score - levelStartScore) / span) * 100)) + "%";
  if (score > best) { best = score; saveBest(best); }
  bestEl.textContent = best;
}

function showCombo(text) {
  comboEl.textContent = text;
  comboEl.classList.remove("show");
  void comboEl.offsetWidth; // Animation neu starten
  comboEl.classList.add("show");
}

// Kurze Effekt-Animationen (Strahl / Explosion)
function showEffect(kind, r, c, radius = 1) {
  const fx = document.createElement("div");
  fx.className = "fx fx-" + kind;
  if (kind === "row") fx.style.top = (r * 100) / SIZE + "%";
  if (kind === "col") fx.style.left = (c * 100) / SIZE + "%";
  if (kind === "blast") {
    const size = (2 * radius + 1) * 100 / SIZE;
    fx.style.width = fx.style.height = size + "%";
    fx.style.left = ((c - radius) * 100) / SIZE + "%";
    fx.style.top = ((r - radius) * 100) / SIZE + "%";
  }
  boardEl.appendChild(fx);
  setTimeout(() => fx.remove(), 500);
}

// =============================================================
//  Spielfeld erzeugen
// =============================================================
function buildBoard() {
  boardEl.innerHTML = "";
  while (true) {
    const types = [];
    for (let r = 0; r < SIZE; r++) {
      types[r] = [];
      for (let c = 0; c < SIZE; c++) {
        let t;
        // keine fertigen 3er-Reihen beim Start
        do {
          t = randType();
        } while (
          (c >= 2 && types[r][c - 1] === t && types[r][c - 2] === t) ||
          (r >= 2 && types[r - 1][c] === t && types[r - 2][c] === t)
        );
        types[r][c] = t;
      }
    }
    if (findPossibleMove(types)) {
      grid = types.map((row, r) => row.map((t, c) => createTile(t, r, c)));
      return;
    }
  }
}

function typeGrid() {
  return grid.map((row) => row.map((cell) => (cell ? cell.type : -1)));
}

// =============================================================
//  Treffer suchen
// =============================================================
const sameColor = (a, b) => a && b && a.type >= 0 && a.type === b.type;

// Alle Reihen >= 3 (waagerecht "h" und senkrecht "v")
function findRuns() {
  const runs = [];
  for (let r = 0; r < SIZE; r++) {
    let start = 0;
    for (let c = 1; c <= SIZE; c++) {
      if (c < SIZE && sameColor(grid[r][c], grid[r][c - 1])) continue;
      if (c - start >= 3) {
        const cells = [];
        for (let k = start; k < c; k++) cells.push(key(r, k));
        runs.push({ dir: "h", cells });
      }
      start = c;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let start = 0;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && sameColor(grid[r][c], grid[r - 1][c])) continue;
      if (r - start >= 3) {
        const cells = [];
        for (let k = start; k < r; k++) cells.push(key(k, c));
        runs.push({ dir: "v", cells });
      }
      start = r;
    }
  }
  return runs;
}

// Reihen, die sich berühren (L-/T-Formen), zu Gruppen zusammenfassen
function findGroups() {
  const runs = findRuns();
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[i].cells.some((k) => runs[j].cells.includes(k))) parent[find(i)] = find(j);
    }
  }
  const map = new Map();
  runs.forEach((run, i) => {
    const root = find(i);
    if (!map.has(root)) map.set(root, []);
    map.get(root).push(run);
  });
  return [...map.values()].map((groupRuns) => {
    const cells = new Set();
    groupRuns.forEach((run) => run.cells.forEach((k) => cells.add(k)));
    const longest = groupRuns.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const hasH = groupRuns.some((run) => run.dir === "h");
    const hasV = groupRuns.some((run) => run.dir === "v");
    let cross = null; // Schnittpunkt bei L-/T-Form
    if (hasH && hasV) {
      const hCells = new Set(groupRuns.filter((x) => x.dir === "h").flatMap((x) => x.cells));
      cross = groupRuns.filter((x) => x.dir === "v").flatMap((x) => x.cells).find((k) => hCells.has(k));
    }
    return { cells, longest, isCross: hasH && hasV, cross, type: tileAt(longest.cells[0]).type };
  });
}

// Welches Spezial-Bonbon entsteht aus dieser Gruppe – und wo?
function decideSpecial(group, swapKeys) {
  const len = group.longest.cells.length;
  let special = null;
  if (len >= 5 && level >= UNLOCK.rainbow) special = "rainbow";
  else if (group.isCross && level >= UNLOCK.bomb) special = "bomb";
  else if (len >= 4 && level >= UNLOCK.striped) special = group.longest.dir; // "h" oder "v"
  if (!special) return null;

  let pos = null;
  if (swapKeys) pos = swapKeys.find((k) => group.cells.has(k));
  if (pos === undefined || pos === null) {
    pos = group.isCross ? group.cross : group.longest.cells[Math.floor(len / 2)];
  }
  return { key: pos, special, type: special === "rainbow" ? -1 : group.type };
}

function groupBonus(group) {
  const len = group.longest.cells.length;
  if (len >= 5) return 50;
  if (group.isCross) return 30;
  if (len === 4) return 20;
  return 0;
}

// Bildet (r,c) in einem Typ-Raster eine 3er-Reihe?
function matchAt(t, r, c) {
  const v = t[r][c];
  if (v < 0) return false;
  let h = 1, k = c - 1;
  while (k >= 0 && t[r][k] === v) { h++; k--; }
  k = c + 1;
  while (k < SIZE && t[r][k] === v) { h++; k++; }
  if (h >= 3) return true;
  let vv = 1;
  k = r - 1;
  while (k >= 0 && t[k][c] === v) { vv++; k--; }
  k = r + 1;
  while (k < SIZE && t[k][c] === v) { vv++; k++; }
  return vv >= 3;
}

function hasAnyMatch(t) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (matchAt(t, r, c)) return true;
  return false;
}

// Sucht einen gültigen Zug im Typ-Raster; gibt [[r1,c1],[r2,c2]] oder null zurück
function findPossibleMove(t) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= SIZE || c2 >= SIZE) continue;
        [t[r][c], t[r2][c2]] = [t[r2][c2], t[r][c]];
        const ok = matchAt(t, r, c) || matchAt(t, r2, c2);
        [t[r][c], t[r2][c2]] = [t[r2][c2], t[r][c]];
        if (ok) return [[r, c], [r2, c2]];
      }
    }
  }
  return null;
}

// Wie oben, berücksichtigt aber auch Spezial-Tausch (Regenbogen, zwei Spezial-Bonbons)
function findAnyMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= SIZE || c2 >= SIZE) continue;
        const a = grid[r][c], b = grid[r2][c2];
        if (a.special === "rainbow" || b.special === "rainbow" || (a.special && b.special)) {
          return [[r, c], [r2, c2]];
        }
      }
    }
  }
  return findPossibleMove(typeGrid());
}

// =============================================================
//  Spezial-Bonbons auslösen
// =============================================================
// Felder, die ein ausgelöstes Spezial-Bonbon zusätzlich abräumt
function effectCells(tile, r, c) {
  const out = [];
  if (tile.special === "h") {
    showEffect("row", r, c);
    for (let k = 0; k < SIZE; k++) out.push(key(r, k));
  } else if (tile.special === "v") {
    showEffect("col", r, c);
    for (let k = 0; k < SIZE; k++) out.push(key(k, c));
  } else if (tile.special === "bomb") {
    showEffect("blast", r, c, 1);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (inside(r + dr, c + dc)) out.push(key(r + dr, c + dc));
  } else if (tile.special === "rainbow") {
    // durch Kettenreaktion ausgelöst: zufällige vorhandene Farbe
    const colors = grid.flat().filter((t) => t && t.type >= 0).map((t) => t.type);
    if (colors.length) out.push(...cellsOfColor(colors[Math.floor(Math.random() * colors.length)]));
  }
  return out;
}

function cellsOfColor(type) {
  const out = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (grid[r][c] && grid[r][c].type === type) out.push(key(r, c));
  return out;
}

// Kettenreaktion: getroffene Spezial-Bonbons lösen ihrerseits aus
function expand(keys) {
  const all = new Set(keys);
  const queue = [...keys];
  const triggered = new Set();
  while (queue.length) {
    const k = queue.shift();
    const tile = tileAt(k);
    if (!tile || !tile.special || triggered.has(k)) continue;
    triggered.add(k);
    const [r, c] = rc(k);
    for (const k2 of effectCells(tile, r, c)) {
      if (!all.has(k2) && tileAt(k2)) {
        all.add(k2);
        queue.push(k2);
      }
    }
  }
  return all;
}

// Felder abräumen, neue Spezial-Bonbons erzeugen, nachrutschen lassen
async function clearAndCollapse(keys, creations, combo, bonus) {
  const all = expand(keys);
  creations.forEach((cr) => all.delete(cr.key)); // hier entsteht ein neues Spezial-Bonbon

  score += (all.size * 10 + bonus) * combo;
  updateHud();

  all.forEach((k) => tileAt(k).el.classList.add("pop"));
  creations.forEach((cr) => {
    const tile = tileAt(cr.key);
    tile.type = cr.type;
    tile.special = cr.special;
    render(tile);
    tile.el.classList.add("born");
  });

  await sleep(POP_TIME);
  all.forEach((k) => {
    const [r, c] = rc(k);
    grid[r][c].el.remove();
    grid[r][c] = null;
  });
  creations.forEach((cr) => tileAt(cr.key).el.classList.remove("born"));

  applyGravity();
  await sleep(FALL_TIME + 40);
}

// Tausch zweier Spezial-Bonbons bzw. mit einer Regenbogen-Kugel
async function specialSwap(posA, posB) {
  const A = grid[posA.r][posA.c];
  const B = grid[posB.r][posB.c];
  const keys = new Set([key(posA.r, posA.c), key(posB.r, posB.c)]);
  const { r, c } = posB; // Mittelpunkt der Wirkung
  const isStriped = (t) => t.special === "h" || t.special === "v";
  const add = (rr, cc) => { if (inside(rr, cc)) keys.add(key(rr, cc)); };

  if (A.special === "rainbow" && B.special === "rainbow") {
    showCombo("Mega-Regenbogen!");
    for (let k = 0; k < SIZE * SIZE; k++) keys.add(k);
    A.special = B.special = null;
  } else if (A.special === "rainbow" || B.special === "rainbow") {
    const other = A.special === "rainbow" ? B : A;
    const rainbow = other === A ? B : A;
    const color = other.type;
    rainbow.special = null;
    const targets = cellsOfColor(color);
    if (other.special) {
      // alle Bonbons dieser Farbe werden zu Spezial-Bonbons der gleichen Art
      showCombo(isStriped(other) ? "Streifen-Regen!" : "Bomben-Regen!");
      targets.forEach((k) => {
        const t = tileAt(k);
        t.special = other.special === "bomb" ? "bomb" : (Math.random() < 0.5 ? "h" : "v");
        render(t);
      });
      await sleep(350);
    } else {
      showCombo("Farbe weg!");
    }
    targets.forEach((k) => keys.add(k));
  } else if (isStriped(A) && isStriped(B)) {
    showCombo("Kreuz!");
    A.special = B.special = null;
    showEffect("row", r, c);
    showEffect("col", r, c);
    for (let k = 0; k < SIZE; k++) { add(r, k); add(k, c); }
  } else if (A.special === "bomb" && B.special === "bomb") {
    showCombo("Riesen-Explosion!");
    A.special = B.special = null;
    showEffect("blast", r, c, 2);
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
  } else {
    // Streifen + Bombe: drei Zeilen und drei Spalten
    showCombo("Super-Streifen!");
    A.special = B.special = null;
    for (let d = -1; d <= 1; d++) {
      if (inside(r + d, 0)) showEffect("row", r + d, c);
      if (inside(0, c + d)) showEffect("col", r, c + d);
      for (let k = 0; k < SIZE; k++) { add(r + d, k); add(k, c + d); }
    }
  }
  await clearAndCollapse(keys, [], 1, 50);
}

// =============================================================
//  Spielzug
// =============================================================
function swapCells(a, b) {
  const A = grid[a.r][a.c], B = grid[b.r][b.c];
  grid[a.r][a.c] = B;
  grid[b.r][b.c] = A;
  setPos(A.el, b.r, b.c);
  setPos(B.el, a.r, a.c);
}

async function trySwap(a, b) {
  if (busy || moves <= 0) return;
  if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
  busy = true;
  clearHint();
  clearSelection();

  swapCells(a, b);
  await sleep(SWAP_TIME);

  // nach dem Tausch: A liegt jetzt auf b, B auf a
  const A = grid[b.r][b.c], B = grid[a.r][a.c];
  const special = A.special === "rainbow" || B.special === "rainbow" || (A.special && B.special);

  if (special) {
    moves--;
    updateHud();
    await specialSwap(a, b);
    await resolveBoard(null);
  } else if (findGroups().length === 0) {
    // ungültig -> zurücktauschen
    swapCells(a, b);
    await sleep(SWAP_TIME);
    busy = false;
    scheduleHint();
    return;
  } else {
    moves--;
    updateHud();
    await resolveBoard([key(a.r, a.c), key(b.r, b.c)]);
  }

  busy = false;
  checkEnd();
  scheduleHint();
}

// Treffer entfernen, nachrutschen lassen, auffüllen – bis keine Treffer mehr
async function resolveBoard(swapKeys) {
  let combo = 1;
  while (true) {
    const groups = findGroups();
    if (groups.length === 0) break;

    const keys = new Set();
    const creations = [];
    let bonus = 0;
    for (const g of groups) {
      g.cells.forEach((k) => keys.add(k));
      const cr = decideSpecial(g, combo === 1 ? swapKeys : null);
      if (cr) creations.push(cr);
      bonus += groupBonus(g);
    }

    if (combo > 1) showCombo("Kombo x" + combo + "!");
    else if (groups.some((g) => g.longest.cells.length >= 5)) showCombo("Super!");
    else if (groups.some((g) => g.longest.cells.length === 4 || g.isCross)) showCombo("Toll!");

    await clearAndCollapse(keys, creations, combo, bonus);
    combo++;
  }

  // Keine Züge mehr möglich? -> mischen
  if (!findAnyMove()) {
    showCombo("Mischen …");
    await sleep(500);
    await shuffleBoard();
  }
}

function applyGravity() {
  const newTiles = [];
  for (let c = 0; c < SIZE; c++) {
    // vorhandene Bonbons nach unten schieben
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const cell = grid[r][c];
      if (cell) {
        if (r !== write) {
          grid[write][c] = cell;
          grid[r][c] = null;
          setPos(cell.el, write, c);
        }
        write--;
      }
    }
    // neue Bonbons oberhalb des Feldes erzeugen
    const missing = write + 1;
    for (let r = write; r >= 0; r--) {
      const tile = createTile(randType(), r - missing, c);
      tile.el.classList.add("no-anim");
      grid[r][c] = tile;
      newTiles.push([tile, r, c]);
    }
  }
  // Reflow erzwingen, dann an Zielposition fallen lassen
  void boardEl.offsetWidth;
  newTiles.forEach(([tile, r, c]) => {
    tile.el.classList.remove("no-anim");
    setPos(tile.el, r, c);
  });
}

async function shuffleBoard() {
  const tiles = grid.flat();
  const hasRainbow = tiles.some((t) => t.special === "rainbow");
  for (let attempt = 0; attempt < 500; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    const t = [];
    for (let r = 0; r < SIZE; r++) t.push(tiles.slice(r * SIZE, r * SIZE + SIZE).map((x) => x.type));
    if (!hasAnyMatch(t) && (hasRainbow || findPossibleMove(t))) break;
    if (attempt === 499) tiles.forEach((x) => { if (x.type >= 0) { x.type = randType(); render(x); } });
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      grid[r][c] = tiles[r * SIZE + c];
      setPos(grid[r][c].el, r, c);
    }
  }
  await sleep(SWAP_TIME + 100);
  // falls das Notfall-Mischen doch Treffer erzeugt hat
  if (findGroups().length) await resolveBoard(null);
}

// =============================================================
//  Level / Spielende
// =============================================================
function startLevel(lvl, startScore) {
  level = lvl;
  score = startScore;
  levelStartScore = startScore;
  target = startScore + 1000 + (lvl - 1) * 600;
  moves = Math.max(15, 25 - (lvl - 1));
  busy = false;
  selected = null;
  hideOverlay();
  buildBoard();
  updateHud();
  scheduleHint();
  const info = LEVEL_INFO[lvl];
  if (info) showOverlay(info.title, info.text, "Los geht's", hideOverlay);
}

function checkEnd() {
  if (score >= target) {
    clearHint();
    showOverlay(
      "Level " + level + " geschafft!",
      "Du hast " + score + " Punkte. Bereit für Level " + (level + 1) + "?",
      "Weiter",
      () => startLevel(level + 1, score)
    );
  } else if (moves <= 0) {
    clearHint();
    showOverlay(
      "Keine Züge mehr",
      "Dir fehlten " + (target - score) + " Punkte. Versuch es nochmal!",
      "Level wiederholen",
      () => startLevel(level, levelStartScore)
    );
  }
}

function showOverlay(title, text, btn, action) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayBtn.textContent = btn;
  overlayAction = action;
  overlayEl.classList.remove("hidden");
}
function hideOverlay() { overlayEl.classList.add("hidden"); }

overlayBtn.addEventListener("click", () => overlayAction && overlayAction());
restartBtn.addEventListener("click", () => startLevel(1, 0));

// =============================================================
//  Tipps
// =============================================================
function scheduleHint() {
  clearHint();
  hintTimer = setTimeout(() => {
    if (busy) return;
    const mv = findAnyMove();
    if (mv) mv.forEach(([r, c]) => grid[r][c].el.classList.add("hint"));
  }, HINT_DELAY);
}
function clearHint() {
  clearTimeout(hintTimer);
  boardEl.querySelectorAll(".hint").forEach((el) => el.classList.remove("hint"));
}

// =============================================================
//  Eingabe: Klicken ODER Wischen (Maus & Touch)
// =============================================================
function cellFromEvent(e) {
  const rect = boardEl.getBoundingClientRect();
  const c = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE);
  const r = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE);
  return inside(r, c) ? { r, c } : null;
}

function clearSelection() {
  if (selected && grid[selected.r][selected.c]) grid[selected.r][selected.c].el.classList.remove("selected");
  selected = null;
}

function select(cell) {
  selected = cell;
  grid[cell.r][cell.c].el.classList.add("selected");
}

let drag = null; // {start:{r,c}, x, y, done}

boardEl.addEventListener("pointerdown", (e) => {
  if (busy) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  drag = { start: cell, x: e.clientX, y: e.clientY, done: false };
  boardEl.setPointerCapture(e.pointerId);
});

boardEl.addEventListener("pointermove", (e) => {
  if (!drag || drag.done || busy) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const threshold = boardEl.getBoundingClientRect().width / SIZE / 3;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
  drag.done = true;
  const s = drag.start;
  const to = Math.abs(dx) > Math.abs(dy)
    ? { r: s.r, c: s.c + Math.sign(dx) }
    : { r: s.r + Math.sign(dy), c: s.c };
  if (inside(to.r, to.c)) trySwap(s, to);
});

boardEl.addEventListener("pointerup", () => {
  if (!drag) return;
  const { start, done } = drag;
  drag = null;
  if (done || busy) return;

  // Klick-Steuerung: erst auswählen, dann Nachbarn anklicken
  if (!selected) {
    select(start);
  } else if (selected.r === start.r && selected.c === start.c) {
    clearSelection();
  } else if (Math.abs(selected.r - start.r) + Math.abs(selected.c - start.c) === 1) {
    trySwap(selected, start);
  } else {
    clearSelection();
    select(start);
  }
});

boardEl.addEventListener("pointercancel", () => { drag = null; });

// Los geht's
startLevel(1, 0);
