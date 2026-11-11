// Sudoku-Generator: erzeugt Rätsel mit genau einer Lösung in drei Schwierigkeitsgraden.
// Die Schwierigkeit richtet sich nach den nötigen Lösungstechniken, nicht nur nach der Zahl der Vorgaben:
//   leicht – allein mit "nackten Einern" lösbar (in einem Feld ist nur noch eine Ziffer möglich)
//   mittel – braucht zusätzlich "versteckte Einer" (eine Ziffer passt in einer Zeile/Spalte/Box nur an eine Stelle)
//   schwer – mit diesen beiden Techniken allein nicht lösbar, wenige Vorgaben
const SudokuGen = (() => {
  "use strict";

  const ALL = 0x1ff; // Bits 0..8 stehen für die Ziffern 1..9
  const ROW = [], COL = [], BOX = [];
  for (let i = 0; i < 81; i++) {
    ROW[i] = Math.floor(i / 9);
    COL[i] = i % 9;
    BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }

  // 27 Einheiten (9 Zeilen, 9 Spalten, 9 Boxen) mit je 9 Feldindizes
  const UNITS = [];
  for (let u = 0; u < 9; u++) {
    UNITS.push([...Array(81).keys()].filter((i) => ROW[i] === u));
    UNITS.push([...Array(81).keys()].filter((i) => COL[i] === u));
    UNITS.push([...Array(81).keys()].filter((i) => BOX[i] === u));
  }

  // Für jedes Feld die 20 Felder, die dieselbe Zeile, Spalte oder Box teilen
  const PEERS = [...Array(81).keys()].map((i) =>
    [...Array(81).keys()].filter((j) => j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])));

  const bitCount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const bitToDigit = (b) => 32 - Math.clz32(b);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Belegte Ziffern je Zeile/Spalte/Box als Bitmasken
  function usedMasks(grid) {
    const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      if (grid[i]) {
        const b = 1 << (grid[i] - 1);
        rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
      }
    }
    return { rows, cols, boxes };
  }

  // Backtracking mit "wenigste Kandidaten zuerst". Zählt Lösungen bis `limit`;
  // mit randomize=true bleibt in `grid` eine zufällige vollständige Lösung stehen.
  function search(grid, limit, randomize) {
    const { rows, cols, boxes } = usedMasks(grid);
    let found = 0;

    function step() {
      let best = -1, bestMask = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue;
        const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const count = bitCount(mask);
        if (count === 0) return false;
        if (count < bestCount) { best = i; bestMask = mask; bestCount = count; if (count === 1) break; }
      }
      if (best === -1) { found++; return found >= limit; }

      const bits = [];
      for (let m = bestMask; m; m &= m - 1) bits.push(m & -m);
      if (randomize) shuffle(bits);

      const r = ROW[best], c = COL[best], b = BOX[best];
      for (const bit of bits) {
        grid[best] = bitToDigit(bit);
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (step()) return true;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      grid[best] = 0;
      return false;
    }

    step();
    return found;
  }

  function countSolutions(grid, limit = 2) {
    return search(grid.slice(), limit, false);
  }

  // Löst so weit wie möglich nur mit Einern. Gibt true zurück, wenn das Rätsel damit komplett aufgeht.
  function solvableWithSingles(puzzle, useHidden) {
    const grid = puzzle.slice();
    const { rows, cols, boxes } = usedMasks(grid);
    const cand = (i) => ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
    const place = (i, bit) => {
      grid[i] = bitToDigit(bit);
      rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
    };

    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue;
        const mask = cand(i);
        if (mask && !(mask & (mask - 1))) { place(i, mask); progress = true; }
      }
      if (progress || !useHidden) continue;

      for (const unit of UNITS) {
        for (let bit = 1; bit <= 256; bit <<= 1) {
          let spot = -1, n = 0;
          for (const i of unit) {
            if (!grid[i] && (cand(i) & bit)) { spot = i; if (++n > 1) break; }
          }
          if (n === 1) { place(spot, bit); progress = true; }
        }
      }
    }
    return grid.every((v) => v !== 0);
  }

  const LEVELS = {
    leicht: {
      clues: [38, 40],
      keep: (p) => solvableWithSingles(p, false),
      accept: () => true
    },
    mittel: {
      clues: [30, 32],
      keep: (p) => solvableWithSingles(p, true),
      accept: (p) => !solvableWithSingles(p, false)
    },
    schwer: {
      clues: [24, 26],
      keep: (p) => countSolutions(p, 2) === 1,
      accept: (p) => !solvableWithSingles(p, true)
    }
  };

  function generate(levelName) {
    const level = LEVELS[levelName] || LEVELS.mittel;
    const [min, max] = level.clues;
    let result;

    // Mehrere Anläufe, bis das Rätsel wirklich zum Schwierigkeitsgrad passt
    for (let attempt = 0; attempt < 25; attempt++) {
      const solution = Array(81).fill(0);
      search(solution, 1, true);

      const puzzle = solution.slice();
      const target = min + Math.floor(Math.random() * (max - min + 1));
      let clues = 81;
      for (const i of shuffle([...Array(81).keys()])) {
        if (clues <= target) break;
        const saved = puzzle[i];
        puzzle[i] = 0;
        if (level.keep(puzzle)) clues--;
        else puzzle[i] = saved;
      }

      result = { puzzle, solution, clues };
      if (clues <= max + 2 && level.accept(puzzle)) break;
    }
    return result;
  }

  return { generate, countSolutions, solvableWithSingles, PEERS, ROW, COL, BOX };
})();

if (typeof module !== "undefined") module.exports = SudokuGen;
