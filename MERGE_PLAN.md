# Merge-Plan: Übernahme der "Game Test"-Änderungen

Basierend auf MERGE_ANALYSIS.md. Entscheidung (Paul, 2026-07-08): **alle**
Verbesserungen aus `Game Test` übernehmen, inklusive der zuvor als
"mit Vorbehalt" markierten Punkte (vereinfachte Angriffs-Animation,
universeller Reload-Sound + reduziertes Animations-Set, entfernter Fog).

WICHTIG: Nicht alles in einem Rutsch mergen. Jeder Schritt = eigener
Commit, danach im echten Spiel testen (`npm start`), bevor der nächste
Schritt beginnt. Nach jedem Schritt Ergebnis kurz zurückmelden.

Besonderheit: Das Hauptprojekt hat seit der Trennung von `Game Test`
eigene Architektur-Arbeit geleistet (Phase 1 Datenauslagerung, Phase 2
FSM/Spatial-Grid/sanfte Bewegung, Phase 7 Map-System). Kein Punkt hier
darf diese Arbeit rückgängig machen — wo sich Codebereiche überschneiden
(v.a. Zombie-Speed/Animation), müssen Werte manuell in die neue Struktur
eingearbeitet werden, nicht per Kopieren alter Codeblöcke.

## Schritt 1 — Frustum-Culling-Fix (geringstes Risiko, klarer Perf-Gewinn)
- [ ] In `js/main.js` (aktuell `c.frustumCulled = false;`, Bereich um
      Zeile 2186 im Hauptprojekt): durch den Ansatz aus `Game Test`
      (Commit `eb91225`) ersetzen — einmalig `boundingSphere` berechnen,
      Radius künstlich um Faktor 1.5 vergrößern, `frustumCulled = true`
      belassen, statt Culling komplett zu deaktivieren.
- [ ] Test: Zombies hinter/außerhalb des Sichtfelds verschwinden NICHT
      fälschlich (das war der ursprüngliche Grund für das Abschalten) UND
      messbarer FPS-Gewinn bei vielen Zombies gleichzeitig im Blickfeld.
- [ ] CHANGELOG.md-Eintrag ergänzen.

## Schritt 2 — Zombie-Animation-Speed-Sync-Fix
- [ ] Werte aus `Game Test`s `ANIM_BASE_SPEED`
      (`{walk:0.8, run:2.8, crawl:0.6, crawlrun:1.2}`, vorher im
      Hauptprojekt `{walk:1.1, run:3.8, crawl:0.8, crawlrun:1.6}`) sowie
      die leicht reduzierten Zombie-Geschwindigkeiten (Runner
      3.15–3.85 → 2.8–3.4, normal-Cap 2.3 → 2.1) übernehmen.
- [ ] WICHTIG: Diese Werte jetzt zentral in `data/zombies.json` pflegen
      (Phase-1-Struktur des Hauptprojekts), NICHT als Hardcode in
      `js/main.js` zurückfallen. `ANIM_BASE_SPEED` selbst bleibt ggf. im
      Code, aber die Zombie-Speed-Ranges gehören in die JSON.
- [ ] Test: Zombie-Beinanimation und tatsächliche Bewegungsgeschwindigkeit
      passen sichtbar zusammen (kein "Gleiten"/Skaten mehr).

## Schritt 3 — Vereinfachte Angriffs-Animation + headTilt
- [ ] Nur noch `'attack'`-Animation verwenden statt zufällig zwischen
      `attack`/`bite`/`neckbite` zu wählen.
- [ ] `headTilt` auf 0 setzen (vorher zufällig ±0.35).
- [ ] Test: Keine sichtbaren Verrenkungs-Glitches mehr bei Zombie-Angriffen.
- [ ] Falls dieser Codepfad inzwischen Teil von `updateZombieFSM()`
      (Phase 2) ist: Änderung dort einbauen, nicht in altem, ggf. nicht
      mehr existierendem Code suchen.

## Schritt 4 — Universeller Reload-Sound + reduziertes Animations-Set
- [ ] Neue Datei `assets/sounds/reload_universal.mp3` aus `Game Test`
      übernehmen (Datei kopieren + ins Repo aufnehmen, CREDITS.md prüfen
      falls Lizenz-relevant).
- [ ] `sfx.reload`/`playReload()`-Logik anpassen: ein universeller Sound
      für alle Waffen statt `WEAPON_SOUND_FILES`-Zuordnung — dabei
      bestehenden Shotgun-Pump-Sonderfall (`w.key === 'shotgun'`) prüfen,
      ob der weiterhin sinnvoll ist oder ebenfalls vereinheitlicht wird.
- [ ] `animList` von 19 auf die 9 Animationen aus `Game Test` reduzieren
      (entfernt: `idle, bite, neckbite, standup, hit, stumble, turn, kick,
      punch, headbutt`) — NUR falls Schritt 3 (Attack-Vereinfachung)
      diese Animationen wirklich nicht mehr referenziert, sonst bricht das
      Laden.
- [ ] `package.json`: entsprechende `.glb`-Dateien analog zu `Game Test`
      aus der electron-builder-`files`-Liste ausschließen
      (`!assets/zombie/idle.glb` etc.).
- [ ] Test: Build (`npm run build`) läuft weiterhin fehlerfrei, .exe
      startet, alle verbleibenden Zombie-Zustände haben eine gültige
      Animation (kein Absturz durch fehlende `zAssets[name]`).

## Schritt 5 — Granulare Grafik-Settings
- [ ] `SETTINGS` um `bloom`, `shadows`, `casings`, `maxDecals` erweitern
      (statt fest an `quality`-Stufe gekoppelt).
- [ ] Neue UI-Elemente im Einstellungsmenü (`index.html`): Checkboxen/
      Slider für Bloom/Schatten/Hülsen/Decals, analog zu `Game Test`s
      `#set-bloom`, `#set-shadows`, `#set-casings`, `#set-decals`.
- [ ] `js/main.js`: `bloomOn`/Schatten-Logik (aktuell an `q === 'hoch'`
      gekoppelt) durch die neuen granularen Settings ersetzen, inkl.
      `saveSettings()`/`applySettings()`/`refreshSettingsUI()`.
- [ ] Test: Jede Einstellung schaltet sichtbar unabhängig von den anderen
      um, wird korrekt in `localStorage` gespeichert und beim Neustart
      wiederhergestellt.

## Schritt 6 — Fog entfernen
- [ ] `groundFogTex`/`groundFogGroup`(45 Sprites) sowie beide
      `scene.fog`-Zuweisungen entfernen.
- [ ] Test: Keine Fehler durch übrig gebliebene Referenzen auf entfernte
      Fog-Objekte (z.B. in Update-Loops, die `groundFogGroup` noch
      anfassen könnten).
- [ ] Kurz im Spiel gegenschauen, ob die Sichtbarkeit/Atmosphäre ohne Fog
      noch stimmig wirkt (bewusste Design-Entscheidung von Paul, aber
      Sanity-Check schadet nicht).

## Schritt 7 — Kleine uncommittete Änderung aus Game Test
- [ ] `error_buzzer`-Sound bei leerem Magazin/Feuerversuch in
      `fireWeapon()` entfernen (war in `Game Test` uncommitted, aber vom
      Kollegen offensichtlich in Arbeit).

## Abschluss
- [ ] MERGE_ANALYSIS.md und diesen MERGE_PLAN.md-Fortschritt (Checkboxen)
      aktualisieren.
- [ ] CHANGELOG.md um einen zusammenfassenden Eintrag "Änderungen aus
      Game Test übernommen: Frustum-Culling, Animation-Sync, granulare
      Grafik-Settings, universeller Reload-Sound, entfernter Fog"
      ergänzen.
- [ ] Finaler Komplett-Test: `npm start` UND `npm run build` +
      gebaute `.exe` starten, mehrere Runden spielen (beide Maps).
