(() => {
  "use strict";

  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const FLIP_DELAY = 280; // ms zwischen dem Aufdecken einzelner Kacheln
  const RANK = { absent: 1, present: 2, correct: 3 };

  const KEY_ROWS = [
    ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä"],
    ["ENTER", "Y", "X", "C", "V", "B", "N", "M", "BACK"]
  ];

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const toastEl = document.getElementById("toast");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const statsEl = document.getElementById("stats");

  let solution = "";
  let guesses = [];
  let current = "";
  let busy = false;
  let over = false;
  const keyEls = {};
  let keyState = {};

  // ---------- Aufbau ----------

  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement("div");
      row.className = "row";
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function buildKeyboard() {
    KEY_ROWS.forEach((keys) => {
      const row = document.createElement("div");
      row.className = "kb-row";
      keys.forEach((k) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "key";
        btn.dataset.key = k;
        if (k === "ENTER") { btn.textContent = "OK"; btn.classList.add("wide"); btn.setAttribute("aria-label", "Eingabe"); }
        else if (k === "BACK") { btn.textContent = "⌫"; btn.classList.add("wide"); btn.setAttribute("aria-label", "Löschen"); }
        else { btn.textContent = k; keyEls[k] = btn; }
        btn.addEventListener("click", (e) => {
          e.currentTarget.blur();
          handleKey(k);
        });
        row.appendChild(btn);
      });
      keyboardEl.appendChild(row);
    });
  }

  // ---------- Spiellogik ----------

  function pickWord() {
    let word;
    let last = "";
    try { last = localStorage.getItem("wortraetsel-last") || ""; } catch (e) { /* egal */ }
    do {
      word = SOLUTIONS[Math.floor(Math.random() * SOLUTIONS.length)];
    } while (word === last && SOLUTIONS.length > 1);
    try { localStorage.setItem("wortraetsel-last", word); } catch (e) { /* egal */ }
    return word;
  }

  function newGame() {
    solution = pickWord();
    guesses = [];
    current = "";
    busy = false;
    over = false;
    keyState = {};
    Object.values(keyEls).forEach((el) => el.classList.remove("correct", "present", "absent"));
    overlay.classList.add("hidden");
    buildBoard();
  }

  // Bewertet einen Versuch wie bei Wordle (doppelte Buchstaben korrekt behandelt)
  function evaluate(guess, answer) {
    const result = Array(WORD_LENGTH).fill("absent");
    const remaining = {};
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guess[i] === answer[i]) result[i] = "correct";
      else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (result[i] === "correct") continue;
      if (remaining[guess[i]] > 0) {
        result[i] = "present";
        remaining[guess[i]]--;
      }
    }
    return result;
  }

  function handleKey(key) {
    if (busy || over) return;
    if (key === "ENTER") return submit();
    if (key === "BACK") {
      current = current.slice(0, -1);
      return renderCurrent();
    }
    if (current.length < WORD_LENGTH && /^[A-ZÄÖÜ]$/.test(key)) {
      current += key;
      renderCurrent();
    }
  }

  function renderCurrent() {
    const row = boardEl.children[guesses.length];
    [...row.children].forEach((tile, i) => {
      const ch = current[i] || "";
      if (tile.textContent !== ch) {
        tile.textContent = ch;
        tile.classList.toggle("filled", !!ch);
      }
    });
  }

  function submit() {
    const row = boardEl.children[guesses.length];
    if (current.length < WORD_LENGTH) return reject(row, "Zu wenige Buchstaben");
    if (!ALLOWED.has(current)) return reject(row, "Kein bekanntes Wort");

    const guess = current;
    const result = evaluate(guess, solution);
    guesses.push(guess);
    current = "";
    busy = true;

    [...row.children].forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add("flip");
        setTimeout(() => tile.classList.add(result[i]), 250);
      }, i * FLIP_DELAY);
    });

    setTimeout(() => {
      updateKeyboard(guess, result);
      busy = false;
      if (guess === solution) {
        over = true;
        [...row.children].forEach((t, i) => setTimeout(() => {
          t.classList.remove("flip");
          t.classList.add("bounce");
        }, i * 90));
        finish(true);
      } else if (guesses.length === MAX_GUESSES) {
        over = true;
        finish(false);
      }
    }, WORD_LENGTH * FLIP_DELAY + 250);
  }

  function reject(row, msg) {
    showToast(msg);
    row.classList.remove("shake");
    void row.offsetWidth; // Animation neu starten
    row.classList.add("shake");
  }

  function updateKeyboard(guess, result) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = guess[i];
      const state = result[i];
      if (!keyState[ch] || RANK[state] > RANK[keyState[ch]]) {
        keyState[ch] = state;
        const el = keyEls[ch];
        if (el) {
          el.classList.remove("correct", "present", "absent");
          el.classList.add(state);
        }
      }
    }
  }

  // ---------- Ende & Statistik ----------

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem("wortraetsel-stats")) || { played: 0, won: 0, streak: 0, best: 0 };
    } catch (e) {
      return { played: 0, won: 0, streak: 0, best: 0 };
    }
  }

  function finish(won) {
    const stats = loadStats();
    stats.played++;
    if (won) {
      stats.won++;
      stats.streak++;
      stats.best = Math.max(stats.best, stats.streak);
    } else {
      stats.streak = 0;
    }
    try { localStorage.setItem("wortraetsel-stats", JSON.stringify(stats)); } catch (e) { /* egal */ }

    const praise = ["Genial!", "Großartig!", "Super!", "Sehr gut!", "Gut gemacht!", "Puh, knapp!"];
    setTimeout(() => {
      overlayTitle.textContent = won ? praise[guesses.length - 1] : "Leider verloren";
      overlayText.innerHTML = (won
        ? `Gelöst in ${guesses.length} von ${MAX_GUESSES} Versuchen.`
        : "Das gesuchte Wort war:") + `<span class="word">${solution}</span>`;
      const rate = Math.round((stats.won / stats.played) * 100);
      statsEl.textContent = `Gespielt: ${stats.played} · Gewonnen: ${rate} % · Serie: ${stats.streak} · Beste Serie: ${stats.best}`;
      overlay.classList.remove("hidden");
      document.getElementById("overlay-btn").focus();
    }, won ? 1200 : 600);
  }

  let toastTimer;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1400);
  }

  // ---------- Eingaben ----------

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!overlay.classList.contains("hidden")) {
      if (e.key === "Enter") { e.preventDefault(); newGame(); }
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); handleKey("ENTER"); }
    else if (e.key === "Backspace") handleKey("BACK");
    else if (e.key.length === 1) {
      let k = e.key.toUpperCase();
      if (k === "ß") return showToast("Bitte „ss“ statt „ß“");
      handleKey(k);
    }
  });

  document.getElementById("new-btn").addEventListener("click", (e) => {
    e.currentTarget.blur();
    newGame();
  });
  document.getElementById("overlay-btn").addEventListener("click", newGame);

  buildKeyboard();
  newGame();
})();
