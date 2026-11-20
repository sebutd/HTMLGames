// Farbpalette: ein Buchstabe je Farbe, "." ist ein leeres Feld.
const PALETTE = {
  R: "#e5484d", // Rot
  D: "#a51d2d", // Dunkelrot
  O: "#f5922a", // Orange
  Y: "#ffd84a", // Gelb
  G: "#46a758", // Grün
  B: "#3b82f6", // Blau
  C: "#7dd3fc", // Hellblau
  P: "#f472b6", // Rosa
  V: "#8e4ec6", // Violett
  W: "#f1f5f9", // Weiß
  K: "#2b2d42", // Dunkel
  N: "#8b5a2b", // Braun
  S: "#94a3b8"  // Grau
};

// Neues Bild hinzufügen: Eintrag ergänzen, alle Zeilen müssen gleich lang sein.
// lanes = Anzahl der Trupp-Reihen, bench = Plätze auf der Wartebank.
const LEVELS = [
  {
    name: "Herz", lanes: 2, bench: 5,
    rows: [
      "..RR...RR..",
      ".RPPR.RRRR.",
      "RPPRRRRRRRD",
      "RPRRRRRRRRD",
      "RRRRRRRRRDD",
      ".RRRRRRRDD.",
      "..RRRRRDD..",
      "...RRRDD...",
      "....RDD....",
      ".....D....."
    ]
  },
  {
    name: "Blume", lanes: 3, bench: 5,
    rows: [
      "...PP.PP...",
      "..PPPPPPP..",
      ".PPPYYYPPP.",
      ".PPYYYYYPP.",
      ".PPPYYYPPP.",
      "..PPPPPPP..",
      "...PP.PP...",
      ".....G.....",
      ".GG..G..GG.",
      "..GG.G.GG..",
      "...GGGGG...",
      ".....G....."
    ]
  },
  {
    name: "Pilz", lanes: 3, bench: 5,
    rows: [
      "....RRRR....",
      "..RRWWRRRR..",
      ".RRRWWRRWRR.",
      "RRRRRRRRWWRR",
      "RWWRRRRRRRRR",
      "RWWRRRRRRRRR",
      ".RRRRRRRRRR.",
      "...WWWWWW...",
      "...WKWWKW...",
      "...WWWWWW...",
      "....WWWW...."
    ]
  },
  {
    name: "Ente", lanes: 3, bench: 5,
    rows: [
      "....YYYY....",
      "...YYYYYY...",
      "...YYKYYYOO.",
      "...YYYYYYOOO",
      "....YYYY....",
      "Y..YYYYYY...",
      "YYYYYYYYYY..",
      "YYYYOOYYYY..",
      ".YYYYYYYYY..",
      "BBCBBBBCBBBB",
      "CBBBBCBBBBCB"
    ]
  },
  {
    name: "Haus", lanes: 3, bench: 4,
    rows: [
      ".....RR.....",
      "....RRRR.NN.",
      "...RRRRRRNN.",
      "..RRRRRRRRN.",
      ".RRRRRRRRRR.",
      "RRRRRRRRRRRR",
      ".WWWWWWWWWW.",
      ".WCCWWWNNNW.",
      ".WCCWWWNNNW.",
      ".WWWWWWNNYW.",
      ".WWWWWWNNNW.",
      "GGGGGGGGGGGG"
    ]
  },
  {
    name: "Rakete", lanes: 4, bench: 4,
    rows: [
      ".....R.....",
      "....RRR....",
      "...RRRRR...",
      "...WWWWW...",
      "..WWCCCWW..",
      "..WWCKCWW..",
      "..WWCCCWW..",
      "..WWWWWWW..",
      ".RWWWWWWWR.",
      "RRWWWWWWWRR",
      "RR.SSSSS.RR",
      "....OYO....",
      "...OYYYO...",
      "....OYO...."
    ]
  },
  {
    name: "Regenbogen", lanes: 4, bench: 4,
    rows: [
      "...RRRRRRRR...",
      ".RROOOOOOOORR.",
      "RROOYYYYYYOORR",
      "ROOYYGGGGYYOOR",
      "ROYGGBBBBGGYOR",
      "ROYGB....BGYOR",
      "ROYGB....BGYOR",
      "WWWWW....WWWWW",
      "WWWWWW..WWWWWW"
    ]
  },
  {
    name: "Katze", lanes: 4, bench: 3,
    rows: [
      ".OO.......OO.",
      "OOOO.....OOOO",
      "OPOOOOOOOOOPO",
      "OOOOOOOOOOOOO",
      "OOOOOOOOOOOOO",
      "OOGKOOOOOGKOO",
      "OOGKOOOOOGKOO",
      "OOOOOOPOOOOOO",
      "WWOOOKOKOOOWW",
      ".WWWOOOOOWWW.",
      "..OOOOOOOOO..",
      "....OOOOO...."
    ]
  }
];
