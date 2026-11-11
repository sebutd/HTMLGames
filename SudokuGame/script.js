(() => {
  "use strict";

  const LEVELS = { leicht: "Leicht", mittel: "Mittel", schwer: "Schwer" };
  const { PEERS, ROW, COL, BOX } = SudokuGen;

  const boardEl = document.getElementById("board");
  const numpadEl = document.getElementById("numpad");
  const timeEl = document.getElementById("time");
  const mistakesEl = document.getElementById("mistakes");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");
  const undoBtn = document.getElementById("undo-btn");
  const notesBtn = document.getElementById("notes-btn");
  const levelBtns = [...document.querySelectorAll(".level")];

  const cells = [];
  const numBtns = [];

  let level = "leicht";
  let puzzle = [];    // Vorgaben (0 = leer)
  let solution = [];
  let values = [];    // aktueller Stand inkl. Vorgaben
  let notes = [];     // je Feld eine Bitmaske der notierten Ziffern
  let hinted = [];    // per Tipp aufgedeckte Felder
  let seconds = 0;
  let mistakes = 0;
  let hints = 0;
  let selected = -1;
  let notesMode = false;
  let over = false;
  let history = [];

  // ---------- Speicher ----------

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* egal */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* egal */ } }
  };

  function saveGame() {
    if (over) return;
    store.set("sudoku-save-" + level, JSON.stringify({
      puzzle: puzzle.join(""), solution: solution.join(""), values: values.join(""),
      notes, hinted: hinted.join(""), seconds, mistakes, hints
    }));
  }

  function loadGame() {
    try {
      const s = JSON.parse(store.get("sudoku-save-" + level));
      const digits = (str) => (/^\d{81}$/.test(str) ? [...str].map(Number) : null);
      const p = digits(s.puzzle), sol = digits(s.solution), v = digits(s.values), h = digits(s.hinted);
      if (!p || !sol || !v || !h || !Array.isArray(s.notes) || s.notes.length !== 81) return false;
      puzzle = p; solution = sol; values = v; hinted = h;
      notes = s.notes.map((n) => n & 0x1ff);
      seconds = s.seconds | 0; mistakes = s.mistakes | 0; hints = s.hints | 0;
      return true;
    } catch (e) {
      return false;
    }
  }

  const loadBest = () => parseInt(store.get("sudoku-best-" + level) || "0", 10) || 0;

  function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  // ---------- Aufbau ----------

  function buildBoard() {
    const boxes = [];
    for (let b = 0; b < 9; b++) {
      const box = document.createElement("div");
      box.className = "box";
      boxes.push(box);
      boardEl.appendChild(box);
    }
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.tabIndex = -1;
      cell.addEventListener("click", () => { selected = i; render(); });
      cells.push(cell);
      boxes[BOX[i]].appendChild(cell);
    }
  }

  function buildNumpad() {
    for (let d = 1; d <= 9; d++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "num";
      btn.innerHTML = `${d}<small></small>`;
      btn.addEventListener("click", () => enterDigit(d));
      numBtns.push(btn);
      numpadEl.appendChild(btn);
    }
  }

  // ---------- Spielstart ----------

  function newGame() {
    const game = SudokuGen.generate(level);
    puzzle = game.puzzle;
    solution = game.solution;
    values = puzzle.slice();
    notes = Array(81).fill(0);
    hinted = Array(81).fill(0);
    seconds = 0; mistakes = 0; hints = 0;
    startRound();
    saveGame();
  }

  function startRound() {
    selected = -1;
    over = false;
    history = [];
    overlay.classList.add("hidden");
    render();
  }

  function setLevel(name, forceNew) {
    if (!over && values.length) saveGame();
    level = LEVELS[name] ? name : "leicht";
    store.set("sudoku-level", level);
    levelBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.level === level)));
    if (!forceNew && loadGame()) startRound();
    else newGame();
  }

  const isLocked = (i) => puzzle[i] !== 0 || hinted[i] === 1;
  const hasProgress = () => values.some((v, i) => v !== puzzle[i]) || notes.some((n) => n);

  // ---------- Darstellung ----------

  function render() {
    const selValue = selected >= 0 ? values[selected] : 0;
    const peers = selected >= 0 ? new Set(PEERS[selected]) : null;

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const v = values[i];
      let cls = "cell";
      if (puzzle[i]) cls += " given";
      else if (hinted[i]) cls += " hinted";
      else if (v && v !== solution[i]) cls += " error";
      if (i === selected) cls += " selected";
      else if (selValue && v === selValue) cls += " same";
      else if (peers && peers.has(i)) cls += " peer";
      cell.className = cls;

      if (v) {
        cell.textContent = v;
      } else if (notes[i]) {
        let html = '<span class="notes">';
        for (let d = 1; d <= 9; d++) {
          const on = notes[i] & (1 << (d - 1));
          html += `<span${on && d === selValue ? ' class="hl"' : ""}>${on ? d : ""}</span>`;
        }
        cell.innerHTML = html + "</span>";
      } else {
        cell.textContent = "";
      }
      cell.setAttribute("aria-label",
        `Zeile ${ROW[i] + 1}, Spalte ${COL[i] + 1}: ${v || "leer"}`);
    }

    const counts = Array(10).fill(0);
    values.forEach((v) => counts[v]++);
    numBtns.forEach((btn, k) => {
      const left = 9 - counts[k + 1];
      btn.lastChild.textContent = left > 0 ? left : "";
      btn.classList.toggle("done", left <= 0);
    });

    timeEl.textContent = formatTime(seconds);
    mistakesEl.textContent = mistakes;
    const best = loadBest();
    bestEl.textContent = best ? formatTime(best) : "–";
    undoBtn.disabled = history.length === 0 || over;
    notesBtn.setAttribute("aria-pressed", String(notesMode));
  }

  // ---------- Züge ----------

  function remember() {
    history.push({ values: values.slice(), notes: notes.slice() });
    if (history.length > 300) history.shift();
  }

  function afterMove() {
    render();
    if (values.every((v, i) => v === solution[i])) finish();
    else saveGame();
  }

  function enterDigit(d) {
    if (over || selected < 0 || isLocked(selected)) return;
    const i = selected;
    const bit = 1 << (d - 1);

    if (notesMode) {
      if (values[i]) return;
      remember();
      notes[i] ^= bit;
      return afterMove();
    }

    remember();
    if (values[i] === d) {
      values[i] = 0;
    } else {
      values[i] = d;
      notes[i] = 0;
      if (d === solution[i]) {
        // Richtige Ziffer: passende Notizen in Zeile, Spalte und Box aufräumen
        PEERS[i].forEach((p) => { notes[p] &= ~bit; });
      } else {
        mistakes++;
      }
      cells[i].classList.remove("pop");
      void cells[i].offsetWidth; // Animation neu starten
      requestAnimationFrame(() => cells[i].classList.add("pop"));
    }
    afterMove();
  }

  function erase() {
    if (over || selected < 0 || isLocked(selected)) return;
    if (!values[selected] && !notes[selected]) return;
    remember();
    values[selected] = 0;
    notes[selected] = 0;
    afterMove();
  }

  function undo() {
    if (over || !history.length) return;
    const prev = history.pop();
    values = prev.values;
    notes = prev.notes;
    // Aufgedeckte Tipps bleiben stehen
    hinted.forEach((h, i) => { if (h) { values[i] = solution[i]; notes[i] = 0; } });
    afterMove();
  }

  // Tipp: deckt das gewählte Feld auf (oder ein zufälliges offenes, wenn keins gewählt ist)
  function hint() {
    if (over) return;
    const open = (i) => !isLocked(i) && values[i] !== solution[i];
    let i = selected;
    if (i < 0 || !open(i)) {
      const candidates = [...Array(81).keys()].filter(open);
      if (!candidates.length) return;
      i = candidates[Math.floor(Math.random() * candidates.length)];
    }
    const bit = 1 << (solution[i] - 1);
    values[i] = solution[i];
    notes[i] = 0;
    hinted[i] = 1;
    hints++;
    PEERS[i].forEach((p) => { notes[p] &= ~bit; });
    selected = i;
    afterMove();
  }

  function finish() {
    over = true;
    selected = -1;
    store.remove("sudoku-save-" + level);

    const best = loadBest();
    const counts = hints === 0; // Bestzeit nur ohne Tipps
    const record = counts && (!best || seconds < best);
    if (record) store.set("sudoku-best-" + level, String(seconds));
    render();

    let text = `${LEVELS[level]} gelöst in <strong>${formatTime(seconds)}</strong>` +
      ` mit ${mistakes} Fehler${mistakes === 1 ? "" : "n"}.`;
    if (record) text += "<br>Neue Bestzeit!";
    else if (!counts) text += `<br>${hints} Tipp${hints === 1 ? "" : "s"} genutzt – zählt nicht für die Bestzeit.`;
    else text += `<br>Bestzeit: ${formatTime(best)}`;
    overlayText.innerHTML = text;

    setTimeout(() => {
      overlay.classList.remove("hidden");
      document.getElementById("overlay-btn").focus();
    }, 500);
  }

  // ---------- Eingaben ----------

  function moveSelection(dr, dc) {
    if (selected < 0) { selected = 40; return render(); }
    const r = (ROW[selected] + dr + 9) % 9;
    const c = (COL[selected] + dc + 9) % 9;
    selected = r * 9 + c;
    render();
  }

  function toggleNotes() {
    notesMode = !notesMode;
    render();
  }

  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); newGame(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return undo(); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); return moveSelection(...arrows[e.key]); }
    if (/^[1-9]$/.test(e.key)) return enterDigit(Number(e.key));
    if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); return erase(); }
    if (e.key.toLowerCase() === "n") return toggleNotes();
    if (e.key.toLowerCase() === "h") return hint();
  });

  const onClick = (id, fn) => document.getElementById(id).addEventListener("click", (e) => {
    e.currentTarget.blur();
    fn();
  });
  onClick("undo-btn", undo);
  onClick("erase-btn", erase);
  onClick("notes-btn", toggleNotes);
  onClick("hint-btn", hint);
  onClick("overlay-btn", newGame);
  onClick("new-btn", () => {
    if (!over && hasProgress() && !confirm("Aktuelles Rätsel verwerfen und ein neues starten?")) return;
    newGame();
  });
  levelBtns.forEach((btn) => btn.addEventListener("click", () => {
    btn.blur();
    if (btn.dataset.level !== level) setLevel(btn.dataset.level);
  }));

  // ---------- Zeit ----------

  setInterval(() => {
    if (over || document.hidden) return;
    seconds++;
    timeEl.textContent = formatTime(seconds);
    if (seconds % 10 === 0) saveGame();
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
  window.addEventListener("pagehide", saveGame);

  buildBoard();
  buildNumpad();
  setLevel(store.get("sudoku-level") || "leicht");
})();
