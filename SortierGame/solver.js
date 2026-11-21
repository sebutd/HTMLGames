/* Farben sortieren – Löser und Level-Generator (ohne DOM).
   Ein Glas ist ein Array von Farbnummern, von unten nach oben. */
const SortSolver = (() => {
  "use strict";

  const topRun = (t) => {
    if (!t.length) return 0;
    const c = t[t.length - 1];
    let n = 1;
    while (n < t.length && t[t.length - 1 - n] === c) n++;
    return n;
  };

  const isMono = (t) => t.length > 0 && topRun(t) === t.length;

  function canPour(tubes, cap, a, b) {
    if (a === b) return false;
    const from = tubes[a], to = tubes[b];
    if (!from.length || to.length >= cap) return false;
    return !to.length || to[to.length - 1] === from[from.length - 1];
  }

  // Gießt so viel der obersten Farbe wie hineinpasst; liefert die Menge.
  function pour(tubes, cap, a, b) {
    const from = tubes[a], to = tubes[b];
    const n = Math.min(topRun(from), cap - to.length);
    for (let i = 0; i < n; i++) to.push(from.pop());
    return n;
  }

  function isSolved(tubes, cap) {
    return tubes.every((t) => !t.length || (t.length === cap && isMono(t)));
  }

  const keyOf = (tubes) => tubes.map((t) => t.join(",")).sort().join("|");

  // Sinnvolle Züge, die vielversprechendsten zuerst.
  function candidateMoves(tubes, cap) {
    const moves = [];
    let firstEmpty = -1;
    for (let b = 0; b < tubes.length; b++) if (!tubes[b].length) { firstEmpty = b; break; }
    for (let a = 0; a < tubes.length; a++) {
      const from = tubes[a];
      if (!from.length) continue;
      if (from.length === cap && isMono(from)) continue;
      const run = topRun(from);
      for (let b = 0; b < tubes.length; b++) {
        if (!canPour(tubes, cap, a, b)) continue;
        const to = tubes[b];
        if (!to.length) {
          if (b !== firstEmpty || isMono(from)) continue; // nutzlos
          moves.push({ a, b, score: 0 });
        } else {
          const fits = cap - to.length >= run;
          let score = fits ? 3 : 1;
          if (fits && isMono(to)) score += 2;          // Glas wird einfarbiger
          if (fits && run === from.length) score += 1; // Quelle wird leer
          moves.push({ a, b, score });
        }
      }
    }
    moves.sort((x, y) => y.score - x.score);
    return moves;
  }

  /* Tiefensuche mit Gedächtnis. Liefert die Zugfolge [[a,b],…] oder null
     (unlösbar bzw. Suchgrenze erreicht – dann ist `exhausted` false). */
  function solve(start, cap, limit = 60000) {
    const tubes = start.map((t) => t.slice());
    const seen = new Set();
    const path = [];
    let nodes = 0;
    let aborted = false;

    function dfs() {
      if (isSolved(tubes, cap)) return true;
      if (++nodes > limit) { aborted = true; return false; }
      const key = keyOf(tubes);
      if (seen.has(key)) return false;
      seen.add(key);
      for (const m of candidateMoves(tubes, cap)) {
        const n = pour(tubes, cap, m.a, m.b);
        path.push([m.a, m.b]);
        if (dfs()) return true;
        path.pop();
        for (let i = 0; i < n; i++) tubes[m.a].push(tubes[m.b].pop());
        if (aborted) return false;
      }
      return false;
    }

    const ok = dfs();
    return { path: ok ? path : null, exhausted: !ok && !aborted };
  }

  // Zufälliges, garantiert lösbares Level.
  function generate(colors, empties, cap, rng = Math.random) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const pool = [];
      for (let c = 0; c < colors; c++) for (let i = 0; i < cap; i++) pool.push(c);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const tubes = [];
      for (let c = 0; c < colors; c++) tubes.push(pool.slice(c * cap, (c + 1) * cap));
      // Kein Glas darf schon fertig sein, keins mit 3 gleichen Schichten oben.
      if (tubes.some((t) => topRun(t) >= cap - 1)) continue;
      for (let e = 0; e < empties; e++) tubes.push([]);
      if (solve(tubes, cap).path) return tubes;
    }
    // Rückfall (praktisch nie): sortierte Gläser leicht vermischen
    const tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(Array(cap).fill(c));
    for (let e = 0; e < empties; e++) tubes.push([]);
    return tubes;
  }

  return { topRun, isMono, canPour, pour, isSolved, solve, generate };
})();

if (typeof module !== "undefined") module.exports = SortSolver;
