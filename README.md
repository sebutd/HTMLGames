# HTMLGames

Sammlung kleiner Browser-Spiele (HTML, CSS, JavaScript).

Einstieg: `index.html` im Browser öffnen.

## Spiele

| Spiel | Ordner |
|-------|--------|
| Bonbon-Tausch (Match-3) | `Match3Game/` |
| Mahjong (Solitaire) | `MahjongGame/` |
| Mahjong 3D Tower | `Mahjong3DGame/` |

## Neues Spiel hinzufügen

1. Eigenen Ordner mit `index.html` anlegen.
2. In der Liste `games` in der `index.html` im Root einen Eintrag ergänzen.

## Bonbon-Tausch – Spezial-Bonbons

| Ab Level | Spezial-Bonbon | Entsteht durch | Wirkung |
|----------|----------------|----------------|---------|
| 2 | Streifen | 4 in einer Reihe | räumt Zeile bzw. Spalte ab |
| 3 | Bombe | L- oder T-Form aus 5 | sprengt 3×3 Felder |
| 4 | Regenbogen-Kugel | 5 in einer Reihe | tauschen: entfernt alle Bonbons einer Farbe |

Zwei Spezial-Bonbons miteinander getauscht ergeben eine verstärkte Kombination.

## Mahjong – Regeln

- 144 Steine in der klassischen „Schildkröten“-Anordnung; jedes Spiel ist garantiert lösbar.
- Ein Stein ist **frei**, wenn kein Stein auf ihm liegt und links oder rechts kein Nachbar ist.
- Zwei freie, gleiche Steine anklicken, um sie zu entfernen. Blumen passen zu jeder Blume, Jahreszeiten zu jeder Jahreszeit.
- Hilfen: Tipp (Taste `H`), Zurück (`Strg+Z`), Mischen und „Freie zeigen“.

## Mahjong 3D Tower – Regeln

- 128 Würfel, gestapelt zu einem Turm (Schichten 7×7, 5×5, 5×5, 3×3, 3×3, 3×3, 1, 1); jedes Spiel ist garantiert lösbar.
- Jeder Würfel zeigt auf allen Seiten dasselbe Motiv.
- Ein Würfel ist **frei**, wenn nichts auf ihm liegt und mindestens zwei seiner vier Seiten (links, rechts, vorne, hinten) offen sind.
- Turm drehen: mit Maus/Finger ziehen, Pfeiltasten oder die Knöpfe ⟲ ⟳. Der Tipp dreht den Turm zum vorgeschlagenen Paar.
- Hilfen wie beim klassischen Mahjong: Tipp (`H`), Zurück (`Strg+Z`), Mischen und „Freie zeigen“.
