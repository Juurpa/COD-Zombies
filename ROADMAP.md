# ROADMAP: Project Undead — Architektur-Ausbau

Referenz-Masterplan für den schrittweisen Ausbau von COD-Zombies in Richtung
"CoD-Feeling". Ziel: JEDE Phase einzeln implementieren, testen, committen —
nicht alles auf einmal. Stack-Realität: Three.js + Electron (Single-Thread-JS,
kein natives Multithreading, kein natives NavMesh/RVO2).

## Phase 1 — Datengesteuertes Design (Fundament, zuerst umsetzen)
- [x] Waffen-Stats (dmg, rate, mag, reserve, spread, reload, cost) aus
      js/main.js in eine `data/weapons.json` auslagern, zur Laufzeit laden.
- [x] Zombie-Stats (speed, health, damage pro Runde) analog nach
      `data/zombies.json`.
- [ ] Boss-Parameter (siehe Phase 4) nach `data/boss.json`.
- [x] Lade-Funktion mit Fallback auf Defaults, falls Datei fehlt/kaputt ist.
- Ziel: Balancing-Änderungen ohne main.js-Edits möglich.

## Phase 2 — Zombie-KI: FSM + Steering (kein volles ECS)
- Kein Rewrite auf ECS — zu invasiv für die aktuelle main.js-Größe (~4200
  Zeilen). Stattdessen: bestehenden Zombie-Objekten eine explizite FSM geben.
- [x] Zustände: `idle`, `wander`, `alert`, `chase`, `attack` als String-Feld
      pro Zombie, Übergänge in einer zentralen `updateZombieFSM(z, dt)`.
      (Reines Refactoring: `idle`/`wander`/`alert` sind als Vokabular
      angelegt, aber mangels Wahrnehmungslogik noch nicht erreichbar —
      Zombies verfolgen weiterhin sofort nach dem Aufstehen.)
- [x] Einfaches Steering (Separation) statt RVO2: pro Zombie nur Nachbarn
      innerhalb eines Grids/Radius prüfen (Spatial-Grid, siehe Performance-
      Punkt aus CHANGELOG.md "Known follow-ups") statt O(n²) über alle.
      (Bei aktuell max. 24 Zombies kein messbarer FPS-Gewinn — Engpass
      ist GPU-seitig, siehe Phase 5 — aber korrekte, skalierbare Basis.)
- [ ] Pathfinding: `three-pathfinding` (npm-Paket, nutzt vorgebackenes
      NavMesh aus dem Level) statt eigenem A*, falls Hindernisumgehung nötig
      wird — aktuell reicht ggf. weiterhin direkte Steuerung + Kollision.
- [ ] Animation-Blending: Übergangszeiten zwischen walk/run/attack in THREE
      AnimationMixer saubern (crossFadeTo), Root-Motion nur falls die GLB-
      Animationen das hergeben — sonst wie bisher Positions-Update per Code.

## Phase 3 — Gunplay / Game Feel
- [ ] Recoil-Pattern pro Waffe: feste Sequenz von Kamera-Offsets in
      `data/weapons.json` (`recoilPattern: [[x,y], ...]`), mit leichtem
      Zufalls-Jitter addiert, statt rein zufälligem Rückstoß.
- [ ] Hitmarker: kurzes UI-Overlay-Kreuz bei bestätigtem Treffer (CSS/HUD,
      kein 3D nötig), inkl. eigenem Sound (`assets/sounds/` vorhanden?).
- [ ] ADS: beim Zielen `camera.fov` per Tween (nicht Sprung) interpolieren,
      z.B. mit einfacher Lerp-Funktion in der tick()-Loop.
- [ ] Pack-a-Punch: Funktion, die auf ein Waffenobjekt Modifikatoren aus
      `data/weapons.json` (`packAPunch: {dmgMult, magMult, rateMult}`)
      anwendet und eine neue "upgraded" Waffeninstanz erzeugt.

## Phase 4 — Boss "The Titan"
- [ ] Eigener Zustand-Automat getrennt von normaler Zombie-FSM:
      `charge` (Nahkampf) → `ranged`/`summon` (Verstärkung rufen) →
      `enraged` (Speed/Resistenz-Buff) bei niedriger Health.
- [ ] Schwachstellen-Hitbox: zusätzliche Hitbox-Mesh (z.B. Rücken/Kern) mit
      eigenem Damage-Multiplikator, analog zum bestehenden Headshot-System
      in `hitboxGroup`.
- [ ] Boss-Parameter aus `data/boss.json` (Phase-Schwellen in % Health,
      Angriffscooldowns, Spawn-Rate für Verstärkung).

## Phase 5 — Performance (verweist auf CHANGELOG.md)
- [ ] Spatial-Grid für Zombie-Abstoßung/Nachbarsuche (löst das dort schon
      dokumentierte O(n²)-Problem in updateZombies()).
- [ ] Schatten-Update-Frequenz drosseln (nicht jeden Frame neu berechnen).
- [ ] LOD: Animation-Update-Rate für weit entfernte Zombies reduzieren.
- [ ] Optional: rechenintensive KI-Entscheidungen (Pathfinding-Requests) in
      einen Web Worker auslagern, um den Main-Thread/FPS zu entlasten —
      das ist das JS-Äquivalent zu "Multi-Threading" in diesem Stack.

## Nicht übernommen / bewusst gestrichen
- **Echtes ECS-Rewrite**: zu hoher Umbau-Aufwand/Risiko für den aktuellen
  Codestand, kein klarer Spielspaß-Gewinn im Verhältnis zum Aufwand.
- **RVO2-Bibliothek**: native C++-Lib, keine sinnvolle Browser-Integration.
  Ersatz: einfaches Separation-Steering (siehe Phase 2).
- **Natives Multi-Threading**: JS im Browser/Renderer-Prozess ist
  single-threaded; Web Workers sind der einzig sinnvolle Ersatz und lohnen
  sich erst, wenn Phase 5 nicht ausreicht.
- **Asset-Streaming**: bei der aktuellen Assetgröße (GLBs, kurze MP3s) noch
  kein Engpass — erst angehen, wenn Ladezeiten/RAM real zum Problem werden.

## Arbeitsweise
Jede Checkbox = ein eigener, kleiner Commit mit Test im echten Spiel
(`npm start`), nicht alles auf einmal umsetzen. Nach jeder Phase kurze
Zusammenfassung in CHANGELOG.md ergänzen.