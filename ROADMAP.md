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
- [x] Spatial-Grid für Zombie-Abstoßung/Nachbarsuche (löst das dort schon
      dokumentierte O(n²)-Problem in updateZombies()). Umgesetzt im Rahmen
      von Phase 2 (siehe dort) — bei aktuellem Zombie-Limit (24) kein
      messbarer FPS-Gewinn, Engpass liegt bei Schatten/Postprocessing.
- [ ] Schatten-Update-Frequenz drosseln (nicht jeden Frame neu berechnen).
- [ ] LOD: Animation-Update-Rate für weit entfernte Zombies reduzieren.
- [ ] Optional: rechenintensive KI-Entscheidungen (Pathfinding-Requests) in
      einen Web Worker auslagern, um den Main-Thread/FPS zu entlasten —
      das ist das JS-Äquivalent zu "Multi-Threading" in diesem Stack.

## Phase 6 — Content & Features (Ideensammlung, noch unpriorisiert)
Sammlung möglicher nächster Schritte nach Phase 1–5 — noch nicht in eine
konkrete Umsetzungsreihenfolge gebracht.

### Gameplay-Mechaniken
- [ ] Perks (Juggernog, Speed Cola, Double Tap): kaufbare permanente Buffs
      pro Runde, gehen bei Tod verloren — knüpft an bestehendes
      `applyPowerup`-System an.
- [ ] Wonder Weapon: einzigartige Spezialwaffe mit ungewöhnlichem Effekt
      (Kettenblitz, Gefrier-Strahl, Blackhole-Granate), kein Reskin.
- [ ] Easter Egg / Geheim-Quest: versteckte Rätselkette im Level (Symbole
      finden, Schalter in Reihenfolge aktivieren) mit Bonus-Freischaltung.
- [ ] Downed-State statt Instant-Game-Over: Spieler geht bei 0 HP zu Boden,
      kann sich selbst oder (Koop) durch andere wiederbeleben lassen.
- [ ] Power-Switch: Strom muss erst aktiviert werden, schaltet
      Perks/Mystery Box/Türen frei.
- [ ] Elite-/Special-Zombies: explodierender "Bloater", Schild-Zombie (nur
      von hinten verwundbar) — Runner-Typ existiert als Chance bereits in
      `data/zombies.json`.

### Content / Abwechslung
- [ ] Mehrere Karten/Maps: zweites Level mit eigenem Layout, Wallbuys,
      Atmosphäre.
- [ ] Gun-Game-Modus: automatischer Waffenwechsel nach jedem Kill, eigener
      Nebenmodus ohne neuen Content.
- [ ] Tägliche Challenges (z.B. "Runde 10 nur mit Messer") mit
      Bonus/Statistik-Eintrag.
- [ ] Lore-Fragmente: Audio-Logs/Zettel im Level via Trigger-Zone, wenig
      Aufwand, baut Atmosphäre auf.

### Meta / Progression
- [ ] Persistenter Fortschritt: freischaltbare Skins/Waffen-Camos über
      mehrere Runs (localStorage, analog zu bestehenden High-Scores).
- [ ] Statistik-/Leaderboard-Screen: Kills, Genauigkeit, beste Runde,
      Lieblingswaffe.
- [ ] Schwierigkeitsgrade: Multiplikatoren auf `data/zombies.json`
      (Health-Kurve, Speed) — dank Phase 1 ohne Code-Änderung umsetzbar.

### Atmosphäre / Polish
- [ ] Dynamisches Wetter/Tageszeit-Licht ergänzend zu den bestehenden
      Zonen-Lichtern (orange/blau/grün/rot), z.B. Gewitter-Blitze.
- [ ] Kill-Streak-Ansagen ("Rampage!", "Unstoppable!") — nutzt die bereits
      im Repo liegenden, aktuell ungenutzten `announcer_*.mp3`-Sounds.
- [ ] Bildschirm-Vignette/Screen-Shake bei Explosionen — kleiner Aufwand,
      spürbarer Game-Feel-Gewinn.
- [ ] Blut-Decals auf Wänden/Boden statt nur Partikel.

### Multiplayer / Social (größerer Umbau)
- [ ] Lokaler Koop (Split-Screen oder 2. Fenster via Electron) — Electron
      unterstützt mehrere Fenster/Renderer-Prozesse gut, naheliegender
      Einstieg vor Online-Koop.

## Phase 7 — Map-Auswahl, Lobby & Ordnerstruktur
Neue Map ("Black Ops 1 Grid"-inspiriert) als zweite wählbare Map, plus ein
Lobby-Bereich vor Rundenstart. Voraussetzung: Level-Loading muss dafür erst
generalisiert werden (aktuell fest im Code verdrahtet, nicht austauschbar).

- [x] Asset-Format der neuen Map prüfen: Datei liegt trotz ursprünglicher
      `.GLP`-Befürchtung bereits als `.glb` vor und ist ein vollständiges,
      gültiges glTF-2.0-Binary (Header-Länge stimmt mit Dateigröße überein,
      590 Meshes, per echtem `GLTFLoader` erfolgreich geladen) — keine
      Konvertierung nötig.
- [x] Level-Geometrie/Layout aus `js/main.js` in ein austauschbares
      "Map"-Datenformat extrahieren (analog zu Phase 1: `data/maps/*.json`
      für Spawn-Punkte, Wallbuy-Positionen, Zonen-Lichter + Verweis auf das
      Map-Modell), statt fest verdrahteter Level-Aufbau-Logik.
      (`data/maps/map1.json`, `model: null` da diese Map weiterhin
      prozedural aus Code gebaut wird — Wände/Boden/Texturen sind
      bewusst nicht mit-extrahiert, das wäre kein reines Refactoring
      mehr.)
- [ ] Zweite Map als auswählbare Option integrieren, ohne die bestehende
      Map zu verändern/kaputt zu machen.
- [ ] Lobby-Screen vor Rundenstart (neuer UI-Zustand vor `startRound(1)`):
      Map-Auswahl, Perk-Auswahl (Grundlage: Phase 6 Perks-Punkt), Start-
      Waffen-Auswahl.
- [ ] Ordnerstruktur logisch neu ordnen, z.B.:
      `assets/maps/<mapname>/{model.glb, ...}`,
      `data/maps/<mapname>.json`,
      `js/` ggf. in Module aufteilen (map-loading, lobby-ui getrennt von
      main.js) — nur falls es main.js wirklich übersichtlicher macht,
      kein Selbstzweck-Refactor.

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