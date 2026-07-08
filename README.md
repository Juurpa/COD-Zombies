# UNTOT — Runden-basierter Zombie-Modus

Ein Zombie-Survival-Spiel im Stil des klassischen "Round-Based Zombies"-Modus,
gebaut mit **Three.js** und als Desktop-Anwendung mit **Electron** verpackt.

## Features

- Runden-basiertes Zombie-Überleben mit steigender Schwierigkeit
- Mehrere Waffen mit eigenen Stats (Schaden, Feuerrate, Magazingröße, Reload)
- Mystery Box, Perks, Barrikaden bauen/reparieren, Pack-a-Punch-Grundlagen
- Räumlicher 3D-Sound (Waffen, Zombies, Umgebung) über die Web Audio API
- Einstellbare Grafik-Qualität (Auflösungsskalierung, Schatten, Bloom, FPS-Anzeige)

## Steuerung

| Taste          | Aktion              |
|----------------|---------------------|
| `W A S D`      | Bewegen             |
| Maus           | Umsehen / Schießen  |
| `Shift`        | Sprinten            |
| `C`            | Slide               |
| `Leertaste`    | Springen            |
| `R`            | Nachladen           |
| `E` (halten)   | Kaufen / Bauen      |
| `1` / `2`      | Waffe wechseln      |
| `V`            | Messer              |
| `G`            | Granate             |
| `L`            | Stirnlampe          |
| `F11`          | Vollbild            |
| `Esc`          | Pause               |

## Voraussetzungen

- [Node.js](https://nodejs.org/) (LTS empfohlen)
- npm (wird mit Node.js installiert)

## Installation

```bash
npm install
```

## Entwicklung / Starten

```bash
npm start
```

Startet das Spiel als Electron-Fenster über `app.js` / `index.html`.

## Build (Windows .exe)

```bash
npm run build
```

Erstellt über `electron-builder` eine portable ausführbare Datei unter
`build/UNTOT Zombies <version>.exe`.

## Projektstruktur

```
app.js              Electron-Hauptprozess (Fenster-Erstellung)
index.html          Einstiegspunkt der Renderer-Seite (UI/HUD/Menüs)
js/main.js           Spiellogik (Rendering, Physik, KI, Waffen, Sound, HUD)
assets/              3D-Modelle, Texturen und Sounds
vendor/              Gebündelte Three.js-Bibliothek (ES-Module)
build/               Build-Ausgabe von electron-builder (nicht versioniert)
```

## Changelog

Änderungen werden in [CHANGELOG.md](CHANGELOG.md) dokumentiert.
