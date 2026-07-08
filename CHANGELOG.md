# Changelog

## 2026-07-08

### Fixed
- Waffen-Sounds: Waffen-Keys (pistol, rifle, smg, magnum, raygun) stimmten
  nicht mit den Sound-Dateipräfixen (revolver_, ak47_, mg42_, shotgun_)
  überein. Neue WEAPON_SOUND_FILES-Zuordnung in js/main.js behebt das,
  Waffen ohne eigene Aufnahmen bekommen ein passendes Ersatzset.
- Entfernt: doppelter, ungenutzter Ordner assets/sound/ (Singular) —
  der Code lädt tatsächlich aus assets/sounds/ (Plural).
- Entfernt: Debug-Handler in index.html, der bei jedem Fehler eine
  renderer_error.txt ins Arbeitsverzeichnis schrieb.

### Added
- assets/sounds/generate_zombie_sounds.py und sound_requirements.md
  ins Repo aufgenommen (waren nur lokal vorhanden).

### Verified
- Spiel startet fehlerfrei über npm start / electron .
- Build zu .exe über npm run build funktioniert
  (build/UNTOT Zombies 1.0.0.exe).
- Sound-Buffer und AudioContext-Status im echten Gameplay-Loop geprüft
  und funktionsfähig bestätigt.

### Known follow-ups
- Performance bei vielen Zombies (>20) kann bei O(n²)-Abstoßungscheck
  in updateZombies() und Echtzeit-Schatten einbrechen — mögliche
  Optimierung: Spatial-Grid bzw. LOD für weit entfernte Zombies.

## Merge aus "Game Test" (Kollegen-Fork, siehe MERGE_ANALYSIS.md / MERGE_PLAN.md)

### Fixed
- Zombie-Frustum-Culling (Schritt 1 aus MERGE_PLAN.md): Zombie-Meshes
  hatten `frustumCulled = false`, weil die Standard-Bounding-Box eines
  Skinned Mesh bei Animation nicht mitwächst — dadurch wurde jeder
  Zombie jeden Frame gerendert, auch außerhalb des Sichtfelds. Jetzt
  wird stattdessen einmalig eine Bounding-Sphere berechnet und ihr
  Radius künstlich um Faktor 1.5 vergrößert, Culling bleibt aktiv
  (`frustumCulled = true`). Übernommen aus Game-Test-Commit
  `eb91225` ("Zombies frustumCulling fix for 90 FPS").
  Verifiziert: Zombies, die tatsächlich im Sichtfeld stehen, rendern
  weiterhin korrekt (Screenshot-Test mit 12 Zombies in Kamerasicht,
  keine fälschlich verschwundenen Meshes).
