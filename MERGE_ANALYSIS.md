# Merge-Analyse: "Game Test" vs. Hauptprojekt

Analyse-Datum: 2026-07-08. Reine Bestandsaufnahme, keine Änderungen an
Code oder an `Game Test/` — siehe Vorschläge ganz unten für mögliche
nächste Schritte (nicht umgesetzt).

## 0. Wichtigster Befund zuerst

`Game Test` ist **kein unabhängiges Projekt mit anderem Tech-Stack**,
sondern ein **eigenes Git-Repository desselben Spiels**, das mit unserem
Hauptprojekt einen gemeinsamen Ursprung teilt:

```
Game Test/.git remotes:
  origin  -> https://github.com/Elehan-22/COD-Zombies.git
  friend  -> https://github.com/Juurpa/COD-Zombies.git   (= unser Hauptprojekt)
```

Die Commit-Historie von `Game Test` enthält mehrfache
`Merge remote-tracking branch 'friend/main'`-Commits und zieht damit
tatsächlich Commits aus unserem Hauptprojekt herein — bis einschließlich
unseres Sound-Fix-Commits (`Fix weapon sound key mismatch, remove
duplicate sound assets`) und der darauffolgenden Aufräum-Commits
(`Remove leftover renderer_error.txt...`, `Add sound generation script...`).
**Ab genau diesem Punkt trennen sich die Wege**: unser Hauptprojekt ist
seither mit ROADMAP.md Phase 1 (datengesteuerte Config), Phase 2
(Zombie-FSM + Spatial-Grid + sanfte Bewegung) und Phase 7 Schritte 1-3
(Map-Auswahl/map2) weitergegangen — nichts davon existiert in `Game
Test`. Umgekehrt hat der Kollege in `Game Test` zwei eigene Commits
gemacht, die *nicht* im Hauptprojekt existieren (Details unten), plus
aktuell eine kleine uncommittete Änderung.

**Das bedeutet für einen Merge**: Es geht nicht um "zwei komplett
verschiedene Implementierungen desselben Features vergleichen", sondern
um "zwei divergierende Branches derselben Codebasis" — ein klassisches
Cherry-Pick-/Merge-Szenario, kein Rewrite.

## 1. Tech-Stack (identisch)

| | Hauptprojekt | Game Test |
|---|---|---|
| Engine | Three.js (vendored in `vendor/three/`) | identisch, vendored |
| Runtime | Electron ^28.0.0 + electron-builder ^24.9.1 | identisch |
| Sprache | Deutsch (UI/Kommentare) | identisch |
| Architektur | Ein monolithisches `js/main.js` | identisch (4462 vs. 4205 Zeilen) |
| Datenformat | ES-Module, kein Bundler, Import-Map in `index.html` | identisch |
| Electron-Fenster-Config | `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false` | identisch (`Game Test/app.js`) |

Kein anderer Engine/Stack (kein Unity/Godot/Phaser/React) — beide sind
exakt derselbe technische Ansatz.

## 2. Gemeinsamkeiten (in beiden Versionen vorhanden)

Da beide vom selben Ursprung abstammen, ist praktisch das komplette
Grundgerüst identisch bzw. nahezu identisch, u.a.:

- **Waffen-System**: `WEAPON_DEFS` in `Game Test/js/main.js:1008` ist
  **byte-identisch** zu unserem alten (Vor-Phase-1) `WEAPON_DEFS` — 7
  Waffen (pistol/smg/shotgun/rifle/magnum/mg42/raygun), gleiche
  Werte für dmg/rate/mag/reserve/spread/reload/cost.
- **Perk-System**: `PERKS` in `Game Test/js/main.js:1026` ebenfalls
  byte-identisch zu unserem alten Stand (Juggernog/Speed-Cola/
  Doppel-Hieb/Stamin-Up).
- **Sound-Engine**: `play2D`/`play3D`/`WEAPON_SOUND_FILES`-Mapping
  (unser Fix von vorher) ist vorhanden — inkl. `sound_requirements.md`
  und `generate_zombie_sounds.py` in `assets/sounds/`.
- **Runden-/Spawn-Logik**: `spawnZombie()`, `startRound()`,
  `updateSpawning()`, Zonen-System (`zoneAt`, `doorCenters`) — gleiche
  Grundlogik, im Hauptprojekt inzwischen aber in `updateZombieFSM()`
  gebündelt (Phase 2), in `Game Test` noch inline in `updateZombies()`.
- **Waffen-Wandkauf, Mystery Box, Granaten, Messer, Powerups, Perks-
  Automaten** — alle als Feature vorhanden, praktisch identischer Code.
- **HUD/Menüs/Pause/Gameover** — `index.html` fast identisch (361 vs.
  378 Zeilen, Differenz = neue Settings-UI, siehe unten).
- **CREDITS/README-Historie** — beide haben dieselbe README-Merge-
  Konflikt-Geschichte durchlaufen (aus der gemeinsamen Historie).

## 3. Unterschiede / Konflikte

### 3.1 Fehlende Architektur-Verbesserungen in `Game Test` (unser Fortschritt)
`Game Test` hat **keine** der folgenden, im Hauptprojekt bereits
umgesetzten Änderungen:
- Kein `data/weapons.json`, `data/zombies.json`, `data/maps/*.json` —
  alle Werte sind weiterhin hart in `js/main.js` codiert (kein
  `loadGameData`/`applyDataOverrides`, kein einziger Treffer für
  `data/` im gesamten `js/main.js`).
- Kein `updateZombieFSM()`, kein `z.aiState`, kein Spatial-Grid
  (`buildZombieGrid`) — die Zombie-Abstoßung läuft dort noch mit dem
  alten O(n²)-Check.
- Kein `z.moveDir`/`ZOMBIE_TURN_RATE` (sanftes Zombie-Movement).
- Keine zweite Map / kein `ACTIVE_MAP`/`MAP_BUILTIN_DEFAULTS` — nur die
  eine prozedurale Bunker-Map.

### 3.2 Eigene Verbesserungen in `Game Test` (nicht im Hauptprojekt)

**Commit `36b3242` — "Perfomance-Settings, universeller Reload-Sound,
schlankeres Lade-System"** (Autor: Elehan-22):
- **Granulare Grafik-Einstellungen**: `SETTINGS` bekommt eigene Felder
  `bloom`, `shadows`, `casings`, `maxDecals` statt alles starr aus der
  `quality`-Stufe abzuleiten (Hauptprojekt: `js/main.js:4276/4281/4305`
  — `bloomOn = q === 'hoch'` etc., fest verdrahtet). In `Game Test` gibt
  es dafür 4 neue Checkboxen/Slider im Einstellungs-Menü
  (`index.html`: `#set-bloom`, `#set-shadows`, `#set-casings`,
  `#set-decals`), die der Nutzer unabhängig von der Quality-Stufe
  umschalten kann. **Echtes UX-Plus.**
- **Zombie-Animation-Speed-Fix**: `ANIM_BASE_SPEED` geändert von
  `{walk:1.1, run:3.8, crawl:0.8, crawlrun:1.6}` (Hauptprojekt,
  `js/main.js:2267`) auf `{walk:0.8, run:2.8, crawl:0.6, crawlrun:1.2}`,
  explizit kommentiert als Fix für "Schweben/Sliden" (die Beinanimation
  lief schneller als die tatsächliche Bewegung → Zombies sahen aus, als
  würden sie über den Boden gleiten). **Das ist ein echter, plausibler
  Bugfix, den wir nicht haben.**
- Passend dazu leicht reduzierte Zombie-Geschwindigkeiten (z.B. Runner
  3.15–3.85 → 2.8–3.4, normal-Cap 2.3 → 2.1) — Pacing-Änderung, nicht nur
  Bugfix.
- **Vereinfachte Angriffs-Animationen**: nur noch `'attack'` statt
  zufällig zwischen `attack`/`bite`/`neckbite` zu wählen — Kommentar:
  "um wilde Verrenkungen zu vermeiden". Klingt nach einem Fix für
  ein Animation-Blending-Problem (das im Hauptprojekt als offener
  ROADMAP-Punkt unter Phase 2 "Animation-Blending" noch aussteht).
- `headTilt` auf 0 gesetzt (vorher zufällig ±0.35) — reduziert den
  "creepy" schiefen Kopf, ebenfalls zur Vermeidung von "Verrenkungen".
- **Universeller Reload-Sound**: neue Datei
  `assets/sounds/reload_universal.mp3`, `playReload()` spielt diesen
  einen Sound für alle Waffen statt der Pro-Waffen-Zuordnung über
  `WEAPON_SOUND_FILES` (Hauptprojekt `js/main.js:1784`,
  `sfx.reload` bei `js/main.js:1870`). **Tradeoff**: weniger Code/
  Assets zu pflegen, aber Verlust der Waffen-spezifischen Reload-Sounds
  (z.B. der Shotgun-Pump-Sound entfällt als Spezialfall).
- **Schlankeres Lade-System**: `animList` von 19 auf 9 Animationen
  reduziert (entfernt: `idle, bite, neckbite, standup, hit, stumble,
  turn, kick, punch, headbutt`). Passend dazu excludet `package.json`
  diese 10 `.glb`-Dateien explizit aus dem electron-builder-Build
  (`!assets/zombie/idle.glb` etc.), obwohl sie im Repo/auf der Platte
  bleiben. **Schnelleres Laden und kleinere .exe**, aber Verlust von
  Animationsvielfalt (kein Idle-Pose, keine Biss-Variation, keine
  Stolper-/Dreh-Animationen).
- **Ground-Fog-System komplett entfernt** (`groundFogTex`/
  `groundFogGroup`/45 Sprites, Hauptprojekt `js/main.js:1533-1546`) und
  **`scene.fog` komplett entfernt** (beide Zuweisungen, Hauptprojekt
  `js/main.js:115` und `:1529`) — kein Nebel mehr in der Szene.
  Vermutlich Performance-Optimierung (45 Sprite-Updates/Frame gespart),
  aber deutlicher Atmosphäre-Verlust, und weitere Sicht bei Kämpfen.

**Commit `eb91225` — "Zombies frustumCulling fix for 90 FPS"**
(Autor: Elehan-22) — **der wertvollste Einzelfund dieser Analyse**:
- Hauptprojekt (`js/main.js:2186`): `c.frustumCulled = false;` für
  jedes Zombie-Mesh, mit Kommentar "Skinned Mesh: Bounding-Box stimmt
  bei Animation nicht" — d.h. **jeder Zombie wird jeden Frame gerendert,
  auch außerhalb des Sichtfelds**, weil die Standard-Bounding-Box bei
  Skelett-Animation nicht mitwächst und man deshalb Culling komplett
  ausgeschaltet hat (sonst verschwinden animierte Zombies fälschlich).
- `Game Test` löst dasselbe Problem eleganter: berechnet einmalig eine
  `boundingSphere`, vergrößert deren Radius künstlich um Faktor 1.5
  (`c.geometry.boundingSphere.radius *= 1.5`) und lässt
  `frustumCulled = true` **aktiv**. Kommentar im Code: "Massiver FPS
  Boost! (berechnet keine Zombies hinter dem Spieler)".
- Das ist **genau die Art Draw-Call-Einsparung**, die in unserer
  eigenen Performance-Analyse (CHANGELOG.md "Known follow-ups",
  ROADMAP.md Phase 5) als Engpass identifiziert wurde (GPU-seitig,
  Renderaufwand bei vielen Zombies). Eine echte, kleine, risikoarme
  Verbesserung, die wir nicht haben.

**Aktuell unfertig/uncommitted in `Game Test`**: `js/main.js` hat eine
lokale, nicht committete Änderung — entfernt den `error_buzzer`-Sound
beim Versuch, mit leerem Magazin zu feuern (`fireWeapon()`, vorher rief
das den "Nicht möglich"-Buzzer auf). Kleine, aber unfertige
Geschmacksänderung, kein Bugfix.

### 3.3 Sonstige Datei-Unterschiede
- Zusätzliche, nicht eingebundene Datei im Game-Test-Root:
  `Call_of_Duty_Black_Ops_1_Grid_Inspired_Map.usdz` (22 MB, git-
  untracked, wird nirgends im Code referenziert) — vermutlich ein
  Referenz-/Inspirations-Asset für dieselbe Map, die wir bereits als
  `.glb` unter `assets/maps/map2/` eingebunden haben (Phase 7). USDZ ist
  ein Apple-AR-Format, kein direkt von Three.js ladbares Format — für
  uns ohne Konvertierung nicht nutzbar, und wir haben mit dem `.glb`
  ohnehin schon eine bessere Quelle.
- `Game Test` hat kein `data/`-Verzeichnis, kein `CREDITS.md`, kein
  `ROADMAP.md`, kein eigenes `MERGE_ANALYSIS.md` (diese Datei) — alles
  Artefakte unserer Phase-1/2/7-Arbeit.

## 4. Einzigartige Inhalte bei "Game Test" (fehlen im Hauptprojekt)

1. Frustum-Culling-Fix für Zombies (großes, unkompliziertes Perf-Plus).
2. Zombie-Animation-Speed-Sync-Fix (behebt sichtbares "Gleiten").
3. Vereinfachte Angriffs-Animation (vermeidet Verrenkungs-Glitches).
4. Granulare Grafik-Settings-UI (Bloom/Schatten/Casings/Decals einzeln
   umschaltbar statt an Quality-Stufe gekoppelt).
5. Universeller Reload-Sound + kleineres Zombie-Animations-Set (schnelleres
   Laden, kleinere `.exe`).
6. `package.json`-Exclude-Liste für ungenutzte Zombie-Animations-GLBs im
   Build.

## 5. Einzigartige Inhalte im Hauptprojekt (fehlen bei "Game Test")

1. **Phase 1** — vollständig datengesteuerte Waffen-/Zombie-Werte
   (`data/weapons.json`, `data/zombies.json`) mit Fallback-Loader.
2. **Phase 2** — `updateZombieFSM()`-Refactor, `z.aiState`, Spatial-Grid
   für Zombie-Abstoßung, sanftes Turn-Rate-limitiertes Movement.
3. **Phase 7 (Schritte 1-3)** — zweite Map (`data/maps/map2.json` +
   `assets/maps/map2/*.glb`) inkl. generischer `moveBounds`/
   `insideBounds`/`playerStart` pro Map, Map-Umschaltung per
   `window.__debug.setMap()`.
4. `CREDITS.md`, `ROADMAP.md`, dieses `MERGE_ANALYSIS.md`.
5. Die generische `resolveCollision()`/`zombieInside()`-Bounds-Fix (war
   vorher wie bei `Game Test` hart auf die eine Bunker-Map verdrahtet).

## 6. Qualitäts-/Reife-Einschätzung

- **Beide Codebasen sind spielbar und wurden aktiv getestet** — `Game
  Test` hat sogar einen gepackten `build/UNTOT Zombies 1.0.0.exe`
  vorliegen, Commit-Nachrichten wie "Zombies frustumCulling fix for 90
  FPS" klingen nach echtem Profiling, nicht nur Theorie.
- `Game Test`s Änderungen wirken **fokussiert auf Game-Feel und
  Performance** (Animation-Sync, Culling, granulare Settings) —
  praktisch orthogonal zu unserer Arbeit, die sich auf **Architektur/
  Wartbarkeit** konzentriert hat (datengesteuertes Design, FSM-
  Refactoring, Map-Infrastruktur). Es gibt inhaltlich **kaum
  Überschneidung, die zu echten Konflikten führen würde** — die meisten
  Änderungen betreffen unterschiedliche Codeabschnitte.
  Eine Ausnahme: beide Seiten haben `ANIM_BASE_SPEED`/Zombie-Speed-Werte
  und den `updateZombies()`-Bereich angefasst — ein Merge dieser
  Stelle bräuchte manuelles Zusammenführen (unsere FSM-Extraktion +
  ihr Speed-/Anim-Fix), kein reiner Cherry-Pick.
- Kein Hinweis auf unfertigen/experimentellen Code in `Game Test`
  außer der einen kleinen uncommitteten Änderung — wirkt wie zwei
  kleine, saubere, für sich genommen fertige Commits.
- `Game Test`s Vereinfachungen (universeller Reload-Sound, weniger
  Animationen, kein Fog) sind bewusste Tradeoffs für Performance/
  Ladezeit, keine Bugs — aber sie **reduzieren Content/Atmosphäre**, was
  ggf. nicht gewünscht ist, wenn man sie 1:1 übernimmt.

## 7. Unverbindliche Einschätzung: Was lohnt sich zu übernehmen?

**Eher ja (kleines Risiko, klarer Gewinn):**
- Frustum-Culling-Fix (`eb91225`) — kleine, gezielte Änderung an genau
  der Stelle, die wir selbst schon als Performance-Engpass
  dokumentiert haben (ROADMAP Phase 5). Ließe sich vermutlich direkt
  in unserem `js/main.js:2186` übernehmen.
- Zombie-Animation-Speed-Sync-Fix (`ANIM_BASE_SPEED`-Werte) — behebt
  einen sichtbaren visuellen Bug, unabhängig von unserer FSM-Arbeit.
- Granulare Grafik-Settings (Bloom/Schatten/Casings/Decals einzeln
  umschaltbar) — echtes UX-Plus, keine Architektur-Kollision.

**Eher mit Vorbehalt / Diskussionsbedarf:**
- Vereinfachte Angriffs-Animation & `headTilt=0` — hängt vom
  gewünschten Look ab (weniger creepy vs. weniger Bugs); vor Übernahme
  im Spiel gegenschauen.
- Universeller Reload-Sound & reduziertes Animations-Set — spart
  Ladezeit/Größe, kostet aber Vielfalt; eher eine Produktentscheidung
  als ein klarer Fix.
- Entfernter Fog/Ground-Fog — großer Atmosphäre-Eingriff, würde ich
  nicht kommentarlos übernehmen.

**Eher nein (Duplikat/überholt durch unsere Arbeit):**
- Alles, was `Game Test` an Waffen-/Zombie-Werten, Perks, Runden-Logik
  hat — ist identisch zu unserem alten (Vor-Phase-1) Stand und durch
  unsere datengesteuerte Lösung bereits ersetzt/verbessert.
- Das `.usdz`-Map-Asset — wir haben mit dem `.glb` unter
  `assets/maps/map2/` bereits eine bessere, direkt ladbare Quelle für
  dieselbe Karte.

Kein Merge in diesem Schritt durchgeführt — reine Empfehlung.
