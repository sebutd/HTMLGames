/* Solitär-Sammlung – Regeln der Varianten und Klondike-Löser (ohne DOM).
   Karte: { id, s (0 ♠, 1 ♥, 2 ♦, 3 ♣), r (1 = Ass … 13 = König), up }. */
const Solitaire = (() => {
  "use strict";

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"];
  const isRed = (c) => c.s === 1 || c.s === 2;
  const top = (p) => p.cards[p.cards.length - 1];

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function deck(suits, copies) {
    const cards = [];
    let id = 0;
    for (let k = 0; k < copies; k++)
      for (const s of suits)
        for (let r = 1; r <= 13; r++) cards.push({ id: id++, s, r, up: false });
    return cards;
  }

  const piles = (kinds) => kinds.map((kind) => ({ kind, cards: [] }));
  const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);

  // ---------- gemeinsame Hilfen ----------

  function altRun(cards, i) {          // abwechselnd rot/schwarz, absteigend
    for (let k = i; k < cards.length - 1; k++) {
      const a = cards[k], b = cards[k + 1];
      if (!a.up || !b.up || isRed(a) === isRed(b) || a.r !== b.r + 1) return false;
    }
    return cards[i].up;
  }

  function suitRun(cards, i) {         // gleiche Farbe (Symbol), absteigend
    for (let k = i; k < cards.length - 1; k++) {
      const a = cards[k], b = cards[k + 1];
      if (!a.up || !b.up || a.s !== b.s || a.r !== b.r + 1) return false;
    }
    return cards[i].up;
  }

  function fitsFoundation(c, p) {
    const t = top(p);
    return t ? t.s === c.s && t.r === c.r - 1 : c.r === 1;
  }

  function flipTops(state) {
    let flipped = false;
    for (const i of state.v.tab) {
      const t = top(state.piles[i]);
      if (t && !t.up) { t.up = true; flipped = true; }
    }
    return flipped;
  }

  // Sicher auf die Ablage: niemand braucht die Karte mehr zum Anlegen.
  function safeToFoundation(state, c) {
    if (!state.v.found.some((f) => fitsFoundation(c, state.piles[f]))) return false;
    if (c.r <= 2) return true;
    const level = (s) => {
      const f = state.v.found.find((i) => top(state.piles[i]) && top(state.piles[i]).s === s);
      return f === undefined ? 0 : state.piles[f].cards.length;
    };
    return [0, 1, 2, 3].filter((s) => (s === 1 || s === 2) !== isRed(c)).every((s) => level(s) >= c.r - 1);
  }

  function foundationFor(state, c) {
    // Erst eine passende Reihe derselben Farbe, sonst eine leere
    let empty = -1;
    for (const f of state.v.found) {
      const t = top(state.piles[f]);
      if (t && fitsFoundation(c, state.piles[f])) return f;
      if (!t && empty < 0) empty = f;
    }
    return c.r === 1 ? empty : -1;
  }

  // ---------- Klondike ----------

  const klondike = {
    name: "Klondike",
    cols: 7,
    layout: { stock: 0, waste: 1, found: range(2, 4), cells: [], tab: range(6, 7) },
    deal(opt, rng) {
      const d = shuffle(deck([0, 1, 2, 3], 1), rng);
      const p = piles(["stock", "waste", "found", "found", "found", "found", ...Array(7).fill("tab")]);
      for (let i = 0; i < 7; i++)
        for (let j = 0; j <= i; j++) { const c = d.pop(); c.up = j === i; p[6 + i].cards.push(c); }
      p[0].cards = d;
      return p;
    },
    canDrag(state, pi, i) {
      const p = state.piles[pi];
      if (p.kind === "tab") return altRun(p.cards, i);
      if (p.kind === "waste" || p.kind === "found") return i === p.cards.length - 1;
      return false;
    },
    canDrop(state, from, i, to) {
      const cards = state.piles[from].cards.slice(i), c = cards[0], dest = state.piles[to];
      if (dest.kind === "found") return cards.length === 1 && fitsFoundation(c, dest);
      if (dest.kind !== "tab") return false;
      const t = top(dest);
      return t ? t.up && isRed(t) !== isRed(c) && t.r === c.r + 1 : c.r === 13;
    },
    stock(state) {
      const s = state.piles[0], w = state.piles[1];
      if (s.cards.length) {
        const n = Math.min(state.opt, s.cards.length);
        for (let k = 0; k < n; k++) { const c = s.cards.pop(); c.up = true; w.cards.push(c); }
        return true;
      }
      if (!w.cards.length) return false;
      while (w.cards.length) { const c = w.cards.pop(); c.up = false; s.cards.push(c); }
      return true;
    },
    after(state) { flipTops(state); return []; },
    won: (state) => state.v.found.every((f) => state.piles[f].cards.length === 13),
    // Alles aufgedeckt und Stapel leer → automatisch beenden
    canAutoFinish: (state) => !state.piles[0].cards.length && !state.piles[1].cards.length &&
      state.v.tab.every((t) => state.piles[t].cards.every((c) => c.up))
  };

  // ---------- FreeCell ----------

  function freecellMax(state, toEmpty) {
    const cells = state.v.cells.filter((i) => !state.piles[i].cards.length).length;
    const empty = state.v.tab.filter((i) => !state.piles[i].cards.length).length - (toEmpty ? 1 : 0);
    return (cells + 1) * 2 ** Math.max(0, empty);
  }

  const freecell = {
    name: "FreeCell",
    cols: 8,
    layout: { stock: -1, waste: -1, found: range(4, 4), cells: range(0, 4), tab: range(8, 8) },
    deal(opt, rng) {
      const d = shuffle(deck([0, 1, 2, 3], 1), rng);
      const p = piles(["cell", "cell", "cell", "cell", "found", "found", "found", "found", ...Array(8).fill("tab")]);
      d.forEach((c, k) => { c.up = true; p[8 + (k % 8)].cards.push(c); });
      return p;
    },
    canDrag(state, pi, i) {
      const p = state.piles[pi];
      if (p.kind === "tab") return altRun(p.cards, i) && p.cards.length - i <= freecellMax(state, false);
      if (p.kind === "cell" || p.kind === "found") return i === p.cards.length - 1;
      return false;
    },
    canDrop(state, from, i, to) {
      const cards = state.piles[from].cards.slice(i), c = cards[0], dest = state.piles[to];
      if (dest.kind === "found") return cards.length === 1 && fitsFoundation(c, dest);
      if (dest.kind === "cell") return cards.length === 1 && !dest.cards.length;
      if (dest.kind !== "tab") return false;
      const t = top(dest);
      if (!t) return cards.length <= freecellMax(state, true);
      return isRed(t) !== isRed(c) && t.r === c.r + 1 && cards.length <= freecellMax(state, false);
    },
    stock: () => false,
    after() { return []; },
    won: (state) => state.v.found.every((f) => state.piles[f].cards.length === 13),
    canAutoFinish: () => false
  };

  // ---------- Spider ----------

  const SPIDER_SUITS = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };

  const spider = {
    name: "Spider",
    cols: 10,
    layout: { stock: 0, waste: -1, found: range(1, 8), cells: [], tab: range(9, 10) },
    deal(opt, rng) {
      const suits = SPIDER_SUITS[opt] || [0];
      const d = shuffle(deck(suits, 8 / suits.length), rng);
      const p = piles(["stock", ...Array(8).fill("found"), ...Array(10).fill("tab")]);
      for (let k = 0; k < 54; k++) p[9 + (k % 10)].cards.push(d.pop());
      for (let t = 9; t < 19; t++) top(p[t]).up = true;
      p[0].cards = d;
      return p;
    },
    canDrag(state, pi, i) {
      const p = state.piles[pi];
      return p.kind === "tab" && suitRun(p.cards, i);
    },
    canDrop(state, from, i, to) {
      const c = state.piles[from].cards[i], dest = state.piles[to];
      if (dest.kind !== "tab") return false;
      const t = top(dest);
      return !t || t.r === c.r + 1;
    },
    stock(state) {
      const s = state.piles[0];
      if (!s.cards.length) return false;
      if (state.v.tab.some((t) => !state.piles[t].cards.length)) return "blocked";
      for (const t of state.v.tab) { const c = s.cards.pop(); c.up = true; state.piles[t].cards.push(c); }
      return true;
    },
    // Vollständige Folgen K…A einer Farbe abräumen
    after(state) {
      const moved = [];
      let again = true;
      while (again) {
        again = false;
        for (const t of state.v.tab) {
          const cards = state.piles[t].cards;
          if (cards.length < 13) continue;
          const i = cards.length - 13;
          if (cards[i].r === 13 && suitRun(cards, i)) {
            const f = state.v.found.find((k) => !state.piles[k].cards.length);
            state.piles[f].cards = cards.splice(i, 13);
            moved.push({ from: t, to: f });
            again = true;
          }
        }
        if (flipTops(state)) again = true;
      }
      return moved;
    },
    won: (state) => state.v.found.every((f) => state.piles[f].cards.length === 13),
    canAutoFinish: () => false
  };

  const VARIANTS = { klondike, spider, freecell };

  function newState(variant, opt, rng = Math.random) {
    const rules = VARIANTS[variant];
    return { variant, opt, v: rules.layout, piles: rules.deal(opt, rng) };
  }

  // ---------- Klondike-Löser ----------
  // Karten als Zahl: s*13 + (r-1). Der Löser kennt die verdeckten Karten –
  // er prüft nur, ob ein Spiel überhaupt gewinnbar ist.

  const kRank = (c) => (c % 13) + 1;
  const kSuit = (c) => (c / 13) | 0;
  const kRed = (c) => { const s = kSuit(c); return s === 1 || s === 2; };

  function talonAccess(n, p, draw) {
    if (!n) return [];
    if (draw === 1) return range(0, n);
    const set = new Set();
    if (p > 0) set.add(p - 1);
    for (let q = p + draw; ; q += draw) { if (q >= n) { set.add(n - 1); break; } set.add(q - 1); }
    for (let q = draw; ; q += draw) { if (q >= n) { set.add(n - 1); break; } set.add(q - 1); }
    return [...set].sort((a, b) => a - b);
  }

  function solveKlondike(state, draw, limit = 40000) {
    const num = (c) => c.s * 13 + c.r - 1;
    const start = {
      tabs: state.v.tab.map((i) => {
        const cs = state.piles[i].cards;
        return { d: cs.filter((c) => !c.up).map(num), u: cs.filter((c) => c.up).map(num) };
      }),
      T: state.piles[1].cards.map(num).concat(state.piles[0].cards.slice().reverse().map(num)),
      p: state.piles[1].cards.length,
      f: state.v.found.map(() => 0)
    };
    // Ablagen stehen hier nach Farbe: f[s] = höchster Rang
    for (const fi of state.v.found) {
      const cs = state.piles[fi].cards;
      if (cs.length) start.f[cs[0].s] = cs.length;
    }

    const fits = (c, t) => t.u.length
      ? kRed(t.u[t.u.length - 1]) !== kRed(c) && kRank(t.u[t.u.length - 1]) === kRank(c) + 1
      : !t.d.length && kRank(c) === 13;
    const fitsF = (c, f) => f[kSuit(c)] === kRank(c) - 1;
    const fix = (t) => { if (!t.u.length && t.d.length) { t.d = t.d.slice(); t.u = [t.d.pop()]; } };
    const copyTabs = (tabs, ...idx) => tabs.map((t, k) => (idx.includes(k) ? { d: t.d, u: t.u.slice() } : t));

    function autoSafe(s) {
      let moved = true;
      while (moved) {
        moved = false;
        for (let k = 0; k < s.tabs.length; k++) {
          const t = s.tabs[k];
          if (!t.u.length) continue;
          const c = t.u[t.u.length - 1], r = kRank(c);
          if (!fitsF(c, s.f)) continue;
          const red = kRed(c);
          const ok = r <= 2 || [0, 1, 2, 3].every((x) => ((x === 1 || x === 2) === red) || s.f[x] >= r - 1);
          if (!ok) continue;
          s.tabs = copyTabs(s.tabs, k);
          s.tabs[k].u.pop();
          fix(s.tabs[k]);
          s.f = s.f.slice(); s.f[kSuit(c)]++;
          moved = true;
        }
      }
    }

    const seen = new Set();
    let nodes = 0, aborted = false;

    function key(s) {
      return s.f.join("") + "|" + s.T.join(",") + "|" + (draw === 1 ? "" : s.p) + "|" +
        s.tabs.map((t) => t.d.join(",") + ":" + t.u.join(",")).sort().join(";");
    }

    function moves(s) {
      const out = [];
      const push = (pri, ns) => out.push([pri, ns]);
      // Tableau → Ablage
      s.tabs.forEach((t, k) => {
        if (!t.u.length) return;
        const c = t.u[t.u.length - 1];
        if (!fitsF(c, s.f)) return;
        const tabs = copyTabs(s.tabs, k); tabs[k].u.pop(); fix(tabs[k]);
        const f = s.f.slice(); f[kSuit(c)]++;
        push(t.u.length === 1 && t.d.length ? 9 : 6, { tabs, T: s.T, p: s.p, f });
      });
      // Tableau → Tableau
      s.tabs.forEach((t, k) => {
        for (let j = 0; j < t.u.length; j++) {
          const c = t.u[j];
          const reveals = j === 0 && t.d.length > 0;
          const empties = j === 0 && !t.d.length;
          let freesF = false;
          if (j > 0) freesF = fitsF(t.u[j - 1], s.f);
          if (!reveals && !freesF && !empties) continue;
          if (empties && kRank(c) === 13) continue;
          for (let m = 0; m < s.tabs.length; m++) {
            if (m === k || !fits(c, s.tabs[m])) continue;
            if (!s.tabs[m].u.length && !s.tabs[m].d.length && empties) continue;
            const tabs = copyTabs(s.tabs, k, m);
            tabs[m].u.push(...tabs[k].u.splice(j));
            fix(tabs[k]);
            push(reveals ? 8 + t.d.length / 10 : freesF ? 5 : 1, { tabs, T: s.T, p: s.p, f: s.f });
            if (!s.tabs[m].u.length) break; // ein leeres Ziel genügt
          }
        }
      });
      // Talon → Ablage / Tableau
      for (const i of talonAccess(s.T.length, s.p, draw)) {
        const c = s.T[i];
        const T = s.T.slice(0, i).concat(s.T.slice(i + 1));
        if (fitsF(c, s.f)) {
          const f = s.f.slice(); f[kSuit(c)]++;
          push(7, { tabs: s.tabs, T, p: i, f });
        }
        for (let m = 0; m < s.tabs.length; m++) {
          if (!fits(c, s.tabs[m])) continue;
          const tabs = copyTabs(s.tabs, m);
          tabs[m].u.push(c);
          push(4, { tabs, T, p: i, f: s.f });
          if (!s.tabs[m].u.length) break;
        }
      }
      out.sort((a, b) => b[0] - a[0]);
      return out.map((x) => x[1]);
    }

    function dfs(s) {
      autoSafe(s);
      if (s.f.every((x) => x === 13)) return true;
      if (++nodes > limit) { aborted = true; return false; }
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      for (const ns of moves(s)) {
        if (dfs(ns)) return true;
        if (aborted) return false;
      }
      return false;
    }

    const ok = dfs(start);
    return { solved: ok, nodes, aborted };
  }

  // Klondike: so lange mischen, bis der Löser einen Weg findet.
  function winnableKlondike(draw, rng = Math.random, budgetMs = 1500) {
    const t0 = Date.now();
    let last;
    for (let tries = 0; tries < 60; tries++) {
      last = newState("klondike", draw, rng);
      if (solveKlondike(last, draw).solved) return { state: last, verified: true };
      if (Date.now() - t0 > budgetMs) break;
    }
    return { state: last, verified: false };
  }

  return {
    SUITS, RANKS, VARIANTS, isRed, top, newState, foundationFor, safeToFoundation,
    altRun, suitRun, freecellMax, solveKlondike, winnableKlondike, talonAccess
  };
})();

if (typeof module !== "undefined") module.exports = Solitaire;
