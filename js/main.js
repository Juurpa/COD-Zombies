import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================
//  UNTOT — Runden-basierter Zombie-Modus (Vollversion)
//  Perks, Mystery-Box, Power-Ups, Messer, Granaten,
//  Grafik-Presets (Niedrig/Mittel/Hoch mit Bloom).
// ============================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const $ = id => document.getElementById(id);

// ---------------- Datengesteuerte Konfiguration ----------------
// Lädt data/<name>.json synchron (Node-Integration im Renderer) und liefert
// dessen Inhalt, oder null falls die Datei fehlt/kaputt ist. Aufrufer müssen
// in diesem Fall auf ihre eingebauten Standardwerte zurückfallen — das Spiel
// darf dadurch nie abstürzen.
function loadGameData(name) {
  try {
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(path.join(__dirname, 'data', name), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[UNTOT] data/${name} konnte nicht geladen werden, nutze eingebaute Standardwerte:`, e.message);
    return null;
  }
}
// Tiefes Überschreiben von Default-Werten mit geladenen Daten, ohne die
// Struktur zu verlieren falls im JSON ein Feld fehlt.
function applyDataOverrides(defaults, loaded) {
  if (!loaded) return defaults;
  for (const key of Object.keys(defaults)) {
    if (!(key in loaded)) continue;
    const def = defaults[key], val = loaded[key];
    if (def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object') {
      applyDataOverrides(def, val);
    } else {
      defaults[key] = val;
    }
  }
  return defaults;
}

// ---------------- UI ----------------
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), gameover: $('gameover'),
  points: $('pointsval'), round: $('roundval'), ammo: $('ammo'),
  weapon: $('weaponname'), health: $('healthbar'), prompt: $('prompt'),
  hitmarker: $('hitmarker'), damage: $('damage'), flash: $('flash'),
  roundflash: $('roundflash'), reloadhint: $('reloadhint'), fps: $('fps'),
  bestround: $('bestround'), finalround: $('finalround'), finalkills: $('finalkills'),
  finalpoints: $('finalpoints'), finalbest: $('finalbest'), cta: $('ctastart'),
  grain: $('grain'), perkicons: $('perkicons'), grenadeicon: $('grenadeicon'),
  powerupbar: $('powerupbar'), popups: $('popups'), settings: $('settings'),
  zcount: $('zcount'), dmgdir: $('dmgdir'), toasts: $('toasts'),
  finalstats: $('finalstats'), scorelist: $('scorelist'),
};

const best = parseInt(localStorage.getItem('untot_best') || '0');
if (best > 0) ui.bestround.textContent = 'Beste Runde bisher: ' + best;
{
  const sc = JSON.parse(localStorage.getItem('untot_scores') || '[]');
  if (sc.length) ui.bestround.textContent += ' · Top-Runden: ' + sc.map(s => s.r).join(' / ');
}

// Filmkorn-Textur
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255 | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ui.grain.style.backgroundImage = `url(${c.toDataURL()})`;
}

// ---------------- Einstellungen ----------------
const SETTINGS = Object.assign(
  { quality: 'hoch', fov: 75, sens: 1.0, grain: true, ambient: true, showFps: true, resScale: 1.0, volume: 0.8, bloodScreen: true },
  JSON.parse(localStorage.getItem('untot_settings') || '{}')
);
if (SETTINGS.quality === 'ultra') {
  SETTINGS.quality = 'hoch';
}
function saveSettings() { localStorage.setItem('untot_settings', JSON.stringify(SETTINGS)); }

// ---------------- Renderer / Szene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010204);
scene.fog = new THREE.FogExp2(0x010204, 0.015);

const camera = new THREE.PerspectiveCamera(SETTINGS.fov, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Bloom-Pipeline (nur bei Qualität "Hoch" aktiv)
const composerTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
  samples: 4, type: THREE.HalfFloatType,
});
const composer = new EffectComposer(renderer, composerTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const ssaoPass = new SSAOPass(scene, camera, innerWidth, innerHeight);
ssaoPass.kernelRadius = 0.6;
ssaoPass.minDistance = 0.002;
ssaoPass.maxDistance = 0.12;
ssaoPass.enabled = false;
composer.addPass(ssaoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.55, 0.85);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
let bloomOn = false;
let realShadows = false;

// Statische Umgebungs-Reflexionen (lässt Metall & Waffen glänzen)
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  ssaoPass.setSize(innerWidth, innerHeight);
});

// ---------------- Licht ----------------
// Deutlich dunkleres, düstereres Umgebungslicht für Horror-Atmosphäre
scene.add(new THREE.HemisphereLight(0x181e30, 0x020205, 0.07));
scene.add(new THREE.AmbientLight(0x080c18, 0.04));

const camFill = new THREE.PointLight(0xfff0dd, 1.8, 3.5, 2);
camFill.position.set(0.2, 0.1, 0.2);
camera.add(camFill);

// Stirnlampe an der Kamera (mittig oben, ohne Schattenwurf — günstig)
const flashlight = new THREE.SpotLight(0xfff2dc, 16, 24, 0.46, 0.5, 1.5);
flashlight.position.set(0, 0.18, 0.05);
camera.add(flashlight);
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, 0.18, -6);
camera.add(flashTarget);
flashlight.target = flashTarget;

const volumeCones = [];
const lampLights = [];
const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });

function roomLight(x, z, color = 0xffb27a, intensity = 160, shadowCapable = true) {
  // Spot statt Punktlicht: kann echte Schatten werfen (Qualität Hoch)
  const l = new THREE.SpotLight(color, intensity, 32, 1.25, 0.55, 1.3);
  l.position.set(x, 3.3, z);
  const target = new THREE.Object3D();
  target.position.set(x, 0, z);
  scene.add(target);
  l.target = target;
  l.shadow.bias = -0.0015;
  l.shadow.normalBias = 0.02;
  l.shadow.camera.near = 0.5;
  l.shadow.camera.far = 16;
  l.userData.shadowCapable = shadowCapable;
  scene.add(l);
  lampLights.push(l);
  // Langer Kronleuchter-Kabel von der 9m hohen Decke
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 5.6, 6), shadeMat);
  cable.position.set(x, 6.2, z);
  scene.add(cable);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 12, 1, true), shadeMat);
  shade.position.set(x, 3.38, z);
  scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
  bulb.position.set(x, 3.28, z);
  scene.add(bulb);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, 3.2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  cone.position.set(x, 1.7, z);
  scene.add(cone);
  volumeCones.push(cone);
  return l;
}
// ---------------- Map-Konfiguration (data/maps/*.json) ----------------
// Welche Map aktiv ist, wird vorerst per localStorage-Flag gewählt (siehe
// window.__debug.setMap weiter unten) — noch kein UI, das kommt mit dem
// Lobby-Screen (ROADMAP.md Phase 7). Default bleibt 'map1', damit ein
// frisches Profil sich exakt wie vor dieser Änderung verhält.
const ACTIVE_MAP_ID = (typeof localStorage !== 'undefined' && localStorage.getItem('untot_map')) || 'map1';

// Eingebaute Standardwerte je Map — greifen, falls data/maps/<id>.json fehlt
// oder fehlerhaft ist. "model: null" markiert, dass map1 kein 3D-Modell
// lädt, sondern komplett aus Code (Wände/Boden/Texturen weiter unten)
// aufgebaut wird — im Gegensatz zu map2 mit "model": "assets/maps/...glb".
const MAP_BUILTIN_DEFAULTS = {
  map1: {
    name: 'Bunker (Original)',
    model: null,
    playerStart: { x: 0, z: 3 },
    // Bewegungs-Clamp (resolveCollision) und "ist drinnen"-Check
    // (zombieInside) — exakt die bisherigen Hardcoded-Grenzen der Bunker-Map.
    moveBounds: { minX: -19.4, maxX: 59.4, minZ: -59.4, maxZ: 19.4 },
    insideBounds: { minX: -19.9, maxX: 59.9, minZ: -59.9, maxZ: 19.9 },
    spawners: [
      { x: -40, z: 0, zone: 0 }, { x: 0, z: 40, zone: 0 },
      { x: 80, z: 0, zone: 1 }, { x: 40, z: 40, zone: 1 },
      { x: 0, z: -80, zone: 2 }, { x: -40, z: -40, zone: 2 },
      { x: 80, z: -40, zone: 3 }, { x: 40, z: -80, zone: 3 },
    ],
    // Lampen in den Raumzentren der 80×80-Map + je eine Zweitlampe pro Raum
    // (nur die 4 Hauptlampen werfen Schatten — mehr kostet zu viel Leistung)
    zoneLights: [
      { x: 0, z: 0, color: '#ff8833', intensity: 90, shadowCapable: true },    // Zone 0 - Start (Warm Orange)
      { x: 40, z: 0, color: '#44aaff', intensity: 100, shadowCapable: true },  // Zone 1 - Speed-Cola (Cold Neon Blue)
      { x: 0, z: -40, color: '#33ff66', intensity: 85, shadowCapable: true },  // Zone 2 - Juggernog (Toxic Green)
      { x: 40, z: -40, color: '#ff2222', intensity: 110, shadowCapable: true },// Zone 3 - Pack-a-Punch (Emergency Alarm Red)
      { x: -10, z: 10, color: '#ff8833', intensity: 40, shadowCapable: false },
      { x: 50, z: -10, color: '#44aaff', intensity: 40, shadowCapable: false },
      { x: -10, z: -50, color: '#33ff66', intensity: 35, shadowCapable: false },
      { x: 50, z: -30, color: '#ff2222', intensity: 45, shadowCapable: false },
    ],
    wallBuys: [
      { weapon: 'smg', x: 59.2, z: 0, ry: -1.5707963267948966 },
      { weapon: 'shotgun', x: -8, z: -59.2, ry: 0 },
      { weapon: 'rifle', x: 59.2, z: -48, ry: -1.5707963267948966 },
    ],
    grenadeBuy: { x: 19.45, z: 12, ry: -1.5707963267948966, cost: 250 },
  },
  // Sicherheitsnetz, falls data/maps/map2.json selbst fehlt/kaputt ist —
  // die echten (ebenfalls vorläufigen) Werte kommen aus dieser Datei.
  map2: {
    name: 'Black Ops 1 Grid (Platzhalter)',
    model: 'assets/maps/map2/call_of_duty_black_ops_1_grid_inspired_map.glb',
    playerStart: { x: 0, z: 0 },
    moveBounds: { minX: -108, maxX: 184, minZ: -118, maxZ: 99 },
    insideBounds: { minX: -108, maxX: 184, minZ: -118, maxZ: 99 },
    spawners: [{ x: 0, z: 0, zone: 0 }],
    zoneLights: [{ x: 0, z: 0, color: '#ffffff', intensity: 100, shadowCapable: false }],
    wallBuys: [],
    grenadeBuy: { x: 0, z: 0, ry: 0, cost: 250 },
  },
};
const ACTIVE_MAP = MAP_BUILTIN_DEFAULTS[ACTIVE_MAP_ID] || MAP_BUILTIN_DEFAULTS.map1;
applyDataOverrides(ACTIVE_MAP, loadGameData('maps/' + ACTIVE_MAP_ID + '.json'));
function hexColor(str) { return parseInt(str.replace('#', ''), 16); }

const lights = ACTIVE_MAP.zoneLights.map(l => roomLight(l.x, l.z, hexColor(l.color), l.intensity, l.shadowCapable));
const flickerLight = lights[Math.min(2, lights.length - 1)];

// ---------------- Prozedurale Texturen ----------------
function canvasTexture(size, draw, repX = 1, repY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalMapFromHeight(size, drawHeight, strength = 2, repX = 1, repY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  drawHeight(g, size);
  const src = g.getImageData(0, 0, size, size).data;
  const out = g.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) / 255 * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) / 255 * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = inv * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}

function drawFloorColor(g, s) {
  const k = (s / 512) * (s / 512); // Detaildichte skaliert mit Auflösung
  g.fillStyle = '#2b2f33'; g.fillRect(0, 0, s, s);
  // feines Beton-Korn
  for (let i = 0; i < 3500 * k; i++) {
    g.fillStyle = `rgba(${rand(20, 65)},${rand(20, 65)},${rand(25, 70)},${rand(0.15, 0.4)})`;
    g.fillRect(rand(0, s), rand(0, s), rand(1, 3), rand(1, 3));
  }
  // Öl- und Schmutzflecken
  for (let i = 0; i < 5; i++) {
    const x = rand(0, s), y = rand(0, s), r = rand(20, 70);
    const grd = g.createRadialGradient(x, y, 2, x, y, r);
    grd.addColorStop(0, 'rgba(8,8,10,0.35)');
    grd.addColorStop(1, 'rgba(8,8,10,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Dehnungsfugen
  g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 6;
  g.strokeRect(0, 0, s, s);
  // Risse
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(10,10,12,0.5)'; g.lineWidth = rand(1, 2.5);
    g.beginPath();
    let x = rand(0, s), y = rand(0, s);
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); }
    g.stroke();
  }
}
function drawFloorHeight(g, s) {
  const k = (s / 512) * (s / 512);
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000 * k; i++) {
    const v = rand(95, 165) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(rand(0, s), rand(0, s), rand(1, 4), rand(1, 4));
  }
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 8;
  g.strokeRect(0, 0, s, s);
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = '#4a4a4a'; g.lineWidth = rand(1, 2);
    g.beginPath();
    let x = rand(0, s), y = rand(0, s);
    g.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += rand(-50, 50); y += rand(-50, 50); g.lineTo(x, y); }
    g.stroke();
  }
}
function drawWallColor(g, s) {
  g.fillStyle = '#39352f'; g.fillRect(0, 0, s, s);
  const bh = s / 8, bw = s / 4;
  for (let y = 0; y < 8; y++) {
    for (let x = -1; x < 5; x++) {
      const off = (y % 2) * bw / 2;
      const bx = x * bw + off + 3, by = y * bh + 3;
      g.fillStyle = `rgb(${rand(50, 72) | 0},${rand(44, 60) | 0},${rand(38, 52) | 0})`;
      g.fillRect(bx, by, bw - 6, bh - 6);
      // Kanten: oben Licht, unten Schatten — macht Steine plastisch
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(bx, by, bw - 6, 5);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(bx, by + bh - 13, bw - 6, 7);
      // gelegentlich beschädigter Stein
      if (Math.random() < 0.15) {
        g.fillStyle = 'rgba(20,16,12,0.4)';
        g.beginPath();
        g.arc(bx + rand(10, bw - 16), by + rand(8, bh - 14), rand(5, 14), 0, 7);
        g.fill();
      }
    }
  }
  // Wasserläufe von oben
  for (let i = 0; i < 12; i++) {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(15,13,10,0.22)');
    grd.addColorStop(1, 'rgba(15,13,10,0)');
    g.fillStyle = grd;
    g.fillRect(rand(0, s), 0, rand(3, 10), s);
  }
  // feines Rauschen
  for (let i = 0; i < 2500 * (s / 512) * (s / 512); i++) {
    g.fillStyle = `rgba(0,0,0,${rand(0.08, 0.3)})`;
    g.fillRect(rand(0, s), rand(0, s), rand(1, 3), rand(1, 2));
  }
}
function drawWallHeight(g, s) {
  g.fillStyle = '#3c3c3c'; g.fillRect(0, 0, s, s);
  const bh = s / 8, bw = s / 4;
  for (let y = 0; y < 8; y++) {
    for (let x = -1; x < 5; x++) {
      const off = (y % 2) * bw / 2;
      const v = rand(140, 180) | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x * bw + off + 4, y * bh + 4, bw - 8, bh - 8);
    }
  }
  for (let i = 0; i < 2000; i++) {
    const v = rand(110, 190) | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rand(0, s), rand(0, s), rand(1, 3), rand(1, 3));
  }
}

function stainedGlassTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  
  // Farbiger, leuchtender Grund-Gradient
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#ff1155');
  grad.addColorStop(0.3, '#ffaa00');
  grad.addColorStop(0.6, '#00aaff');
  grad.addColorStop(1, '#5500ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  
  // Gotische Bleiglas-Streben zeichnen (Schwarze Linien)
  g.strokeStyle = '#111';
  g.lineWidth = 4;
  
  // Spitzbögen oben
  for (let r = 30; r < 240; r += 40) {
    g.beginPath();
    g.arc(128, 190, r, Math.PI, 0); 
    g.stroke();
  }
  
  // Vertikale Streben
  for (let lx = 32; lx < 256; lx += 32) {
    g.beginPath(); g.moveTo(lx, 190); g.lineTo(lx, 512); g.stroke();
  }
  
  // Rauten-Muster im Glas
  for (let y = 190; y < 512; y += 45) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 80); g.stroke();
    g.beginPath(); g.moveTo(256, y); g.lineTo(0, y + 80); g.stroke();
  }
  
  // Schwarzer Randrahmen
  g.strokeStyle = '#000'; g.lineWidth = 16;
  g.strokeRect(0, 0, 256, 512);
  
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const stainedGlassTex = stainedGlassTexture();

function addStainedGlass(x, z, ry) {
  const g = new THREE.Group();
  
  // Das bunt leuchtende Glas
  const winMat = new THREE.MeshBasicMaterial({
    map: stainedGlassTex,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.4), winMat);
  glass.position.y = 4.2;
  g.add(glass);
  
  // Gotischer Steinrahmen außen herum
  const frameStone = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 0.45), frameMat);
  frameStone.position.y = 7.45;
  g.add(frameStone);
  
  const pilL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 7.4, 0.35), frameMat);
  pilL.position.set(-1.8, 3.7, 0);
  const pilR = pilL.clone();
  pilR.position.set(1.8, 3.7, 0);
  g.add(pilL, pilR);
  
  g.position.set(x, 0.05, z);
  g.rotation.y = ry;
  scene.add(g);
  shootTargets.push(g);
}

// 1024er vorgerenderte Texturen — einmal beim Laden erzeugt, danach nur noch GPU
const floorTex = canvasTexture(1024, drawFloorColor, 40, 40);
const floorNorm = normalMapFromHeight(1024, drawFloorHeight, 1.6, 40, 40);
const wallTexBase = canvasTexture(1024, drawWallColor);
const wallNormBase = normalMapFromHeight(1024, drawWallHeight, 2.4);

const woodTex = canvasTexture(256, (g, s) => {
  g.fillStyle = '#5a4128'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(${rand(30, 62)},${rand(20, 42)},10,${rand(0.3, 0.6)})`;
    g.lineWidth = rand(1, 3);
    g.beginPath(); g.moveTo(0, rand(0, s)); g.lineTo(s, rand(0, s)); g.stroke();
  }
  // Astlöcher
  for (let i = 0; i < 3; i++) {
    const x = rand(20, s - 20), y = rand(20, s - 20);
    g.strokeStyle = 'rgba(30,20,8,0.7)';
    g.lineWidth = 2;
    for (let r = 3; r < 12; r += 3) {
      g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, 7); g.stroke();
    }
  }
});

const woodNorm = normalMapFromHeight(256, (g, s) => {
  g.fillStyle = '#808080'; g.fillRect(0,0,s,s);
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(${rand(180,220)},180,180,${rand(0.6,1)})`;
    g.lineWidth = rand(1, 3);
    g.beginPath(); g.moveTo(0, rand(0, s)); g.lineTo(s, rand(0, s)); g.stroke();
  }
}, 1.5);

// Anisotrope Filterung: hält Boden/Wände auch bei flachem Blickwinkel scharf
const maxAniso = renderer.capabilities.getMaxAnisotropy();
for (const t of [floorTex, floorNorm, wallTexBase, wallNormBase, woodTex, woodNorm]) t.anisotropy = maxAniso;

const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, normalMap: floorNorm, roughness: 0.94, metalness: 0.02 });
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 1 });
const wallMat = new THREE.MeshStandardMaterial({ map: wallTexBase, normalMap: wallNormBase, roughness: 0.8, color: 0x666666 });
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, normalMap: woodNorm, roughness: 0.85 });
const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, normalMap: woodNorm, color: 0xb0906a, roughness: 0.75 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.85 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0x2ee6ff });

// Merkt sich, wie viele Objekte schon in der Szene sind, bevor die
// prozedurale Bunker-Geometrie unten gebaut wird — auf map2 wird alles ab
// hier später wieder ausgeblendet (siehe unten bei "Spawners").
const preLevelChildCount = scene.children.length;

// ---------------- Karte ----------------
const colliders = [];
const shootTargets = [];
const interactables = [];
const windows = [];
const zones = [
  { unlocked: true }, { unlocked: false }, { unlocked: false }, { unlocked: false },
];

function addBoxCollider(minX, maxX, minZ, maxZ, maxY = null) {
  const c = { minX, maxX, minZ, maxZ, maxY };
  colliders.push(c);
  return c;
}

function addWall(x1, z1, x2, z2, h = 9, t = 0.6) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const tex = wallTexBase.clone(); tex.needsUpdate = true;
  const nrm = wallNormBase.clone(); nrm.needsUpdate = true;
  tex.repeat.set(Math.max(1, len / 4), h / 4);
  nrm.repeat.copy(tex.repeat);
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(len, h, t),
    new THREE.MeshStandardMaterial({ map: tex, normalMap: nrm, roughness: 0.92, metalness: 0.02 })
  );
  m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
  if (Math.abs(z2 - z1) > Math.abs(x2 - x1)) m.rotation.y = Math.PI / 2;
  m.receiveShadow = true;
  scene.add(m);
  shootTargets.push(m);
  // Sockelleiste — gibt der Wand am Boden echte Tiefe
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, t + 0.12), frameMat);
  skirt.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
  skirt.rotation.y = m.rotation.y;
  skirt.receiveShadow = true;
  scene.add(skirt);
  if (Math.abs(z2 - z1) > Math.abs(x2 - x1)) {
    addBoxCollider(x1 - t / 2, x1 + t / 2, Math.min(z1, z2), Math.max(z1, z2));
  } else {
    addBoxCollider(Math.min(x1, x2), Math.max(x1, x2), z1 - t / 2, z1 + t / 2);
  }
  return m;
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(20, 0, -20);
floor.receiveShadow = true;
scene.add(floor);
shootTargets.push(floor);

// Decke auf 9 Meter angehoben für Kathedralen-Look
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), ceilMat);
ceil.rotation.x = Math.PI / 2;
ceil.position.set(20, 9, -20);
scene.add(ceil);

// Gotische Gewölbe & Säulen-Funktion (Kreuzrippengewölbe)
function addGothicColonnade(x, z, span, height, ry) {
  const colL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 5, 8), frameMat);
  colL.position.set(-span/2, 2.5, 0);
  colL.castShadow = true; colL.receiveShadow = true;
  
  const colR = colL.clone();
  colR.position.set(span/2, 2.5, 0);
  
  const archGroup = new THREE.Group();
  const segments = 12;
  const halfSpan = span / 2;
  const archHeight = height - 5; 
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lx = -halfSpan * (1 - t);
    const ly = 5 + archHeight * Math.sin(t * Math.PI / 2);
    const segL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.8), frameMat);
    segL.position.set(lx, ly, 0);
    segL.rotation.z = (1 - t) * 0.72;
    segL.castShadow = true; segL.receiveShadow = true;
    archGroup.add(segL);
    
    if (i > 0) {
      const rx = halfSpan * (1 - t);
      const ry = 5 + archHeight * Math.sin(t * Math.PI / 2);
      const segR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.8), frameMat);
      segR.position.set(rx, ry, 0);
      segR.rotation.z = -(1 - t) * 0.72;
      segR.castShadow = true; segR.receiveShadow = true;
      archGroup.add(segR);
    }
  }
  
  const g = new THREE.Group();
  g.add(colL, colR, archGroup);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  shootTargets.push(g);
}

// Kreuzrippengewölbe in allen Zonen
addGothicColonnade(0, 0, 40, 9, 0);
addGothicColonnade(0, 0, 40, 9, Math.PI/2);

addGothicColonnade(40, 0, 40, 9, 0);
addGothicColonnade(40, 0, 40, 9, Math.PI/2);

addGothicColonnade(0, -40, 40, 9, 0);
addGothicColonnade(0, -40, 40, 9, Math.PI/2);

addGothicColonnade(40, -40, 40, 9, 0);
addGothicColonnade(40, -40, 40, 9, Math.PI/2);


// ==== NEW MASSIVE MAP ====
// Fensteröffnung in der Außenwand: Sturz + Brüstung, überarbeitet für hohe Decke (9m)
function windowOpening(x, z, alongZ) {
  const under = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.6 : 2.5, 1.15, alongZ ? 2.5 : 0.6), frameMat);
  under.position.set(x, 0.575, z);
  under.receiveShadow = true;
  scene.add(under); shootTargets.push(under);
  
  // over-Teil geht nun hoch bis zur 9m Decke (7m hoch, zentriert auf Y=5.5)
  const over = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.6 : 2.5, 7.0, alongZ ? 2.5 : 0.6), frameMat);
  over.position.set(x, 5.5, z);
  scene.add(over); shootTargets.push(over);
  
  if (alongZ) addBoxCollider(x - 0.3, x + 0.3, z - 1.25, z + 1.25);
  else addBoxCollider(x - 1.25, x + 1.25, z - 0.3, z + 0.3);
}

// Outer Walls (80x80) — mit echten Fensteröffnungen zum Wald
// Nord (z=20), Fenster bei x=0 und x=40
addWall(-20, 20, -1.25, 20);
addWall(1.25, 20, 38.75, 20);
addWall(41.25, 20, 60, 20);
windowOpening(0, 20, false); windowOpening(40, 20, false);
// Süd (z=-60), Fenster bei x=0 und x=40
addWall(-20, -60, -1.25, -60);
addWall(1.25, -60, 38.75, -60);
addWall(41.25, -60, 60, -60);
windowOpening(0, -60, false); windowOpening(40, -60, false);
// West (x=-20), Fenster bei z=0 und z=-40
addWall(-20, -60, -20, -41.25);
addWall(-20, -38.75, -20, -1.25);
addWall(-20, 1.25, -20, 20);
windowOpening(-20, 0, true); windowOpening(-20, -40, true);
// Ost (x=60), Fenster bei z=0 und z=-40
addWall(60, -60, 60, -41.25);
addWall(60, -38.75, 60, -1.25);
addWall(60, 1.25, 60, 20);
windowOpening(60, 0, true); windowOpening(60, -40, true);

// Internal walls for doors
// Between Z0 and Z1 (x=20)
addWall(20, -20, 20, -4);
addWall(20, 4, 20, 20);
// Between Z0 and Z2 (z=-20)
addWall(-20, -20, -4, -20);
addWall(4, -20, 20, -20);
// Between Z1 and Z3 (z=-20)
addWall(20, -20, 36, -20);
addWall(44, -20, 60, -20);
// Between Z2 and Z3 (x=20)
addWall(20, -60, 20, -44);
addWall(20, -36, 20, -20);

// Neue Labyrinth- und Raumteilerwände für komplexere Räume
// Zone 0 (Startraum) - L-förmige Trennwand
addWall(-10, 4, 6, 4);
addWall(-10, -6, -10, 4);

// Zone 1 (Speed-Cola) - Raumaufteilung
addWall(42, -10, 42, 12);
addWall(20, 4, 34, 4);

// Zone 2 (Juggernog) - Zentraler Generatorraum (mit Eingang)
addWall(-6, -34, -1.5, -34);
addWall(1.5, -34, 6, -34);
addWall(-6, -46, -6, -34);
addWall(6, -46, 6, -34);
addWall(-6, -46, 6, -46);

// Zone 3 (Pack-a-Punch) - Gewundene Gänge
addWall(34, -40, 34, -20);
addWall(46, -60, 46, -36);
addWall(46, -40, 54, -40);

// Zone-System für Zombie-Navigation (neue 80×80 Map)
function zoneAt(x, z) {
  return (x < 20 ? 0 : 1) + (z < -20 ? 2 : 0);
}
function nextZoneToward(from, to) {
  if (from === to) return -1;
  const adj = {};
  for (const d of doors) {
    if (!d.opened) continue;
    const [a, b] = d.edge;
    (adj[a] = adj[a] || []).push(b);
    (adj[b] = adj[b] || []).push(a);
  }
  const prev = { [from]: from };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const n of (adj[cur] || [])) {
      if (!(n in prev)) { prev[n] = cur; queue.push(n); }
    }
  }
  if (!(to in prev)) return -1;
  let step = to;
  while (prev[step] !== from) step = prev[step];
  return step;
}

// Türen: vernagelte Planken, Kollision, Zonen-Freischaltung
const doors = [];
function makeDoor(cx, cz, alongX, cost, zoneUnlock, edge, label) {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.55, 3.6, 0.12), woodMat);
    plank.position.set(-3.2 + i * 1.6, 1.8, rand(-0.04, 0.04));
    plank.rotation.z = rand(-0.03, 0.03);
    plank.castShadow = true;
    plank.userData.dynamic = true;
    group.add(plank);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8, 0.35, 0.2), woodMat);
  beam.position.set(0, 2.2, 0.09);
  beam.userData.dynamic = true;
  group.add(beam);
  group.position.set(cx, 0, cz);
  if (!alongX) group.rotation.y = Math.PI / 2;
  scene.add(group);
  shootTargets.push(group);
  const collider = alongX
    ? addBoxCollider(cx - 4, cx + 4, cz - 0.3, cz + 0.3)
    : addBoxCollider(cx - 0.3, cx + 0.3, cz - 4, cz + 4);
  const door = { group, collider, cost, zoneUnlock, edge, opened: false, label, pos: new THREE.Vector3(cx, 1.2, cz) };
  doors.push(door);
  return door;
}

const doorCenters = { '0,1': [20, 0], '0,2': [0, -20], '1,3': [40, -20], '2,3': [20, -40] };
makeDoor(20, 0, false, 750, 1, [0, 1], 'Tür');
makeDoor(0, -20, true, 1000, 2, [0, 2], 'Stahl-Tor');
makeDoor(40, -20, true, 1250, 3, [1, 3], 'Tor');
makeDoor(20, -40, false, 1250, 3, [2, 3], 'Tor');

// Arches (Rundbögen) — passen unter die 4m-Decke
function addArch(x, z, ry) {
  const g = new THREE.Group();
  for(let i=0; i<7; i++) {
     const angle = (i/6) * Math.PI;
     const bx = Math.cos(angle) * 2.2;
     const by = 2.3 + Math.sin(angle) * 1.9;
     const archPart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.1), frameMat);
     archPart.position.set(bx, by, 0);
     archPart.rotation.z = angle + Math.PI/2;
     archPart.castShadow = true;
     g.add(archPart);
  }
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4, 1.1), frameMat);
  p1.position.set(-2.2, 2, 0); p1.castShadow = true; p1.receiveShadow = true; g.add(p1);
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4, 1.1), frameMat);
  p2.position.set(2.2, 2, 0); p2.castShadow = true; p2.receiveShadow = true; g.add(p2);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  shootTargets.push(g);
  if(ry === 0) {
    addBoxCollider(x-2.8, x-1.6, z-0.6, z+0.6);
    addBoxCollider(x+1.6, x+2.8, z-0.6, z+0.6);
  } else {
    addBoxCollider(x-0.6, x+0.6, z-2.8, z-1.6);
    addBoxCollider(x-0.6, x+0.6, z+1.6, z+2.8);
  }
}

// Dekorativer Schutt & Säulen (Mehr Tiefe)
function addRubble(x, z) {
    const g = new THREE.Group();
    for(let i=0; i<8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.5, 1.5), rand(0.5, 1.5), rand(0.5, 1.5)), wallMat);
        m.position.set(rand(-1.5, 1.5), rand(0.2, 1.0), rand(-1.5, 1.5));
        m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
        m.castShadow = true;
        g.add(m);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    shootTargets.push(g);
    addBoxCollider(x-1.5, x+1.5, z-1.5, z+1.5);
}

// Z0 Dekor
addArch(10, 0, 0);
addRubble(10, 10);
// Z1 Dekor
addArch(40, 0, 0);
addRubble(30, 10);
// Z2 Dekor
addArch(0, -40, 0);
addRubble(-10, -40);
// Z3 Dekor
addArch(40, -40, Math.PI/2);
addRubble(40, -30);

// ---------------- Deko: Kisten, Fässer, Säulen, Sandsäcke ----------------
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a5a48, roughness: 0.55, metalness: 0.5 });
const barrelLidMat = new THREE.MeshStandardMaterial({ color: 0x3a4838, roughness: 0.5, metalness: 0.6 });
const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6a4a34, metalness: 0.55, roughness: 0.5 });
const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a56, roughness: 1 });
const ammoBoxMat = new THREE.MeshStandardMaterial({ color: 0x2e3438, metalness: 0.6, roughness: 0.45 });
const chainMat = new THREE.MeshStandardMaterial({ color: 0x33363c, metalness: 0.8, roughness: 0.4 });

function addCrate(x, z, s = 1.2) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
  box.position.y = s / 2;
  box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  for (const yy of [s * 0.12, s * 0.88]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(s + 0.05, s * 0.1, s + 0.05), woodMat);
    band.position.y = yy;
    g.add(band);
  }
  const diag = new THREE.Mesh(new THREE.BoxGeometry(0.08, s * 1.25, 0.04), woodMat);
  diag.position.set(0, s / 2, s / 2 + 0.03);
  diag.rotation.z = 0.75;
  g.add(diag);
  g.position.set(x, 0, z);
  g.rotation.y = rand(0, Math.PI);
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(x - s / 2 - 0.1, x + s / 2 + 0.1, z - s / 2 - 0.1, z + s / 2 + 0.1, s + 0.05);
}
function addBarrel(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), barrelMat);
  body.position.y = 0.55;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14), barrelLidMat);
  lid.position.y = 1.12;
  g.add(lid);
  g.position.set(x, 0, z);
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 1.14);
}
function addPillar(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.95), frameMat);
  base.position.y = 0.25;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), frameMat);
  shaft.position.y = 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.35, 0.95), frameMat);
  cap.position.y = 3.85;
  for (const m of [base, shaft, cap]) {
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
}
const bagGeo = new THREE.CapsuleGeometry(0.15, 0.34, 4, 8);
function addSandbags(x, z, ry) {
  const g = new THREE.Group();
  const layout = [
    [-0.42, 0.15], [0, 0.15], [0.42, 0.15],
    [-0.21, 0.42], [0.21, 0.42],
    [0, 0.68],
  ];
  for (const [bx, by] of layout) {
    const b = new THREE.Mesh(bagGeo, bagMat);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = rand(-0.15, 0.15);
    b.position.set(bx, by, rand(-0.03, 0.03));
    b.castShadow = true;
    g.add(b);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(x - 0.7, x + 0.7, z - 0.35, z + 0.35, 0.82);
}
function addTable(x, z, ry) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.8), woodMat);
  top.position.y = 0.92;
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  for (const [lx, lz] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), woodMat);
    leg.position.set(lx, 0.45, lz);
    g.add(leg);
  }
  const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.28), ammoBoxMat);
  box1.position.set(-0.5, 1.08, 0.05);
  box1.rotation.y = 0.4;
  box1.castShadow = true;
  g.add(box1);
  const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.22), crateMat);
  box2.position.set(0.45, 1.06, -0.1);
  box2.castShadow = true;
  g.add(box2);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(x - 1.05, x + 1.05, z - 0.5, z + 0.5, 0.97);
}
function addChain(x, z, links = 5) {
  for (let i = 0; i < links; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 10), chainMat);
    link.position.set(x, 3.85 - i * 0.11, z);
    link.rotation.y = (i % 2) * Math.PI / 2;
    link.rotation.x = Math.PI / 9;
    scene.add(link);
  }
}
function pipeCyl(r, len, x, y, z, axis) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), pipeMat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
function addPoster(x, z, ry, lines) {
  const tex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#c0b088'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${rand(60, 110)},${rand(50, 90)},30,${rand(0.05, 0.2)})`;
      g.fillRect(rand(0, s), rand(0, s), rand(4, 30), rand(4, 30));
    }
    g.textAlign = 'center';
    lines.forEach((ln, i) => {
      g.fillStyle = i === 0 ? '#7a1010' : '#333';
      g.font = i === 0 ? 'bold 46px Arial' : 'bold 30px Arial';
      g.fillText(ln, s / 2, 90 + i * 60);
    });
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 8;
    g.strokeRect(4, 4, s - 8, s - 8);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, 2.3, z);
  m.rotation.y = ry;
  m.rotation.z = rand(-0.05, 0.05);
  scene.add(m);
}

// Deko-Verteilung über die 4 Räume
addCrate(-14, 12); addCrate(-12.4, 14.4, 0.9); addCrate(12, -14);
addCrate(52, 12); addCrate(28, -12); addBarrel(54, -6); addBarrel(-15, -12);
addCrate(-12, -52); addCrate(14, -28, 0.9); addBarrel(-6, -56);
addCrate(52, -28); addCrate(28, -52); addBarrel(48, -54);
addSandbags(-16.8, 16.8, 0.5); addSandbags(56.8, 16.8, -0.5);
addSandbags(56.8, -56.8, 2.6); addSandbags(-16.8, -56.8, 0.6);
addPillar(-11, -11); addPillar(11, 11);
addPillar(29, 11); addPillar(51, -11);
addPillar(-11, -29); addPillar(11, -51);
addPillar(30, -30); addPillar(50, -50);
addTable(53.6, 7, Math.PI / 2); addTable(25, -56.4, 0);
addChain(16, -24); addChain(44, -35, 7); addChain(-8, -32, 6); addChain(8, 14, 5);
addPoster(8, 19.62, Math.PI, ['ACHTUNG!', 'SPERRZONE', 'ZUTRITT', 'VERBOTEN']);
addPoster(-19.62, -28, Math.PI / 2, ['DIE TOTEN', 'WANDERN', 'NACHTS']);
addPoster(48, 19.62, Math.PI, ['WAFFEN', 'AN DER', 'WAND']);
addPoster(30, -59.62, 0, ['BUNKER 7', 'KEIN', 'AUSGANG']);

// Querpfetten unter der Decke
for (const px of [-12, 4, 28, 52]) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 80), woodMat);
  p.position.set(px, 3.7, -20);
  scene.add(p);
}

// Rostige Rohrleitungen
pipeCyl(0.09, 79, 20, 3.1, -59.45, 'x');
pipeCyl(0.09, 3.1, -19.3, 1.55, -59.45, 'y');
pipeCyl(0.09, 3.1, 59.3, 1.55, -59.45, 'y');
pipeCyl(0.07, 79, -19.45, 2.85, -20, 'z');
const valve = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16), pipeMat);
valve.position.set(-19.28, 1.6, -59.3);
valve.rotation.y = Math.PI / 2;
scene.add(valve);

// ---------------- Fenster (Barrikaden) — offen zum Wald ----------------
function fakeWindow(x, z, ry) {
  const g = new THREE.Group();
  // Kein schwarzes Brett mehr: man sieht durch das Fenster in den Wald
  const win = {
    pos: new THREE.Vector3(x, 2.1, z), boards: 5, meshes: [], lastAttack: 0,
    inward: new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)),
  };
  win.outer = new THREE.Vector3(x, 0, z).addScaledVector(win.inward, -1.4);
  win.inner = new THREE.Vector3(x, 0, z).addScaledVector(win.inward, 1.8);
  windows.push(win);
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.28, 0.07), woodMat);
    plank.position.set(rand(-0.1, 0.1), -0.7 + i * 0.35, 0.08);
    plank.rotation.z = rand(-0.12, 0.12);
    plank.castShadow = true;
    plank.userData.dynamic = true;
    g.add(plank);
    win.meshes.push(plank);
  }
  // 3D-Rahmen: Fenstersims und Laibungen
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.3), frameMat);
  sill.position.set(0, -0.95, 0.12);
  sill.castShadow = true;
  g.add(sill);
  for (const sx of [-1.2, 1.2]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.95, 0.22), frameMat);
    jamb.position.set(sx, 0, 0.08);
    g.add(jamb);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 0.22), frameMat);
  head.position.set(0, 1.0, 0.08);
  g.add(head);
  g.position.set(x, 2.1, z);
  g.rotation.y = ry;
  scene.add(g);
}

// Windows
fakeWindow(-19.68, 0, Math.PI / 2); fakeWindow(0, 19.68, Math.PI);
fakeWindow(59.68, 0, -Math.PI / 2); fakeWindow(40, 19.68, Math.PI);
fakeWindow(0, -59.68, 0); fakeWindow(-19.68, -40, Math.PI / 2);
fakeWindow(59.68, -40, -Math.PI / 2); fakeWindow(40, -59.68, 0);

// Spawners (Deep in the forest now)
const spawners = ACTIVE_MAP.spawners;

// GLB-Modell der aktiven Map laden (nur wenn "model" gesetzt ist, aktuell
// also nur map2). Wird unten in die Promise.all-Ladekette der Zombie-Assets
// eingehängt, damit "assetsLoaded" erst true wird, wenn auch die Map fertig
// geladen ist.
const mapModelPromises = [];
if (ACTIVE_MAP.model) {
  const mapLoader = new GLTFLoader();
  mapModelPromises.push(
    mapLoader.loadAsync(ACTIVE_MAP.model).then(gltf => {
      // Boden an der Spieler-Startposition per Raycast auf y=0 ausrichten.
      // Grobe Vereinfachung: funktioniert exakt nur an dieser einen Stelle —
      // Maps mit starker Höhenvariation (siehe map2, ~36 Einheiten) können
      // abseits davon über/unter der sichtbaren Geometrie stehen (bekannter
      // Platzhalter-Punkt, siehe ROADMAP.md Phase 7).
      const ray = new THREE.Raycaster(
        new THREE.Vector3(ACTIVE_MAP.playerStart.x, 1e4, ACTIVE_MAP.playerStart.z),
        new THREE.Vector3(0, -1, 0)
      );
      const hits = ray.intersectObject(gltf.scene, true);
      if (hits.length) {
        gltf.scene.position.y -= hits[0].point.y;
      } else {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        gltf.scene.position.y -= box.min.y;
      }
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(gltf.scene);
    }).catch(e => console.error('[UNTOT] Map-Modell konnte nicht geladen werden:', e))
  );
}

if (ACTIVE_MAP_ID === 'map2') {
  // map1 wurde oben unverändert mitgebaut (garantiert keine Regression für
  // map1) — hier wird sie für map2 nur ausgeblendet und ihre Kollisions-/
  // Interaktions-Daten geleert. Kostet auf map2 unnötig Ladezeit/Speicher;
  // ein sauberes Überspringen bräuchte ein Umbauen der Karte-Sektion in eine
  // aufrufbare Funktion (Scope-Risiko für map1) — offener Punkt in
  // ROADMAP.md Phase 7.
  for (let i = preLevelChildCount; i < scene.children.length; i++) scene.children[i].visible = false;
  colliders.length = 0;
  shootTargets.length = 0;
  interactables.length = 0;
  windows.length = 0;
  doors.length = 0;
  for (const k of Object.keys(doorCenters)) delete doorCenters[k];
} else {
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x1c150e, roughness: 1 });
  for (const s of spawners) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.16, 10), dirtMat);
    d.position.set(s.x, terrainH(s.x, s.z) + 0.09, s.z);
    scene.add(d);
  }
}

// ---------------- Waffen ----------------
// Eingebaute Standardwerte — greifen, falls data/weapons.json fehlt oder
// fehlerhaft ist (siehe loadGameData/applyDataOverrides oben).
const WEAPON_DEFS = {
  pistol:  { name: '.38er Revolver',  dmg: 55,  head: 2.5, rate: 0.3,   mag: 6,  reserve: 60,  auto: false, pellets: 1, spread: 0.006, reload: 1.5 },
  smg:     { name: 'PP-19 Bizon',    dmg: 35,  head: 2.0, rate: 0.075, mag: 64, reserve: 192, auto: true,  pellets: 1, spread: 0.028, reload: 2.2, cost: 1250 },
  shotgun: { name: 'Grabenflinte',   dmg: 24,  head: 1.5, rate: 0.95,  mag: 6,  reserve: 60,  auto: false, pellets: 8, spread: 0.07,  reload: 2.4, cost: 1500 },
  rifle:   { name: 'AK-47',          dmg: 65,  head: 2.2, rate: 0.11,  mag: 30, reserve: 180, auto: true,  pellets: 1, spread: 0.016, reload: 2.0, cost: 2000 },
  magnum:  { name: 'Magnum .357',    dmg: 130, head: 3.0, rate: 0.42,  mag: 6,  reserve: 48,  auto: false, pellets: 1, spread: 0.006, reload: 2.2 },
  mg42:    { name: 'MG-42',          dmg: 40,  head: 1.8, rate: 0.06,  mag: 75, reserve: 300, auto: true,  pellets: 1, spread: 0.035, reload: 3.5 },
  raygun:  { name: 'Strahlenkanone', dmg: 420, head: 1.5, rate: 0.4,   mag: 20, reserve: 160, auto: false, pellets: 1, spread: 0.004, reload: 1.8, energy: true },
};
applyDataOverrides(WEAPON_DEFS, loadGameData('weapons.json'));
const MYSTERY_POOL = [['smg', 16], ['shotgun', 16], ['rifle', 16], ['magnum', 18], ['mg42', 16], ['raygun', 12]];
const WEAPON_COLORS = { smg: 0x4a4e58, shotgun: 0x6a5240, rifle: 0x5a5348, magnum: 0x777c88, mg42: 0x3a3e46, raygun: 0xbb2222, pistol: 0x7a7f8a };

function makeWeapon(key) {
  const def = WEAPON_DEFS[key];
  return { key, def, ammo: def.mag, reserve: def.reserve, mag: def.mag, upgraded: false, reloading: false, reloadT: 0 };
}

// ---------------- Perks ----------------
const PERKS = {
  jugg:   { name: 'Juggernog',   cost: 2500, color: 0xd42a2a, code: 'JG', desc: 'DOPPELTE LEBENSPUNKTE' },
  speed:  { name: 'Speed-Cola',  cost: 3000, color: 0x2ad46a, code: 'SC', desc: 'SCHNELLER NACHLADEN' },
  dtap:   { name: 'Doppel-Hieb', cost: 2000, color: 0xd4a02a, code: 'DH', desc: 'HÖHERE FEUERRATE' },
  stamin: { name: 'Stamin-Up',   cost: 2000, color: 0xd4d42a, code: 'SU', desc: 'SCHNELLER LAUFEN' },
};

const player = {
  pos: new THREE.Vector3(ACTIVE_MAP.playerStart.x, 0, ACTIVE_MAP.playerStart.z),
  vel: new THREE.Vector3(),
  yVel: 0, onGround: true,
  health: 100, maxHealth: 100, lastHit: -99,
  yaw: 0, pitch: 0,
  sprinting: false, sliding: false, slideT: 0, slideCd: 0,
  slideDir: new THREE.Vector3(),
  weapons: [makeWeapon('pistol')], weaponIndex: 0,
  radius: 0.45,
  perks: new Set(),
  grenades: 2,
};
const eyeStand = 1.68, eyeSlide = 0.95;
let eyeHeight = eyeStand;

// Stapelbare Kletter-Kisten (mit Höhen-Offset für Kistentürme)
function addCrateAt(x, y, z, r, s) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.5*s, 1.5*s, 1.5*s), crateMat);
  m.position.set(x, y + 0.75*s, z);
  m.rotation.y = r;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  shootTargets.push(m);
  addBoxCollider(x - 0.75*s, x + 0.75*s, z - 0.75*s, z + 0.75*s, y + 1.5*s);
}

// Kistentürme zum Draufklettern
addCrateAt(-10, 0, -10, 0.2, 1);
addCrateAt(-10, 1.5, -10, 0.5, 1);
addCrateAt(-10, 0, -8.3, -0.1, 1);
addCrateAt(-8.5, 0, -10, 0.4, 1);

addCrateAt(30, 0, 15, 0.7, 1.2);
addCrateAt(32, 0, 14.5, 0.1, 0.8);

addCrateAt(-5, 0, 15, 0.3, 1);

function mergeLevel() {
  // Wichtig: erst alle Welt-Matrizen berechnen, sonst landen Gruppen-Kinder am Nullpunkt
  scene.updateMatrixWorld(true);
  const mats = [wallMat, frameMat, woodMat, floorMat, ceilMat, crateMat];
  const toRemove = [];
  mats.forEach(mat => {
    const geoms = [];
    scene.traverse(o => {
      if (o.isMesh && o.material === mat && !o.userData.dynamic) {
        o.updateMatrixWorld(true);
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        geoms.push(g);
        toRemove.push(o);
      }
    });
    if (geoms.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
      const mergedMesh = new THREE.Mesh(merged, mat);
      mergedMesh.castShadow = true;
      mergedMesh.receiveShadow = true;
      scene.add(mergedMesh);
      shootTargets.push(mergedMesh);
    }
  });
  toRemove.forEach(o => { if(o.parent) o.parent.remove(o); });
}
mergeLevel();

// ---------------- Effekte (GPU Particles) ----------------
const MAX_PARTICLES = 15000;
const particleGeo = new THREE.PlaneGeometry(0.12, 0.12);
const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
const particleInstanced = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(particleInstanced);

const particleColors = new Float32Array(MAX_PARTICLES * 3);
particleInstanced.instanceColor = new THREE.InstancedBufferAttribute(particleColors, 3);
particleInstanced.instanceColor.setUsage(THREE.DynamicDrawUsage);

const pData = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
  pData.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 0 });
  particleInstanced.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
}

let pIndex = 0;
const pDummy = new THREE.Object3D();
const pColor = new THREE.Color();

function spawnParticle(pos, vel, colorHex, life) {
  const p = pData[pIndex];
  p.active = true;
  p.pos.copy(pos);
  p.vel.copy(vel);
  p.life = life;
  p.maxLife = life;
  pColor.setHex(colorHex);
  particleInstanced.setColorAt(pIndex, pColor);
  pIndex = (pIndex + 1) % MAX_PARTICLES;
}

function spawnBlood(point, big = false) {
  const n = big ? 220 : 130;
  for (let i = 0; i < n; i++) {
    const vx = rand(-5, 5), vy = rand(1.5, 9), vz = rand(-5, 5);
    const dark = Math.random() < 0.4;
    spawnParticle(point, new THREE.Vector3(vx, vy, vz), dark ? 0x5a0000 : 0xaa0808, rand(0.35, 1.0));
  }
  // feiner Sprühnebel — kleine, schnelle Tröpfchen für mehr Wucht
  for (let i = 0; i < (big ? 60 : 30); i++) {
    const a = rand(0, Math.PI * 2), s = rand(3, 7);
    spawnParticle(point, new THREE.Vector3(Math.cos(a) * s, rand(0.5, 4), Math.sin(a) * s), 0x7a0505, rand(0.2, 0.45));
  }
}

function spawnSparks(point, normal) {
  for (let i = 0; i < 20; i++) {
    const v = normal.clone().multiplyScalar(rand(2, 6)).add(new THREE.Vector3(rand(-2,2), rand(-2,2), rand(-2,2)));
    spawnParticle(point, v, 0xffaa00, rand(0.15, 0.4));
  }
}

function updateGPU_Particles(dt) {
  let needsUpdate = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = pData[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      pDummy.scale.setScalar(0);
      pDummy.updateMatrix();
      particleInstanced.setMatrixAt(i, pDummy.matrix);
      needsUpdate = true;
      continue;
    }
    p.vel.y -= 15 * dt;
    p.pos.addScaledVector(p.vel, dt);
    
    pDummy.position.copy(p.pos);
    pDummy.scale.setScalar(Math.max(0, p.life / p.maxLife));
    pDummy.rotation.x += dt * 8;
    pDummy.rotation.y += dt * 8;
    pDummy.updateMatrix();
    particleInstanced.setMatrixAt(i, pDummy.matrix);
    needsUpdate = true;
  }
  if(needsUpdate) {
    particleInstanced.instanceMatrix.needsUpdate = true;
    particleInstanced.instanceColor.needsUpdate = true;
  }
}


// ==== REALISTIC FOREST TERRAIN ====
// Terrain-Höhe in Weltkoordinaten (auch für Zombies im Wald)
function terrainH(wx, wz) {
  if (wx > -25 && wx < 65 && wz > -65 && wz < 25) return -0.4;
  const lx = wx - 20, lz = wz + 20;
  let y = (Math.sin(lx * 0.1) * Math.cos(lz * 0.1) * 2.5) + (Math.sin(lx * 0.03 + lz * 0.04) * 5);
  const d = Math.hypot(lx, lz);
  if (d > 60) y += Math.pow((d - 60) / 10, 2.2);
  return y - 0.4;
}

let updateDynamicTrees = () => {}; // wird in buildForest() mit echter Logik belegt

function buildForest() {
  const terrainGeo = new THREE.PlaneGeometry(240, 240, 90, 90);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainH(pos.getX(i) + 20, pos.getZ(i) - 20) + 0.4);
  }
  terrainGeo.computeVertexNormals();
  const dirtMatLocal = new THREE.MeshStandardMaterial({ color: 0x141a14, roughness: 1, metalness: 0 });
  const terrain = new THREE.Mesh(terrainGeo, dirtMatLocal);
  terrain.position.set(20, -0.4, -20); // slightly below bunker floor
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Trees Instanced Mesh
  const MAX_TREES = 800;
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, 5, 7);
  trunkGeo.translate(0, 2.5, 0);
  const leavesGeo = new THREE.ConeGeometry(3.5, 9, 9);
  leavesGeo.translate(0, 7.5, 0);

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x221811, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x0a1c0c, roughness: 0.85 });

  const trunkInstanced = new THREE.InstancedMesh(trunkGeo, barkMat, MAX_TREES);
  const leafInstanced = new THREE.InstancedMesh(leavesGeo, leafMat, MAX_TREES);

  trunkInstanced.receiveShadow = true;
  leafInstanced.receiveShadow = true;
  scene.add(trunkInstanced);
  scene.add(leafInstanced);

  const treeData = [];
  const dummy = new THREE.Object3D();
  let treeCount = 0;
  for(let i=0; i<6000 && treeCount < MAX_TREES; i++) {
    const tx = Math.random() * 220 - 90;
    const tz = Math.random() * 220 - 130;

    let inBunker = (tx > -28 && tx < 68 && tz > -68 && tz < 28);
    if(inBunker) continue;

    // Bäume draußen deutlich kleiner
    const s = 0.2 + Math.random() * 0.28;
    const rx = (Math.random() - 0.5) * 0.2;
    const ry = Math.random() * Math.PI;
    const rz = (Math.random() - 0.5) * 0.2;
    
    treeData.push({ x: tx, y: terrainH(tx, tz), z: tz, rx, ry, rz, s });
    
    dummy.position.set(tx, terrainH(tx, tz), tz);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunkInstanced.setMatrixAt(treeCount, dummy.matrix);
    leafInstanced.setMatrixAt(treeCount, dummy.matrix);
    treeCount++;
  }
  trunkInstanced.count = treeCount;
  leafInstanced.count = treeCount;

  // Portal-Culling für Bäume draußen: Nur rendern was man durch das Fenster sehen kann
  updateDynamicTrees = function() {
    const px = player.pos.x;
    const pz = player.pos.z;
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < treeData.length; i++) {
      const t = treeData[i];
      let visible = false;
      
      // CheckNorth
      if (t.z > 20 && pz < 20) {
        const k = (20 - pz) / (t.z - pz);
        const ix = px + k * (t.x - px);
        if (ix >= -20 && ix <= 60) {
          if ((ix >= -1.25 && ix <= 1.25) || (ix >= 38.75 && ix <= 41.25)) visible = true;
        }
      }
      // CheckSouth
      if (!visible && t.z < -60 && pz > -60) {
        const k = (-60 - pz) / (t.z - pz);
        const ix = px + k * (t.x - px);
        if (ix >= -20 && ix <= 60) {
          if ((ix >= -1.25 && ix <= 1.25) || (ix >= 38.75 && ix <= 41.25)) visible = true;
        }
      }
      // CheckWest
      if (!visible && t.x < -20 && px > -20) {
        const k = (-20 - px) / (t.x - px);
        const iz = pz + k * (t.z - pz);
        if (iz >= -60 && iz <= 20) {
          if ((iz >= -1.25 && iz <= 1.25) || (iz >= -41.25 && iz <= -38.75)) visible = true;
        }
      }
      // CheckEast
      if (!visible && t.x > 60 && px < 60) {
        const k = (60 - px) / (t.x - px);
        const iz = pz + k * (t.z - pz);
        if (iz >= -60 && iz <= 20) {
          if ((iz >= -1.25 && iz <= 1.25) || (iz >= -41.25 && iz <= -38.75)) visible = true;
        }
      }
      
      if (visible) {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(t.rx, t.ry, t.rz);
        dummy.scale.setScalar(t.s);
      } else {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      trunkInstanced.setMatrixAt(i, dummy.matrix);
      leafInstanced.setMatrixAt(i, dummy.matrix);
    }
    
    trunkInstanced.instanceMatrix.needsUpdate = true;
    leafInstanced.instanceMatrix.needsUpdate = true;
  }

  // Rot glühende Augenpaare tief im Wald — als Sprites statt PointLights
  // (80 Punktlichter würden schwache GPUs überfordern; Sprites sind gratis)
  const eyeTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d');
    for (const cx of [18, 46]) {
      const gr = g.createRadialGradient(cx, 16, 1, cx, 16, 12);
      gr.addColorStop(0, 'rgba(255,60,30,1)');
      gr.addColorStop(0.35, 'rgba(220,20,10,0.6)');
      gr.addColorStop(1, 'rgba(120,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(cx - 12, 4, 24, 24);
    }
    return new THREE.CanvasTexture(c);
  })();
  for(let i=0; i<26; i++) {
    const ex = Math.random() * 200 - 80;
    const ez = Math.random() * 200 - 120;
    const dist = Math.hypot(ex-20, ez+20);
    if(dist > 52 && dist < 95) {
      const eyes = new THREE.Sprite(new THREE.SpriteMaterial({
        map: eyeTex, transparent: true, opacity: rand(0.5, 0.9),
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      eyes.scale.set(0.8, 0.4, 1);
      eyes.position.set(ex, terrainH(ex, ez) + rand(1.1, 1.7), ez);
      scene.add(eyes);
    }
  }
}
if (ACTIVE_MAP_ID !== 'map2') buildForest();

// Mondlicht + Sternenhimmel (günstig: ein Richtungslicht, Sprites/Points ohne Nebel)
{
  const moon = new THREE.DirectionalLight(0x8fa3d6, 0.55);
  moon.position.set(90, 60, -140);
  scene.add(moon);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62);
      gr.addColorStop(0, 'rgba(235,240,255,1)');
      gr.addColorStop(0.25, 'rgba(200,215,255,0.85)');
      gr.addColorStop(1, 'rgba(140,160,220,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true, depthWrite: false, fog: false,
  }));
  moonSprite.scale.setScalar(26);
  moonSprite.position.set(110, 70, -170);
  scene.add(moonSprite);
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.12, 1.4), r = 200;
    starPos[i * 3] = 20 + Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = 10 + Math.sin(e) * r * 0.6;
    starPos[i * 3 + 2] = -20 + Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false,
  }));
  scene.add(stars);
}

// update fog for better atmosphere
scene.fog = new THREE.FogExp2(0x010204, 0.02);
scene.background = new THREE.Color(0x010204);

// --- Volumetric Ground Fog ---
const groundFogTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64,64,0, 64,64,64);
  gr.addColorStop(0, 'rgba(110, 120, 130, 0.18)');
  gr.addColorStop(0.5, 'rgba(110, 120, 130, 0.06)');
  gr.addColorStop(1, 'rgba(110, 120, 130, 0)');
  g.fillStyle = gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
})();
const groundFogGroup = new THREE.Group();
scene.add(groundFogGroup);
const groundFogSprites = [];
const groundFogMat = new THREE.SpriteMaterial({ map: groundFogTex, transparent: true, depthWrite: false, fog: true });
for (let i = 0; i < 45; i++) {
  const s = new THREE.Sprite(groundFogMat);
  const x = rand(-25, 65), z = rand(-65, 25), y = rand(0.05, 0.2), scale = rand(15, 25);
  s.position.set(x, y, z);
  s.scale.set(scale, scale * 0.15, 1);
  groundFogGroup.add(s);
  groundFogSprites.push({ mesh: s, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), startY: y, t: rand(0, 100) });
}

// --- Flickering Lights ---
const flickerLights = [];
function addFlickerLight(x, y, z, color, baseIntens, dist) {
  const l = new THREE.PointLight(color, baseIntens, dist, 1.5);
  l.position.set(x, y, z);
  l.castShadow = true; l.shadow.bias = -0.005; l.shadow.mapSize.set(512, 512);
  scene.add(l);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.4, 8), new THREE.MeshStandardMaterial({ emissive: color, emissiveIntensity: 0.8, color: 0x111111 }));
  lamp.position.set(x, y + 0.2, z);
  scene.add(lamp);
  flickerLights.push({ light: l, mat: lamp.material, base: baseIntens, t: rand(0, 100) });
}
// Add 3 flickering lights in different rooms
addFlickerLight(5, 4.2, -5, 0xffa050, 130, 25);
addFlickerLight(35, 4.2, -35, 0xff5040, 160, 30);
addFlickerLight(-10, 4.2, -45, 0x80c0ff, 120, 25);


const state = {
  started: false, paused: false, over: false,
  points: 500, totalPoints: 500, round: 0, kills: 0,
  leftToSpawn: 0, betweenRounds: false, betweenT: 0, spawnT: 0,
  instaT: 0, doubleT: 0,
  shots: 0, hits: 0, headshots: 0,
  bossPending: false, rageApplied: false,
  dogRound: false,
};
const killTimes = [];

function currentWeapon() { return player.weapons[player.weaponIndex]; }
function effRate(w) { return w.def.rate * (player.perks.has('dtap') ? 0.72 : 1); }
function effReload(w) { return w.def.reload * (player.perks.has('speed') ? 0.55 : 1); }

// ---------------- Init & Globals ----------------
const gunMetal = new THREE.MeshStandardMaterial({ color: 0x484e58, metalness: 0.8, roughness: 0.35 });
const gunMetalDark = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.7, roughness: 0.45 });
const gunWood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xa07848, roughness: 0.65 });
const rayBody = new THREE.MeshStandardMaterial({ color: 0x8a1f1f, metalness: 0.65, roughness: 0.3 });
gunMetal.envMapIntensity = 0.8;
gunMetalDark.envMapIntensity = 0.6;
gunWood.envMapIntensity = 0.3;
rayBody.envMapIntensity = 0.8;
const glowGreen = new THREE.MeshBasicMaterial({ color: 0x39ff6a });

// Echte Waffen-Modelle (aus USDZ konvertiert & Draco-komprimiert): werden asynchron
// geladen und ersetzen die prozeduralen Boxen, sobald verfügbar.
const weaponAssets = {};
const WEAPON_MODEL_FILES = { pistol: 'revolver', rifle: 'ak47', smg: 'smg' };
const WEAPON_MODEL_LEN = { pistol: 0.3, rifle: 0.85, smg: 0.58 }; // Ziel-Länge in Metern
const WEAPON_MODEL_ROT = { pistol: [0, 0, 0], rifle: [0, Math.PI, 0], smg: [0, Math.PI, 0] };
const WEAPON_MODEL_OFFSET = { pistol: [0, 0, 0], rifle: [0, 0, 0], smg: [0, 0, 0] };
const weaponDraco = new DRACOLoader();
weaponDraco.setDecoderPath('vendor/three/examples/jsm/libs/draco/');
const weaponLoader = new GLTFLoader();
weaponLoader.setDRACOLoader(weaponDraco);
for (const key in WEAPON_MODEL_FILES) {
  weaponLoader.loadAsync('assets/weapons/' + WEAPON_MODEL_FILES[key] + '.glb').then(g => {
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    weaponAssets[key] = { scene: g.scene, scale: WEAPON_MODEL_LEN[key] / maxDim, center };
    if (currentWeapon() && currentWeapon().key === key) buildViewmodel();
  }).catch(e => console.warn('[UNTOT] Waffenmodell fehlt:', key, e));
}

const gunGroup = new THREE.Group();
camera.add(gunGroup);
const muzzleLight = new THREE.PointLight(0xffc060, 0, 9, 1.5);
muzzleLight.castShadow = true;
muzzleLight.shadow.bias = -0.002;
muzzleLight.shadow.mapSize.set(512, 512);
scene.add(muzzleLight);
let muzzleFlash;

function vmBox(mat, w, h, d, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  gunGroup.add(m);
  return m;
}
function vmCyl(mat, r, len, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.set(x, y, z);
  m.rotation.x = Math.PI / 2;
  gunGroup.add(m);
  return m;
}

function buildViewmodel() {
  gunGroup.clear();
  const w = currentWeapon();
  let muzzleZ = -0.5;

  const asset = weaponAssets[w.key];
  if (asset) {
    // Echtes Modell: normalisieren (Größe + Zentrierung) und ins Blickfeld setzen
    const model = asset.scene.clone();
    model.scale.setScalar(asset.scale);
    model.position.set(
      -asset.center.x * asset.scale + WEAPON_MODEL_OFFSET[w.key][0],
      -asset.center.y * asset.scale + WEAPON_MODEL_OFFSET[w.key][1],
      -asset.center.z * asset.scale + WEAPON_MODEL_OFFSET[w.key][2]
    );
    const rot = WEAPON_MODEL_ROT[w.key];
    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.rotation.set(rot[0], rot[1], rot[2]);
    wrap.traverse(o => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        if (o.material) { o.material.envMapIntensity = 0.6; o.material.roughness = Math.min(o.material.roughness ?? 0.5, 0.6); }
      }
    });
    gunGroup.add(wrap);
    muzzleZ = -WEAPON_MODEL_LEN[w.key] * 0.72;
  } else if (w.key === 'pistol') {
    vmBox(gunMetalDark, 0.05, 0.075, 0.3, 0, -0.01, -0.16);
    vmBox(gunMetal, 0.055, 0.05, 0.32, 0, 0.045, -0.17);
    vmCyl(gunMetal, 0.014, 0.05, 0, 0.045, -0.35);
    vmBox(gunWood, 0.048, 0.15, 0.075, 0, -0.09, -0.03, 0.22);
    vmBox(gunMetal, 0.02, 0.03, 0.02, 0, 0.05, -0.01);
    vmBox(gunMetal, 0.008, 0.02, 0.01, 0, 0.08, -0.32);
    muzzleZ = -0.4;
  } else if (w.key === 'smg') {
    vmCyl(gunMetal, 0.035, 0.5, 0, 0.02, -0.3);
    vmCyl(gunMetalDark, 0.016, 0.22, 0, 0.02, -0.63);
    vmBox(gunMetalDark, 0.035, 0.22, 0.06, 0, -0.1, -0.33, 0.06);
    vmBox(gunWood, 0.045, 0.13, 0.07, 0, -0.09, -0.02, 0.2);
    vmBox(gunMetalDark, 0.03, 0.02, 0.26, 0, 0.01, 0.15);
    vmBox(gunMetalDark, 0.06, 0.06, 0.02, 0, -0.02, 0.28);
    vmBox(gunMetal, 0.008, 0.025, 0.01, 0, 0.07, -0.55);
    muzzleZ = -0.76;
  } else if (w.key === 'shotgun') {
    vmCyl(gunMetal, 0.017, 0.7, 0, 0.03, -0.45);
    vmCyl(gunMetalDark, 0.014, 0.6, 0, -0.01, -0.4);
    vmCyl(gunWood, 0.028, 0.16, 0, -0.01, -0.52);
    vmBox(gunMetalDark, 0.05, 0.07, 0.2, 0, 0.01, -0.1);
    vmBox(gunWood, 0.045, 0.09, 0.28, 0, -0.045, 0.13, 0.13);
    vmBox(gunMetal, 0.008, 0.02, 0.01, 0, 0.075, -0.78);
    muzzleZ = -0.82;
  } else if (w.key === 'magnum') {
    vmBox(gunMetal, 0.05, 0.07, 0.26, 0, 0, -0.13);
    vmCyl(gunMetal, 0.013, 0.32, 0, 0.03, -0.33);
    vmCyl(gunMetalDark, 0.032, 0.07, 0, 0, -0.1);
    vmBox(gunWood, 0.048, 0.14, 0.07, 0, -0.09, -0.01, 0.28);
    vmBox(gunMetal, 0.02, 0.03, 0.02, 0, 0.045, 0.0);
    vmBox(gunMetal, 0.008, 0.025, 0.01, 0, 0.06, -0.46);
    muzzleZ = -0.5;
  } else if (w.key === 'mg42') {
    vmBox(gunMetal, 0.06, 0.09, 0.5, 0, 0, -0.25);
    vmCyl(gunMetalDark, 0.035, 0.55, 0, 0.02, -0.62);
    vmCyl(gunMetalDark, 0.015, 0.1, 0, 0.02, -0.93);
    vmBox(gunMetalDark, 0.07, 0.03, 0.3, 0, 0.065, -0.2);
    vmBox(gunMetalDark, 0.08, 0.12, 0.05, -0.05, -0.06, -0.25);
    vmBox(gunWood, 0.045, 0.12, 0.07, 0, -0.1, -0.02, 0.25);
    vmBox(gunWood, 0.05, 0.09, 0.22, 0, -0.03, 0.16, 0.1);
    vmBox(gunMetalDark, 0.012, 0.14, 0.012, -0.03, -0.1, -0.7, 0.4);
    vmBox(gunMetalDark, 0.012, 0.14, 0.012, 0.03, -0.1, -0.7, 0.4);
    muzzleZ = -0.99;
  } else if (w.key === 'raygun') {
    vmCyl(rayBody, 0.045, 0.3, 0, 0, -0.16);
    vmCyl(gunMetalDark, 0.02, 0.26, 0, 0, -0.42);
    vmBox(glowGreen, 0.105, 0.02, 0.02, 0, 0, -0.28);
    vmBox(glowGreen, 0.105, 0.02, 0.02, 0, 0, -0.35);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), glowGreen);
    tip.position.set(0, 0, -0.56);
    gunGroup.add(tip);
    vmBox(gunMetalDark, 0.04, 0.13, 0.06, 0, -0.1, -0.02, 0.25);
    vmBox(rayBody, 0.03, 0.05, 0.12, 0, 0.06, -0.1);
    muzzleZ = -0.56;
  } else { // rifle
    vmBox(gunMetal, 0.055, 0.08, 0.34, 0, 0.01, -0.2);
    vmBox(gunWood, 0.05, 0.055, 0.22, 0, 0.02, -0.42);
    vmCyl(gunMetalDark, 0.015, 0.3, 0, 0.03, -0.66);
    vmBox(gunMetalDark, 0.04, 0.13, 0.06, 0, -0.1, -0.26, 0.35);
    vmBox(gunMetalDark, 0.04, 0.11, 0.055, 0, -0.19, -0.31, 0.7);
    vmBox(gunWood, 0.045, 0.1, 0.3, 0, -0.04, 0.13, 0.12);
    vmBox(gunWood, 0.045, 0.12, 0.07, 0, -0.1, -0.06, 0.25);
    vmBox(gunMetal, 0.008, 0.03, 0.01, 0, 0.09, -0.6);
    muzzleZ = -0.82;
  }

  if (w.upgraded) {
    vmBox(glowMat, 0.062, 0.008, 0.2, 0, 0.055, -0.2);
    vmBox(glowMat, 0.008, 0.06, 0.05, 0.032, 0, -0.08);
  }

  muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  muzzleFlash.position.set(0, 0.02, muzzleZ - 0.1);
  gunGroup.add(muzzleFlash);
  const mf2 = muzzleFlash.clone();
  mf2.rotation.y = Math.PI / 2;
  muzzleFlash.add(mf2);

  gunGroup.position.set(0.26, -0.24, -0.45);
}

buildViewmodel();

// Messer (eingeblendet beim Zustechen)
const knifeGroup = new THREE.Group();
{
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.9, roughness: 0.2 }));
  blade.position.z = -0.22;
  knifeGroup.add(blade);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.12), gunMetalDark);
  handle.position.z = -0.04;
  knifeGroup.add(handle);
  knifeGroup.visible = false;
  camera.add(knifeGroup);
}

// ---------------- Sound-Engine (Asset-Based) ----------------
let audioListener = null;
const sfxBuffers = {};

// Ordnet jeder Waffe das tatsächlich vorhandene Sound-Datei-Präfix zu.
// Ohne diese Zuordnung suchen z.B. 'pistol' oder 'rifle' nach nicht existierenden
// Dateien wie 'pistol_shoot_*' (statt 'revolver_shoot_*') und bleiben stumm.
// Waffen ohne eigene Aufnahmen (smg, magnum, raygun) bekommen ein klanglich
// passendes Ersatz-Set, damit keine Waffe komplett ohne Sound dasteht.
const WEAPON_SOUND_FILES = {
  pistol: 'revolver',
  rifle: 'ak47',
  shotgun: 'shotgun',
  mg42: 'mg42',
  smg: 'ak47',
  magnum: 'revolver',
  raygun: 'mg42',
};

function initAudio() {
  if (audioListener) return;
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);
  audioListener.setMasterVolume(SETTINGS.volume);
}

function getBuffer(prefix) {
  const keys = Object.keys(sfxBuffers);
  const matching = keys.filter(k => k.startsWith(prefix));
  if (matching.length === 0) return null;
  return sfxBuffers[matching[Math.floor(Math.random() * matching.length)]];
}

function play2D(prefix, vol = 1.0, loop = false) {
  if (!audioListener) return null;
  const buffer = getBuffer(prefix);
  if (!buffer) return null;
  const sound = new THREE.Audio(audioListener);
  sound.setBuffer(buffer);
  sound.setVolume(vol);
  sound.setLoop(loop);
  sound.play();
  return sound;
}

function play3D(prefix, x, z, vol = 1.0, refDist = 4, maxDist = 30) {
  if (!audioListener) return null;
  const buffer = getBuffer(prefix);
  if (!buffer) return null;
  const sound = new THREE.PositionalAudio(audioListener);
  sound.setBuffer(buffer);
  sound.setRefDistance(refDist);
  sound.setMaxDistance(maxDist);
  sound.setVolume(vol);
  
  const dummy = new THREE.Object3D();
  dummy.position.set(x, 1, z);
  scene.add(dummy);
  dummy.add(sound);
  sound.play();
  sound.onEnded = () => { sound.isPlaying = false; scene.remove(dummy); };
  return sound;
}

// Fallbacks so old tone/noiseHit calls don't crash
function tone() {}
function noiseHit() {}
function playTone() {}
function playDrip() {}
function playZap() {}

function playShot(w) { play2D((WEAPON_SOUND_FILES[w.key] || w.key) + '_shoot_', 1.0); }
function playFootstep(sprint) { play2D('footstep_concrete_', sprint ? 0.8 : 0.4); }

let heartbeatSound = null;
function playHeartbeat() {
  if (!heartbeatSound || !heartbeatSound.isPlaying) heartbeatSound = play2D('player_heartbeat', 1.0);
}

function playGroan(x, z) {
  const d = Math.hypot(x - player.pos.x, z - player.pos.z);
  if (d < 10) play3D('zombie_chase_', x, z, 1.0, 3, 20);
  else play3D('zombie_idle_', x, z, 0.7, 3, 25);
}
function playAttack(x, z) { play3D('zombie_attack_', x, z, 1.0, 4, 15); }
function playDeath(x, z, headshot = false) {
  if (headshot) play3D('zombie_headshot_', x, z, 1.0, 5, 20);
  play3D('zombie_death_', x, z, 1.0, 5, 25);
}

const sfx = {
  buy: () => play2D('points_pickup_'),
  deny: () => play2D('error_buzzer'),
  hit: () => play2D('bullet_hit_flesh_'),
  kill: () => {}, 
  reload: () => {
    const w = currentWeapon();
    if (w) {
      if (w.key === 'shotgun') play2D('shotgun_pump');
      else play2D((WEAPON_SOUND_FILES[w.key] || w.key) + '_reload');
    }
  },
  round: () => play2D('round_start'),
  roundEnd: () => play2D('round_end'),
  hurt: () => play2D('player_damage_'),
  upgrade: () => play2D('powerup_pickup'),
  perk: () => play2D('perk_drink'),
  powerup: () => play2D('powerup_pickup'),
  multikill: () => {},
  knife: () => play2D('zombie_attack_'), 
  squelch: () => play2D('bullet_hit_flesh_'),
  explosion: () => play3D('shotgun_shoot_', player.pos.x, player.pos.z, 2.0, 30),
  boxJingle: () => play2D('mysterybox_spin_loop')
};

let ambientSound = null;
function startAmbient() {
  initAudio();
  if (ambientSound || !SETTINGS.ambient) return;
  // ambientSound = play2D('powerup_loop', 0.1, true); 
}
function stopAmbient() {
  if (ambientSound) {
    if (ambientSound.isPlaying) ambientSound.stop();
    ambientSound = null;
  }
}

// ---------------- Zombies (GLTF) ----------------
// ---------------- Zombies (GLTF & Mixamo) ----------------
let zAssets = {}, assetsLoaded = false;
const FACING = 0;

const animList = ['tpose', 'idle', 'walk', 'run', 'attack', 'death', 'dying', 'scream', 'crawl', 'crawlrun',
  'bite', 'neckbite', 'standup', 'hit', 'stumble', 'turn', 'kick', 'punch', 'headbutt'];
let loadedAnims = 0;

ui.cta.textContent = 'LADE ASSETS...';
const draco = new DRACOLoader();
draco.setDecoderPath('vendor/three/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

const soundFiles = ["ak47_reload.mp3", "ak47_shoot_1.mp3", "ak47_shoot_2.mp3", "ak47_shoot_3.mp3", "ak47_shoot_4.mp3", "announcer_dogs.mp3", "announcer_doublepoints.mp3", "announcer_instakill.mp3", "announcer_maxammo.mp3", "barricade_break_1.mp3", "barricade_break_2.mp3", "barricade_break_3.mp3", "barricade_repair_1.mp3", "barricade_repair_2.mp3", "barricade_repair_3.mp3", "bullet_hit_concrete_1.mp3", "bullet_hit_concrete_2.mp3", "bullet_hit_concrete_3.mp3", "bullet_hit_concrete_4.mp3", "bullet_hit_concrete_5.mp3", "bullet_hit_flesh_1.mp3", "bullet_hit_flesh_2.mp3", "bullet_hit_flesh_3.mp3", "bullet_hit_flesh_4.mp3", "bullet_hit_flesh_5.mp3", "bullet_hit_wood_1.mp3", "bullet_hit_wood_2.mp3", "bullet_hit_wood_3.mp3", "bullet_hit_wood_4.mp3", "bullet_hit_wood_5.mp3", "buy_door_1.mp3", "buy_door_2.mp3", "error_buzzer.mp3", "footstep_concrete_1.mp3", "footstep_concrete_2.mp3", "footstep_concrete_3.mp3", "footstep_concrete_4.mp3", "footstep_concrete_5.mp3", "footstep_concrete_6.mp3", "footstep_concrete_7.mp3", "footstep_concrete_8.mp3", "mg42_shoot_1.mp3", "mg42_shoot_2.mp3", "mg42_shoot_3.mp3", "mg42_shoot_4.mp3", "mysterybox_close.mp3", "mysterybox_open.mp3", "mysterybox_spin_loop.mp3", "perk_drink.mp3", "player_damage_1.mp3", "player_damage_2.mp3", "player_damage_3.mp3", "player_heartbeat.mp3", "player_sprint_breath_loop.mp3", "points_pickup_1.mp3", "points_pickup_2.mp3", "points_pickup_3.mp3", "points_pickup_4.mp3", "powerup_loop.mp3", "powerup_pickup.mp3", "revolver_reload.mp3", "revolver_shoot_1.mp3", "revolver_shoot_2.mp3", "revolver_shoot_3.mp3", "round_end.mp3", "round_start.mp3", "shotgun_pump.mp3", "shotgun_shoot_1.mp3", "shotgun_shoot_2.mp3", "shotgun_shoot_3.mp3", "zombie_attack_1.mp3", "zombie_attack_2.mp3", "zombie_attack_3.mp3", "zombie_attack_4.mp3", "zombie_attack_5.mp3", "zombie_chase_1.mp3", "zombie_chase_2.mp3", "zombie_chase_3.mp3", "zombie_chase_4.mp3", "zombie_chase_5.mp3", "zombie_chase_6.mp3", "zombie_death_1.mp3", "zombie_death_2.mp3", "zombie_death_3.mp3", "zombie_death_4.mp3", "zombie_death_5.mp3", "zombie_headshot_1.mp3", "zombie_headshot_2.mp3", "zombie_headshot_3.mp3", "zombie_headshot_4.mp3", "zombie_hit_1.mp3", "zombie_hit_2.mp3", "zombie_hit_3.mp3", "zombie_hit_4.mp3", "zombie_hit_5.mp3", "zombie_idle_1.mp3", "zombie_idle_2.mp3", "zombie_idle_3.mp3", "zombie_idle_4.mp3", "zombie_idle_5.mp3", "zombie_idle_6.mp3", "zombie_idle_7.mp3", "zombie_idle_8.mp3"];

const audioLoader = new THREE.AudioLoader();
const audioPromises = soundFiles.map(file => 
  audioLoader.loadAsync('assets/sounds/' + file)
    .then(buffer => { sfxBuffers[file.replace('.mp3', '')] = buffer; })
);

Promise.all([
  ...animList.map(name =>
    loader.loadAsync('assets/zombie/' + name + '.glb')
      .then(g => { zAssets[name] = g; })
  ),
  ...audioPromises,
  ...mapModelPromises
]).catch(e => console.error("Error loading assets", e))
  .finally(() => {
    assetsLoaded = true;
    ui.cta.textContent = '▶ KLICKEN ZUM STARTEN';
  });


const zombies = [];
const zombieGroup = new THREE.Group();
scene.add(zombieGroup);
const corpseGroup = new THREE.Group();
scene.add(corpseGroup);
const hitboxGroup = new THREE.Group();
scene.add(hitboxGroup);

const hbMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const hbHeadGeo = new THREE.BoxGeometry(0.34, 0.38, 0.34);
const hbBodyGeo = new THREE.BoxGeometry(0.55, 0.9, 0.45);
const shadowGeo = new THREE.CircleGeometry(0.55, 12);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });

// rotes Augen-Glühen
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,40,20,0.9)');
  gr.addColorStop(0.4, 'rgba(200,20,10,0.35)');
  gr.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
})();
const glowSpriteMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

const glowYellowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,20,0.95)');
  gr.addColorStop(0.4, 'rgba(220,190,10,0.4)');
  gr.addColorStop(1, 'rgba(120,90,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glowYellowSpriteMat = new THREE.SpriteMaterial({ map: glowYellowTex, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });

const skinColors = [0x6a8a5a, 0x7a9a6a, 0x8aa070, 0x5a7a52];
const shirtColors = [0x4a3a3a, 0x3a3a4a, 0x52402e, 0x2e4038, 0x443044];

function makeBoxZombieVisual() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColors[Math.random() * skinColors.length | 0] });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColors[Math.random() * shirtColors.length | 0] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirt);
  torso.position.y = 1.16; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
  head.position.y = 1.78; g.add(head);
  const armGeo = new THREE.BoxGeometry(0.16, 0.16, 0.62);
  const armL = new THREE.Mesh(armGeo, skin); armL.position.set(-0.42, 1.38, -0.3);
  const armR = new THREE.Mesh(armGeo, skin); armR.position.set(0.42, 1.38, -0.3);
  g.add(armL, armR);
  const legGeo = new THREE.BoxGeometry(0.22, 0.78, 0.24);
  const legL = new THREE.Mesh(legGeo, pants); legL.position.set(-0.17, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, pants); legR.position.set(0.17, 0.39, 0);
  g.add(legL, legR);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { model: g, animParts: { legL, legR, armL, armR }, mats: [skin, shirt, pants] };
}

let zombieMat = null;
function getZombieMaterial() {
  if (zombieMat) return zombieMat;
  const S = 1024;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  const ctx = cvs.getContext('2d');

  // Fahle, ungleichmäßig verfärbte Totenhaut als Grundlage (kein einheitliches Grün)
  const base = ctx.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#7a8264');
  base.addColorStop(0.45, '#5c6a4e');
  base.addColorStop(0.7, '#8a7462');
  base.addColorStop(1, '#4a5142');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Großflächige Verfärbungs-Flecken (Verwesung, Leichenflecken)
  for (let i = 0; i < 26; i++) {
    const x = rand(0, S), y = rand(0, S), r = rand(40, 140);
    const grd = ctx.createRadialGradient(x, y, 2, x, y, r);
    const dark = Math.random() < 0.5;
    grd.addColorStop(0, dark ? 'rgba(30,45,25,0.5)' : 'rgba(120,70,50,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Feines Hautkorn / Poren
  for (let i = 0; i < 60000; i++) {
    const v = rand(-18, 18);
    ctx.fillStyle = `rgba(${v > 0 ? 20 : 0},${Math.abs(v)},0,${rand(0.03, 0.1)})`;
    ctx.fillRect(rand(0, S), rand(0, S), 2, 2);
  }

  // Offene Wunden: dunkelroter Rand, tiefschwarzes Zentrum
  for (let i = 0; i < 34; i++) {
    const x = rand(0, S), y = rand(0, S), r = rand(6, 26);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(15,2,2,0.95)');
    grd.addColorStop(0.4, 'rgba(90,10,10,0.9)');
    grd.addColorStop(0.75, 'rgba(120,25,20,0.5)');
    grd.addColorStop(1, 'rgba(120,25,20,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * rand(0.6, 1), rand(0, Math.PI), 0, Math.PI * 2); ctx.fill();
  }

  // Freigelegtes Muskelfleisch an ausgefransten Rändern
  for (let i = 0; i < 16; i++) {
    const x = rand(0, S), y = rand(0, S), r = rand(14, 46);
    ctx.fillStyle = `rgba(${rand(110, 160) | 0},${rand(15, 35) | 0},${rand(15, 30) | 0},${rand(0.55, 0.85)})`;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = r * rand(0.6, 1.15);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  // Geplatzte Adern
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(${rand(20, 60) | 0},0,0,${rand(0.2, 0.5)})`;
    ctx.lineWidth = rand(0.5, 1.8);
    ctx.beginPath();
    let x = rand(0, S), y = rand(0, S);
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += rand(-20, 20); y += rand(-20, 20); ctx.lineTo(x, y); }
    ctx.stroke();
  }

  // Dreck- und Rußstreifen
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = `rgba(15,12,8,${rand(0.15, 0.4)})`;
    ctx.lineWidth = rand(3, 10);
    ctx.beginPath();
    let x = rand(0, S), y = rand(0, S);
    ctx.moveTo(x, y);
    for (let j = 0; j < 3; j++) { x += rand(-60, 60); y += rand(-60, 60); ctx.lineTo(x, y); }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // Passende Normal-Map aus der Helligkeit ableiten — Wunden wirken vertieft, Muskeln erhaben
  const norm = normalMapFromHeight(S, (g2, s) => {
    g2.drawImage(cvs, 0, 0, s, s);
    g2.fillStyle = 'rgba(128,128,128,0.55)';
    g2.fillRect(0, 0, s, s);
  }, 1.8);

  zombieMat = new THREE.MeshStandardMaterial({
    map: tex,
    normalMap: norm,
    roughness: 0.95,
    metalness: 0.03,
  });
  return zombieMat;
}

// Hellhund: niedriger schwarzer Höllenhund mit Glutaugen
function makeDogVisual() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, emissive: 0x2a0400 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1.1), bodyMat);
  body.position.y = 0.5;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.4), bodyMat);
  head.position.set(0, 0.7, -0.65);
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
  const legs = [];
  for (const [lx, lz] of [[-0.18, -0.4], [0.18, -0.4], [-0.18, 0.4], [0.18, 0.4]]) {
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.set(lx, 0.25, lz);
    g.add(leg); legs.push(leg);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat);
  eye1.position.set(0.1, 0.05, -0.2);
  const eye2 = eye1.clone();
  eye2.position.set(-0.1, 0.05, -0.2);
  head.add(eye1, eye2);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { model: g, animParts: { legs }, mats: [bodyMat], headBone: head };
}

// Automatische Normierung: Modell exakt auf Menschengröße bringen,
// egal in welcher Einheit das GLB exportiert wurde (Plug & Play)
let zombieNormScale = 0;
function getZombieNormScale(model) {
  if (!zombieNormScale) {
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    zombieNormScale = (h > 0.01) ? 1.85 / h : 1;
    console.log('[UNTOT] Zombie-Modell Höhe:', h.toFixed(2), '→ Skalierung', zombieNormScale.toFixed(3));
  }
  return zombieNormScale;
}

function makeZombieVisual(isDog, isBoss) {
  if (isDog) return makeDogVisual();
  if (!zAssets.tpose) {
    // Fallback, falls Assets fehlen
    const v = makeBoxZombieVisual();
    if (isBoss) v.model.scale.setScalar(1.4);
    return v;
  }

  // Echter Mixamo-Zombie mit allen Animationen
  const model = cloneSkeleton(zAssets.tpose.scene);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  animList.forEach(name => {
    if (name === 'tpose') return;
    if (zAssets[name] && zAssets[name].animations.length > 0) {
      actions[name] = mixer.clipAction(zAssets[name].animations[0]);
    }
  });

  // Original-Texturen behalten, nur pro Zombie leicht verfärben (Verwesungs-Varianz)
  const mats = [];
  let hasTexture = false;
  const tint = isBoss
    ? new THREE.Color(1.15, 0.62, 0.55) // Boss: blutrot angelaufen
    : new THREE.Color().setHSL(rand(0.16, 0.32), rand(0.1, 0.3), rand(0.45, 0.62)).multiplyScalar(1.15);
  model.traverse(c => {
    if (c.isMesh) {
      // "Beta_Joints" ist ein Mixamo-Rigging-Debug-Overlay, das die Haut fast
      // deckungsgleich doppelt — führt zu Flackern. Wird nicht gerendert.
      if (c.name === 'Beta_Joints') { c.visible = false; return; }
      c.castShadow = true;
      c.receiveShadow = true;
      c.material = c.material.clone();
      if (c.material.map) hasTexture = true;
      c.material.color.multiply(tint);
      if (c.material.roughness !== undefined) c.material.roughness = 0.85;
      if (c.material.envMapIntensity !== undefined) c.material.envMapIntensity = 0.15;
      // Skinned Mesh: Standard-Bounding-Box wächst bei Animation nicht mit.
      // Statt Culling komplett abzuschalten (rendert dann jeden Zombie
      // immer, auch außerhalb des Sichtfelds): Bounding-Sphere einmalig
      // berechnen und künstlich vergrößern, damit sie animierte Posen
      // sicher abdeckt, Culling aber aktiv bleibt (spart Draw-Calls für
      // Zombies außerhalb der Kamera).
      if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
      c.geometry.boundingSphere.radius *= 1.5;
      c.frustumCulled = true;
      mats.push(c.material);
    }
  });
  if (!hasTexture) {
    // Modell ohne Textur (nackter Mixamo-Rig-Body) → prozedurale Verwesungshaut,
    // pro Zombie geklont, damit Treffer-Aufblitzen nicht alle gleichzeitig betrifft
    mats.length = 0;
    const zm = getZombieMaterial();
    model.traverse(c => {
      if (c.isMesh && c.visible) {
        c.material = zm.clone();
        c.material.color.multiply(tint);
        mats.push(c.material);
      }
    });
  }

  const base = getZombieNormScale(model) * 3.5 * rand(0.94, 1.05);
  model.scale.setScalar(base * (isBoss ? 1.4 : 1));

  let headBone = null, spineBone = null;
  model.traverse(c => {
    if (c.isBone) {
      const n = c.name.toLowerCase();
      if (!headBone && n.includes('head') && !n.includes('top')) headBone = c;
      if (!spineBone && n.includes('spine2')) spineBone = c;
    }
  });
  if (!spineBone) model.traverse(c => {
    if (c.isBone && !spineBone && c.name.toLowerCase().includes('spine')) spineBone = c;
  });

  return { model, mixer, actions, headBone, spineBone, mats };
}

function zombieHp(round) {
  let hp = 100 + (round - 1) * 55;
  if (round > 9) hp *= Math.pow(1.08, round - 9);
  return hp;
}

// Eingebaute Standardwerte für Zombie-Stats — greifen, falls
// data/zombies.json fehlt oder fehlerhaft ist.
const ZOMBIE_DEFS = {
  normal: {
    health: { round1: 150, perRoundIncrement: 100, lateGameStartRound: 9, lateGameBase: 950, lateGameGrowth: 1.1 },
    speed: { min: 1.15, max: 1.6, perRound: 0.045, cap: 2.3 },
    runnerSpeed: { min: 3.15, max: 3.85 },
    runnerChance: { base: 0.05, perRound: 0.06, max: 0.65 },
    damage: 22,
    attackCooldown: 1.15,
  },
  dog: {
    health: { base: 60, perRound: 10 },
    speed: { min: 6.0, max: 7.5 },
    damage: 22,
    attackCooldown: 1.0,
  },
  boss: {
    healthMultiplier: 6,
    speed: { min: 1.4, max: 1.7 },
    damage: 45,
    attackCooldown: 1.15,
  },
};
applyDataOverrides(ZOMBIE_DEFS, loadGameData('zombies.json'));

function getZombieHealth(round) {
  const h = ZOMBIE_DEFS.normal.health;
  if (round === 1) return h.round1;
  if (round <= h.lateGameStartRound) return h.round1 + (round - 1) * h.perRoundIncrement;
  return h.lateGameBase * Math.pow(h.lateGameGrowth, round - h.lateGameStartRound);
}

function getZombieSpeed(round, isDog) {
  if (isDog) return ZOMBIE_DEFS.dog.speed.min;
  return 1.4 + (round * 0.05);
}

// Natürliche Clip-Geschwindigkeiten der Mixamo-Animationen (m/s bzw. Faktor)
const ANIM_BASE_SPEED = { walk: 1.1, run: 3.8, crawl: 0.8, crawlrun: 1.6 };
const CORPSE_LIFETIME = 15; // Sekunden, bevor Leichen einsinken & despawnen

function spawnZombie() {
  const pZone = zoneAt(player.pos.x, player.pos.z);
  let pool = spawners.filter(s => s.zone === pZone && zones[s.zone].unlocked);
  if (!pool.length || Math.random() < 0.35) pool = spawners.filter(s => zones[s.zone].unlocked);
  const sp = pool[Math.random() * pool.length | 0];

  const isDog = state.dogRound;
  const isBoss = !isDog && state.bossPending;
  if (isBoss) state.bossPending = false;
  const rc = ZOMBIE_DEFS.normal.runnerChance;
  const runnerChance = clamp(rc.base + state.round * rc.perRound, 0, rc.max);
  const isRunner = isDog ? true : (!isBoss && Math.random() < runnerChance);
  // Leicht reduziertes Tempo gegenüber früher (bessere Lesbarkeit im Kampf)
  const nSpeed = ZOMBIE_DEFS.normal.speed, rSpeed = ZOMBIE_DEFS.normal.runnerSpeed;
  const speed = isDog ? rand(ZOMBIE_DEFS.dog.speed.min, ZOMBIE_DEFS.dog.speed.max)
    : isBoss ? rand(ZOMBIE_DEFS.boss.speed.min, ZOMBIE_DEFS.boss.speed.max)
    : (isRunner ? rand(rSpeed.min, rSpeed.max) : Math.min(nSpeed.cap, rand(nSpeed.min, nSpeed.max) + state.round * nSpeed.perRound));

  // Hunde teleportieren sich in Spielernähe in die Karte (Blitz + Glut)
  let pos;
  if (isDog) {
    pos = new THREE.Vector3(player.pos.x, 0, player.pos.z);
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, Math.PI * 2), d = rand(9, 15);
      const cx = clamp(player.pos.x + Math.cos(a) * d, -18, 58);
      const cz = clamp(player.pos.z + Math.sin(a) * d, -58, 18);
      if (zones[zoneAt(cx, cz)].unlocked && Math.hypot(cx - player.pos.x, cz - player.pos.z) > 7) {
        pos = new THREE.Vector3(cx, 0, cz);
        break;
      }
    }
    for (let i = 0; i < 40; i++) {
      spawnParticle(new THREE.Vector3(pos.x, 0.4, pos.z),
        new THREE.Vector3(rand(-2, 2), rand(2, 7), rand(-2, 2)),
        Math.random() > 0.4 ? 0xff4400 : 0x331111, rand(0.3, 0.8));
    }
    tone(900, 60, 0.5, 0.2, 'sawtooth', panVol(pos.x, pos.z).pan, 0.7);
  } else {
    pos = new THREE.Vector3(sp.x + rand(-0.8, 0.8), 0, sp.z + rand(-0.8, 0.8));
  }

  // Nächstgelegenes Fenster als Einstiegspunkt
  let nearestW = null, minDist = 999;
  for(const w of windows) {
    const d = Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z);
    if(d < minDist) { minDist = d; nearestW = w; }
  }

  const visual = makeZombieVisual(isDog, isBoss);
  const group = new THREE.Group();
  group.add(visual.model);

  const z = { isBoss, isDog, group, model: visual.model, mixer: visual.mixer || null, actions: visual.actions || null,
    headBone: visual.headBone || null, spineBone: visual.spineBone || null,
    animParts: visual.animParts || null, mats: visual.mats || [],
    hp: isDog ? ZOMBIE_DEFS.dog.health.base + state.round * ZOMBIE_DEFS.dog.health.perRound
      : getZombieHealth(state.round) * (isBoss ? ZOMBIE_DEFS.boss.healthMultiplier : 1),
    speed, isRunner, isCrawler: false,
    state: isDog ? 'chase' : 'rise', riseT: 0, deadT: 0, flashT: 0, flashOn: false,
    attackCd: rand(0, 0.5), animT: rand(0, 10), pos: new THREE.Vector3().copy(pos),
    win: isDog ? null : nearestW, climbing: false, climbT: 0, climbStart: null, climbEnd: null,
    curAnim: null, staggerT: 0, lungeT: 0, attackAnimT: 0, hitDelay: -1,
    raged: false, headTilt: rand(-0.35, 0.35), swayPhase: rand(0, 10),
    // Geglättete Bewegungsrichtung (Turn-Rate-limitiert), siehe updateZombieFSM —
    // verhindert ruckartige Sprünge, wenn sich das Ziel abrupt ändert (z.B.
    // Fenster ↔ Spieler ↔ Tür-Routing).
    moveDir: new THREE.Vector3(Math.sin(Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z)), 0,
      Math.cos(Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z))),
  };

  z.playAnim = (name, fade = 0.2) => {
    if (!z.actions || !z.actions[name] || z.curAnim === name) return;
    const action = z.actions[name];
    action.reset().fadeIn(fade).play();
    action.timeScale = ANIM_BASE_SPEED[name] ? z.speed / ANIM_BASE_SPEED[name] : 1;
    if (name === 'death' || name === 'dying') {
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.timeScale = 1.15;
    }
    if (z.curAnim && z.actions[z.curAnim]) z.actions[z.curAnim].fadeOut(fade);
    z.curAnim = name;
  };
  group.position.copy(z.pos);
  group.position.y = isDog ? 0 : terrainH(z.pos.x, z.pos.z) - 1.9;
  z.playAnim(isRunner ? 'run' : 'walk');

  const hbScale = isBoss ? 1.4 : 1;
  z.headHB = new THREE.Mesh(hbHeadGeo, hbMat);
  z.headHB.name = 'head'; z.headHB.userData.zombie = z;
  z.bodyHB = new THREE.Mesh(hbBodyGeo, hbMat);
  z.bodyHB.name = 'body'; z.bodyHB.userData.zombie = z;
  z.legsHB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.45), hbMat);
  z.legsHB.name = 'legs'; z.legsHB.userData.zombie = z;
  z.headHB.scale.setScalar(hbScale);
  z.bodyHB.scale.setScalar(hbScale);
  z.legsHB.scale.setScalar(hbScale);
  hitboxGroup.add(z.headHB, z.bodyHB, z.legsHB);

  z.shadow = new THREE.Mesh(shadowGeo, shadowMat);
  z.shadow.rotation.x = -Math.PI / 2;
  z.shadow.position.set(z.pos.x, 0.02, z.pos.z);
  z.shadow.visible = !realShadows; // Blob-Schatten nur ohne echte Schatten
  scene.add(z.shadow);

  z.glow = new THREE.Sprite(glowSpriteMat);
  z.glow.scale.setScalar(isDog ? 0.0 : (isBoss ? 1.1 : 0.65));
  scene.add(z.glow);

  zombieGroup.add(group);
  zombies.push(z);
  if (isBoss) {
    toast('☠ EIN BRUTE IST ERSCHIENEN');
    tone(60, 30, 1.6, 0.5, 'sawtooth', 0, 0.7);
    if (z.actions && z.actions.scream) { z.playAnim('scream'); z.attackAnimT = 1.2; }
  }
  if (!isDog && Math.random() < 0.6) playGroan(z.pos.x, z.pos.z);
}

let headKillStreak = 0;
function killZombie(z, headshot, pointsOverride = null, allowDrop = true) {
  z.state = 'dead';
  z.deadT = 0;
  // Echte Sterbe-Animation, wenn vorhanden — sonst Umkipp-Fallback
  z.hasDeathAnim = !!(z.actions && (z.actions.death || z.actions.dying));
  if (z.hasDeathAnim) {
    z.playAnim(z.actions.dying && Math.random() < 0.5 ? 'dying' : 'death', 0.1);
  } else if (z.action) {
    z.action.paused = true;
  }
  hitboxGroup.remove(z.headHB, z.bodyHB, z.legsHB);
  scene.remove(z.glow);
  addBloodDecal(z.pos.x, z.pos.z, rand(0.9, 1.5));
  state.kills++;
  let pts = pointsOverride !== null ? pointsOverride : (headshot ? 100 : 60);
  if (z.isBoss) {
    pts = 500;
    toast('BRUTE ELIMINIERT — +500');
    spawnPowerup('maxammo', z.pos.x, z.pos.z);
  }
  if (pts > 0) addPoints(pts, true);
  sfx.kill();
  playDeath(z.pos.x, z.pos.z, headshot);

  // Multikill-Erkennung (Kills innerhalb 1 Sekunde)
  killTimes.push(elapsed);
  while (killTimes.length && elapsed - killTimes[0] > 1.0) killTimes.shift();
  if (killTimes.length >= 2) {
    const names = { 2: 'DOPPELKILL', 3: 'DREIFACH-KILL', 4: 'MEGAKILL' };
    const n = Math.min(killTimes.length, 4);
    toast(names[n] + ' — +' + 25 * (n - 1));
    addPoints(25 * (n - 1));
    sfx.multikill();
  }
  // Kopfschuss-Serie
  if (headshot) {
    headKillStreak++;
    if (headKillStreak === 5) { toast('KOPFJÄGER — 5 Kopfschuss-Kills — +150'); addPoints(150); sfx.multikill(); }
  } else headKillStreak = 0;

  zombieGroup.remove(z.group);
  corpseGroup.add(z.group);
  showHitmarker(true);
  if (allowDrop && Math.random() < 0.04) {
    const types = ['maxammo', 'insta', 'double', 'nuke'];
    spawnPowerup(types[Math.random() * types.length | 0], z.pos.x, z.pos.z);
  }
}

function hitZombie(z, weapon, headshot, point, hitName) {
  const mult = (weapon.upgraded ? 2.2 : 1) * (headshot ? weapon.def.head : 1);
  const dmg = state.instaT > 0 ? 1e9 : weapon.def.dmg * mult;
  z.hp -= dmg;
  z.flashT = 0.12;
  spawnBlood(point, headshot);
  // Blutspritzer auf Boden/Wand in der Nähe des Treffers — nicht nur bei Kills
  if (Math.random() < 0.5) addBloodDecal(point.x + rand(-0.4, 0.4), point.z + rand(-0.4, 0.4), rand(0.5, 0.9));

  if (Math.random() < 0.35 && !z.isDog) {
    const decal = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      map: decalTexs[Math.random() * 3 | 0], transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
    }));
    decal.scale.setScalar(rand(0.2, 0.4));
    decal.position.copy(z.group.worldToLocal(point.clone()));
    decal.rotation.z = rand(0, Math.PI);
    if (z.spineBone) z.spineBone.add(decal); else z.model.add(decal);
  }

  // Treffer-Stagger: Zombie taumelt kurz (Boss kaum)
  if (z.hp > 0) z.staggerT = Math.max(z.staggerT, z.isBoss ? 0.08 : (headshot ? 0.35 : 0.18));

  if (hitName === 'legs' && dmg > z.hp * 0.4 && !z.isCrawler && !z.isDog && !z.isBoss) {
    z.isCrawler = true;
    z.speed = Math.max(0.8, z.speed * 0.45);
    spawnLegDebris(z.pos.clone(), z.group.rotation.y);
    sfx.squelch();
    if (z.actions && (z.actions.crawlrun || z.actions.crawl)) {
      z.playAnim(z.actions.crawlrun ? 'crawlrun' : 'crawl', 0.15);
      z.crawlAnim = true;
    } else {
      z.group.scale.y = 0.4;
      z.group.position.y = -0.7;
    }
    addPoints(10);
  }

  if (z.hp <= 0) killZombie(z, headshot);
  else { addPoints(10); showHitmarker(false); sfx.hit(); }
}

function meleeHit(z) {
  const dmg = state.instaT > 0 ? 1e9 : 150;
  z.hp -= dmg;
  z.flashT = 0.12;
  z.staggerT = Math.max(z.staggerT, 0.3);
  spawnBlood(z.bodyHB.position);
  if (z.hp <= 0) { killZombie(z, false, 130); sfx.squelch(); }
  else { addPoints(10); showHitmarker(false); sfx.hit(); }
}

// ---------------- Effekte ----------------
const tracers = [];
const tracerGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
function spawnTracer(from, to, color = 0xffdf9a, thick = 1) {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  m.position.copy(from).lerp(to, 0.5);
  m.lookAt(to);
  m.scale.set(thick, thick, len);
  scene.add(m);
  tracers.push({ mesh: m, life: 0.07 });
}

// Abgeschossene Beine: fallen als Debris zu Boden, Zombie kriecht weiter
const limbDebris = [];
const limbMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.9 });
const limbSkinMat = new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.95 });
function spawnLegDebris(pos, facing) {
  for (let side = 0; side < 2; side++) {
    const g = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.35, 3, 6), limbMat.clone());
    thigh.position.y = 0;
    g.add(thigh);
    const stump = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), limbSkinMat.clone());
    stump.position.y = 0.2;
    stump.scale.y = 0.6;
    g.add(stump);
    const off = (side === 0 ? -1 : 1) * 0.12;
    g.position.set(pos.x + Math.cos(facing) * off, 0.5, pos.z - Math.sin(facing) * off);
    g.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
    scene.add(g);
    limbDebris.push({
      mesh: g, life: 20,
      vel: new THREE.Vector3(rand(-1.5, 1.5), rand(2, 4), rand(-1.5, 1.5)),
      spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)),
    });
    for (let i = 0; i < 14; i++) {
      spawnParticle(pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
        new THREE.Vector3(rand(-2, 2), rand(1, 4), rand(-2, 2)), 0x8a0000, rand(0.3, 0.7));
    }
  }
  addBloodDecal(pos.x, pos.z, rand(1.1, 1.6));
}

const casings = [];
let casingsEnabled = true;
const casingGeo = new THREE.BoxGeometry(0.018, 0.018, 0.042);
const casingMat = new THREE.MeshBasicMaterial({ color: 0xc8a44a });
const tmpRight = new THREE.Vector3();
function ejectCasing() {
  if (!casingsEnabled) return;
  if (casings.length > 24) {
    const old = casings.shift();
    scene.remove(old.mesh);
  }
  const m = new THREE.Mesh(casingGeo, casingMat);
  tmpRight.setFromMatrixColumn(camera.matrixWorld, 0);
  m.position.copy(camera.position).addScaledVector(tmpRight, 0.3);
  m.position.y -= 0.2;
  m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  scene.add(m);
  casings.push({
    mesh: m, life: 1.0,
    vel: new THREE.Vector3().copy(tmpRight).multiplyScalar(rand(1.2, 2.2)).add(new THREE.Vector3(rand(-0.4, 0.4), rand(1.6, 2.6), rand(-0.4, 0.4))),
    spin: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)),
  });
}

const decals = [];
let maxDecals = 40;
function splatTexture(colFn) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0, 36);
    g.fillStyle = colFn();
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(5, 24), 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const decalTexs = [0, 0, 0].map(() => splatTexture(() => `rgba(${rand(80, 125) | 0},8,10,${rand(0.45, 0.9)})`));
const scorchTex = splatTexture(() => `rgba(20,18,16,${rand(0.5, 0.9)})`);
const decalGeo = new THREE.PlaneGeometry(1, 1);
function addDecal(tex, x, z, scale) {
  if (decals.length >= maxDecals) {
    const old = decals.shift();
    scene.remove(old.mesh);
  }
  const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.85,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rand(0, Math.PI * 2);
  m.position.set(x, 0.015 + (decals.length % 20) * 0.0004, z);
  m.scale.setScalar(scale);
  scene.add(m);
  decals.push({ mesh: m, life: 30 });
}
function addBloodDecal(x, z, scale = 1) { addDecal(decalTexs[Math.random() * 3 | 0], x, z, scale); }

// Explosionen
const explosions = [];
const shockwaves = [];
const explGeo = new THREE.SphereGeometry(1, 14, 10);
const shockGeo = new THREE.RingGeometry(0.6, 1, 32);
const explLight = new THREE.PointLight(0xff8830, 0, 14, 2);
scene.add(explLight);
function explode(pos, radius = 4.5) {
  sfx.explosion();
  // Feuerball: heller Kern + dunklerer Außenrand, additiv geblendet
  const m = new THREE.Mesh(explGeo, new THREE.MeshBasicMaterial({
    color: 0xffcc55, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.position.copy(pos);
  m.position.y = Math.max(0.5, pos.y);
  scene.add(m);
  explosions.push({ mesh: m, t: 0 });

  // Schockwellen-Ring am Boden, breitet sich schnell aus
  const ring = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({
    color: 0xffddaa, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.08, pos.z);
  scene.add(ring);
  shockwaves.push({ mesh: ring, t: 0 });

  explLight.position.copy(m.position);
  explLight.intensity = 220;
  explLight.color.setHex(0xffaa55);
  addDecal(scorchTex, pos.x, pos.z, rand(2.0, 2.7));

  // Feuer: viele warme Partikel mit Farbvarianz (gelb→orange→rot)
  for (let i = 0; i < 220; i++) {
    const v = new THREE.Vector3(rand(-11, 11), rand(3, 13), rand(-11, 11));
    const c = [0xffe066, 0xffaa33, 0xff5511, 0xcc2200][Math.random() * 4 | 0];
    spawnParticle(m.position, v, c, rand(0.4, 1.1));
  }
  // Dichter Rauch, steigt lange nach
  for (let i = 0; i < 140; i++) {
    const v = new THREE.Vector3(rand(-4, 4), rand(2, 7), rand(-4, 4));
    spawnParticle(m.position, v, Math.random() < 0.5 ? 0x333333 : 0x1a1a1a, rand(1.2, 2.2));
  }
  // Glühende Trümmer/Funken, die weit wegfliegen
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), s = rand(6, 14);
    spawnParticle(m.position, new THREE.Vector3(Math.cos(a) * s, rand(4, 9), Math.sin(a) * s), 0xffcc66, rand(0.6, 1.3));
  }
  // Schaden an Zombies
  for (const z of [...zombies]) {
    if (z.state === 'dead') continue;
    const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z);
    if (d < radius) {
      z.hp -= lerp(240, 70, d / radius) * (state.instaT > 0 ? 100 : 1);
      z.flashT = 0.12;
      if (z.hp <= 0) killZombie(z, false, 60);
    }
  }
  // Eigenschaden
  const pd = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  if (pd < 3) damagePlayer(Math.max(10, 45 * (1 - pd / 3)), pos.x, pos.z);
  shake = Math.min(1, shake + (1 - clamp(pd / 8, 0, 1)));
}

function updateEffects(dt) {
  updateGPU_Particles(dt);

  // Ground Fog Update
  for (const f of groundFogSprites) {
    f.t += dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.position.z += f.vz * dt;
    f.mesh.position.y = f.startY + Math.sin(f.t * 0.4) * 0.05;
    if (f.mesh.position.x > 70) f.mesh.position.x = -30;
    if (f.mesh.position.x < -30) f.mesh.position.x = 70;
    if (f.mesh.position.z > 30) f.mesh.position.z = -70;
    if (f.mesh.position.z < -70) f.mesh.position.z = 30;
  }
  
  // Flickering Lights Update
  for (const fl of flickerLights) {
    fl.t += dt * rand(5, 18);
    const f = Math.sin(fl.t) * Math.sin(fl.t * 2.3) * Math.sin(fl.t * 1.7);
    const intensity = (f > 0.6) ? fl.base * 0.1 : fl.base * (1 + f * 0.2);
    fl.light.intensity = intensity;
    fl.mat.emissiveIntensity = intensity / fl.base;
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) { scene.remove(t.mesh); tracers.splice(i, 1); continue; }
    t.mesh.material.opacity = t.life / 0.07 * 0.85;
  }
  for (let i = casings.length - 1; i >= 0; i--) {
    const cs = casings[i];
    cs.life -= dt;
    if (cs.life <= 0) { scene.remove(cs.mesh); casings.splice(i, 1); continue; }
    cs.vel.y -= 10 * dt;
    cs.mesh.position.addScaledVector(cs.vel, dt);
    cs.mesh.rotation.x += cs.spin.x * dt;
    cs.mesh.rotation.y += cs.spin.y * dt;
    if (cs.mesh.position.y < 0.02) {
      cs.mesh.position.y = 0.02;
      cs.vel.y *= -0.3; cs.vel.x *= 0.6; cs.vel.z *= 0.6;
      cs.spin.multiplyScalar(0.5);
    }
  }
  for (let i = limbDebris.length - 1; i >= 0; i--) {
    const ld = limbDebris[i];
    ld.life -= dt;
    if (ld.life <= 0) { scene.remove(ld.mesh); limbDebris.splice(i, 1); continue; }
    ld.vel.y -= 11 * dt;
    ld.mesh.position.addScaledVector(ld.vel, dt);
    ld.mesh.rotation.x += ld.spin.x * dt;
    ld.mesh.rotation.y += ld.spin.y * dt;
    ld.mesh.rotation.z += ld.spin.z * dt;
    if (ld.mesh.position.y < 0.1) {
      ld.mesh.position.y = 0.1;
      ld.vel.y *= -0.25; ld.vel.x *= 0.5; ld.vel.z *= 0.5;
      ld.spin.multiplyScalar(0.4);
    }
    if (ld.life < 3) ld.mesh.traverse(o => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = ld.life / 3; } });
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    d.life -= dt;
    if (d.life <= 0) { scene.remove(d.mesh); decals.splice(i, 1); continue; }
    if (d.life < 5) d.mesh.material.opacity = d.life / 5 * 0.85;
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.t += dt;
    if (ex.t > 0.4) { scene.remove(ex.mesh); explosions.splice(i, 1); continue; }
    const p = ex.t / 0.4;
    ex.mesh.scale.setScalar(0.5 + p * 4);
    ex.mesh.material.opacity = 0.95 * (1 - p * p);
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.t += dt;
    if (sw.t > 0.5) { scene.remove(sw.mesh); shockwaves.splice(i, 1); continue; }
    const p = sw.t / 0.5;
    sw.mesh.scale.setScalar(1 + p * 9);
    sw.mesh.material.opacity = 0.7 * (1 - p);
  }
  explLight.intensity = Math.max(0, explLight.intensity - 500 * dt);
}

// ---------------- Power-Ups ----------------
const POWERUP_DEFS = {
  maxammo: { label: 'VOLLE MUNITION', symbol: 'MAX', color: '#66ff66' },
  insta:   { label: 'INSTA-KILL', symbol: '☠', color: '#ff6666' },
  double:  { label: '2× PUNKTE', symbol: '×2', color: '#ffd766' },
  nuke:    { label: 'NUKE', symbol: '☢', color: '#66ccff' },
};
const powerups = [];
function powerupTexture(def) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 60);
  gr.addColorStop(0, def.color);
  gr.addColorStop(0.55, def.color + '55');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.font = 'bold 40px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def.symbol, 64, 64);
  return new THREE.CanvasTexture(c);
}
const powerupTexs = {};
for (const k in POWERUP_DEFS) powerupTexs[k] = powerupTexture(POWERUP_DEFS[k]);

function spawnPowerup(type, x, z) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: powerupTexs[type], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sprite.scale.setScalar(0.9);
  sprite.position.set(x, 1.1, z);
  scene.add(sprite);
  powerups.push({ type, sprite, t: 25, x, z });
}

function applyPowerup(type) {
  const def = POWERUP_DEFS[type];
  sfx.powerup();
  popup(def.label, true);
  if (type === 'maxammo') {
    for (const w of player.weapons) {
      w.reserve = Math.round(w.def.reserve * (w.upgraded ? 1.5 : 1));
      w.ammo = w.mag;
      w.reloading = false;
    }
    player.grenades = 4;
  } else if (type === 'insta') {
    state.instaT = 30;
  } else if (type === 'double') {
    state.doubleT = 30;
  } else if (type === 'nuke') {
    flashT = 1;
    for (const z of [...zombies]) {
      if (z.state !== 'dead') killZombie(z, false, 0, false);
    }
    addPoints(400, true);
  }
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.t -= dt;
    if (p.t <= 0) { scene.remove(p.sprite); powerups.splice(i, 1); continue; }
    p.sprite.position.y = 1.1 + Math.sin(elapsed * 2.5 + i) * 0.12;
    p.sprite.material.rotation += dt * 1.5;
    p.sprite.material.opacity = p.t < 5 ? (Math.sin(elapsed * 10) > 0 ? 1 : 0.25) : 1;
    if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 1.6) {
      applyPowerup(p.type);
      scene.remove(p.sprite);
      powerups.splice(i, 1);
    }
  }
  if (state.instaT > 0) state.instaT -= dt;
  if (state.doubleT > 0) state.doubleT -= dt;
}

// ---------------- Granaten ----------------
const grenadesAir = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 8, 6);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x33402c, metalness: 0.4, roughness: 0.5 });
let grenadeCd = 0;
function throwGrenade() {
  if (player.grenades <= 0 || grenadeCd > 0 || state.over) return;
  player.grenades--;
  grenadeCd = 0.5;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const m = new THREE.Mesh(grenadeGeo, grenadeMat);
  m.position.copy(camera.position).addScaledVector(dir, 0.5);
  scene.add(m);
  grenadesAir.push({
    mesh: m, fuse: 2.0,
    vel: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 2.5, 0)),
  });
  playTone(500, 0.06, 0.06);
}
function updateGrenades(dt) {
  grenadeCd -= dt;
  for (let i = grenadesAir.length - 1; i >= 0; i--) {
    const g = grenadesAir[i];
    g.fuse -= dt;
    g.vel.y -= 13.5 * dt;
    const prevX = g.mesh.position.x, prevZ = g.mesh.position.z;
    g.mesh.position.addScaledVector(g.vel, dt);
    const p2 = { x: g.mesh.position.x, z: g.mesh.position.z };
    resolveCollision(p2, 0.1);
    if (Math.abs(p2.x - g.mesh.position.x) > 1e-6) { g.vel.x *= -0.35; g.mesh.position.x = p2.x; }
    if (Math.abs(p2.z - g.mesh.position.z) > 1e-6) { g.vel.z *= -0.35; g.mesh.position.z = p2.z; }
    if (g.mesh.position.y < 0.1) {
      g.mesh.position.y = 0.1;
      g.vel.y *= -0.35;
      g.vel.x *= 0.55; g.vel.z *= 0.55;
    }
    // Rollreibung am Boden, sonst rutscht die Granate meterweit weiter
    if (g.mesh.position.y < 0.12) {
      const fr = Math.max(0, 1 - 5 * dt);
      g.vel.x *= fr; g.vel.z *= fr;
    }
    if (g.fuse <= 0) {
      explode(g.mesh.position.clone());
      scene.remove(g.mesh);
      grenadesAir.splice(i, 1);
    }
  }
}

// ---------------- Messer ----------------
let knifeCd = 0, knifeT = 0, knifeHitDone = false;
function doKnife() {
  if (knifeCd > 0 || currentWeapon().reloading) return;
  knifeCd = 0.8;
  knifeT = 0.28;
  knifeHitDone = false;
  sfx.knife();
}
function knifeStrike() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let bestZ = null, bestD = 2.3;
  for (const z of zombies) {
    if (z.state === 'dead') continue;
    const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    const dot = (dx / d) * dir.x + (dz / d) * dir.z;
    if (dot > 0.5) { bestD = d; bestZ = z; }
  }
  if (bestZ) meleeHit(bestZ);
}

// ---------------- Interaktionen ----------------
// interactables array is defined at top of file

for (const w of windows) {
  interactables.push({
    pos: new THREE.Vector3(w.pos.x, 1.2, w.pos.z), radius: 2.2,
    label: () => 'Barrikade reparieren — +10 Punkte',
    available: () => w.boards < 5,
    action: () => {
      w.boards++;
      w.meshes[w.boards - 1].visible = true;
      addPoints(10);
      play3D('barricade_repair_', w.pos.x, w.pos.z);
    },
  });
}

for (const d of doors) {
  interactables.push({
    pos: d.pos, radius: 2.8,
    label: () => `${d.label} kaufen — ${d.cost} Punkte`,
    available: () => !d.opened,
    action: () => {
      if (state.points < d.cost) { denyPrompt(); return; }
      state.points -= d.cost;
      d.opened = true;
      zones[d.zoneUnlock].unlocked = true;
      scene.remove(d.group);
      const idx = colliders.indexOf(d.collider);
      if (idx >= 0) colliders.splice(idx, 1);
      const sIdx = shootTargets.indexOf(d.group);
      if (sIdx >= 0) shootTargets.splice(sIdx, 1);
      play3D('buy_door_', d.pos.x, d.pos.z);
      play2D('points_pickup_');
    },
  });
}

function giveWeapon(key) {
  const owned = player.weapons.find(w => w.key === key);
  if (owned) {
    owned.reserve = Math.round(owned.def.reserve * (owned.upgraded ? 1.5 : 1));
    owned.ammo = owned.mag;
    return;
  }
  const w = makeWeapon(key);
  if (player.weapons.length < 2) {
    player.weapons.push(w);
    player.weaponIndex = player.weapons.length - 1;
  } else {
    player.weapons[player.weaponIndex] = w;
  }
  buildViewmodel();
}

function wallBuy(key, x, z, ry) {
  const def = WEAPON_DEFS[key];
  const holder = new THREE.Group();
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.18, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x3a4038, metalness: 0.6, roughness: 0.4, emissive: 0x0a140a })
  );
  holder.add(gun);
  const outline = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.7),
    new THREE.MeshBasicMaterial({ color: 0xcfe8cf, transparent: true, opacity: 0.15 })
  );
  outline.position.z = -0.18;
  holder.add(outline);
  holder.position.set(x, 1.5, z);
  holder.rotation.y = ry;
  scene.add(holder);

  interactables.push({
    pos: new THREE.Vector3(x, 1.2, z), radius: 2.6, holder,
    label: () => {
      const owned = player.weapons.find(w => w.key === key);
      return owned
        ? `${def.name}-Munition kaufen — ${Math.round(def.cost / 2)} Punkte`
        : `${def.name} kaufen — ${def.cost} Punkte`;
    },
    available: () => true,
    action: () => {
      const owned = player.weapons.find(w => w.key === key);
      const cost = owned ? Math.round(def.cost / 2) : def.cost;
      if (state.points < cost) { denyPrompt(); return; }
      state.points -= cost;
      giveWeapon(key);
      sfx.buy();
    },
  });
}
for (const wb of ACTIVE_MAP.wallBuys) wallBuy(wb.weapon, wb.x, wb.z, wb.ry);

// Granaten-Wandkauf (Zone 0)
{
  const gb = ACTIVE_MAP.grenadeBuy;
  const holder = new THREE.Group();
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshLambertMaterial({ color: 0x3a3630 }));
  holder.add(plaque);
  for (const off of [-0.15, 0.15]) {
    const gm = new THREE.Mesh(grenadeGeo, grenadeMat);
    gm.position.set(off, 0, 0.08);
    gm.scale.setScalar(1.3);
    holder.add(gm);
  }
  holder.position.set(gb.x, 1.5, gb.z);
  holder.rotation.y = gb.ry;
  scene.add(holder);
  interactables.push({
    pos: new THREE.Vector3(gb.x, 1.2, gb.z), radius: 2.4,
    label: () => `Granaten auffüllen — ${gb.cost} Punkte`,
    available: () => true,
    action: () => {
      if (player.grenades >= 4) { denyPrompt(); return; }
      if (state.points < gb.cost) { denyPrompt(); return; }
      state.points -= gb.cost;
      player.grenades = 4;
      sfx.buy();
    },
  });
}

// Pack-a-Punch
{
  const machine = new THREE.Group();
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.9, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x24303a, metalness: 0.7, roughness: 0.35, emissive: 0x04141c }));
  bodyM.position.y = 0.95;
  bodyM.castShadow = true;
  bodyM.receiveShadow = true;
  machine.add(bodyM);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.9), glowMat);
  trim.position.y = 1.95;
  machine.add(trim);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.5), glowMat);
  slot.position.set(0, 1.1, 0.2);
  machine.add(slot);
  machine.position.set(40, 0, -47);
  scene.add(machine);
  shootTargets.push(machine);
  addBoxCollider(39.3, 40.7, -47.5, -46.5);
  const glow = new THREE.PointLight(0x2ee6ff, 24, 10, 1.8);
  glow.position.set(40, 2.2, -46.3);
  scene.add(glow);

  interactables.push({
    pos: new THREE.Vector3(40, 1.2, -46.4), radius: 2.6,
    label: () => {
      const w = currentWeapon();
      return w.upgraded ? 'Waffe ist bereits verbessert' : `${w.def.name} verbessern — 5000 Punkte`;
    },
    available: () => true,
    action: () => {
      const w = currentWeapon();
      if (w.upgraded || state.points < 5000) { denyPrompt(); return; }
      state.points -= 5000;
      w.upgraded = true;
      w.mag = Math.round(w.def.mag * 1.5);
      w.ammo = w.mag;
      w.reserve = Math.round(w.def.reserve * 1.5);
      buildViewmodel();
      sfx.upgrade();
      popup('WAFFE VERBESSERT', true);
    },
  });
}

// Perk-Automaten
function perkMachine(key, x, z, ry) {
  const perk = PERKS[key];
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.7),
    new THREE.MeshStandardMaterial({ color: perk.color, metalness: 0.4, roughness: 0.45 }));
  body.material.color.multiplyScalar(0.55);
  body.position.y = 0.95;
  g.add(body);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.1, 0.76),
    new THREE.MeshBasicMaterial({ color: perk.color }));
  trim.position.y = 1.95;
  g.add(trim);
  const label = canvasTexture(128, (c2) => {
    c2.fillStyle = '#111';
    c2.fillRect(0, 0, 128, 128);
    c2.fillStyle = '#' + perk.color.toString(16).padStart(6, '0');
    c2.font = 'bold 26px Arial';
    c2.textAlign = 'center';
    const words = perk.name.split('-');
    words.forEach((wd, i) => c2.fillText(wd, 64, 52 + i * 32));
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: label }));
  front.position.set(0, 1.3, 0.36);
  g.add(front);
  body.castShadow = true;
  body.receiveShadow = true;
  // Leuchtende Flaschen auf dem Automaten
  for (const off of [-0.22, 0.05, 0.3]) {
    const bottleMat = new THREE.MeshStandardMaterial({
      color: perk.color, emissive: perk.color, emissiveIntensity: 0.35, roughness: 0.3,
    });
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), bottleMat);
    const bz = rand(-0.1, 0.1);
    bottle.position.set(off, 2.12, bz);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.08, 8), bottleMat);
    neck.position.set(off, 2.26, bz);
    g.add(bottle, neck);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(x - 0.55, x + 0.55, z - 0.45, z + 0.45);

  interactables.push({
    pos: new THREE.Vector3(x, 1.2, z), radius: 2.4,
    label: () => `${perk.name} — ${perk.cost} Punkte (${perk.desc})`,
    available: () => !player.perks.has(key),
    action: () => {
      if (state.points < perk.cost) { denyPrompt(); return; }
      state.points -= perk.cost;
      player.perks.add(key);
      if (key === 'jugg') { player.maxHealth = 200; player.health = 200; }
      sfx.perk();
      popup(perk.name.toUpperCase(), true);
      rebuildPerkIcons();
    },
  });
}
perkMachine('stamin', -19.1, 12, Math.PI / 2);
perkMachine('speed', 50, 19.1, Math.PI);
perkMachine('jugg', -19.1, -48, Math.PI / 2);
perkMachine('dtap', 59.1, -56, -Math.PI / 2);

// Mystery-Box
const mystery = { state: 'idle', t: 0, offer: null, swapT: 0 };
let mysteryDisplay, mysteryBeam, mysteryLid;
{
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.75), crateMat);
  base.position.y = 0.35;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  mysteryLid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.75), woodMat);
  mysteryLid.position.set(0, 0.76, -0.37);
  g.add(mysteryLid);
  const q = canvasTexture(64, (c2) => {
    c2.fillStyle = '#221a0e'; c2.fillRect(0, 0, 64, 64);
    c2.fillStyle = '#2ee6ff'; c2.font = 'bold 44px Arial'; c2.textAlign = 'center';
    c2.fillText('?', 32, 48);
  });
  const qm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: q }));
  qm.position.set(0, 0.38, 0.38);
  g.add(qm);
  mysteryBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.36, 3.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  mysteryBeam.position.y = 2.2;
  mysteryBeam.visible = false;
  g.add(mysteryBeam);
  mysteryDisplay = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
  );
  mysteryDisplay.position.y = 1.5;
  mysteryDisplay.visible = false;
  g.add(mysteryDisplay);
  g.position.set(12, 0, -40);
  scene.add(g);
  shootTargets.push(g);
  addBoxCollider(11.25, 12.75, -40.5, -39.5);

  interactables.push({
    pos: new THREE.Vector3(12, 1, -40), radius: 2.6,
    label: () => {
      if (mystery.state === 'cycling') return '. . .';
      if (mystery.state === 'offering') return `${WEAPON_DEFS[mystery.offer].name} nehmen (${Math.ceil(mystery.t)}s)`;
      return 'Mystery-Box — 950 Punkte';
    },
    available: () => true,
    action: () => {
      if (mystery.state === 'idle') {
        if (state.points < 950) { denyPrompt(); return; }
        state.points -= 950;
        mystery.state = 'cycling';
        mystery.t = 2.6;
        mystery.swapT = 0;
        mysteryBeam.visible = true;
        mysteryDisplay.visible = true;
        mysteryLid.rotation.x = -0.9;
        sfx.boxJingle();
      } else if (mystery.state === 'offering') {
        giveWeapon(mystery.offer);
        popup(WEAPON_DEFS[mystery.offer].name.toUpperCase(), true);
        mystery.state = 'idle';
        mysteryBeam.visible = false;
        mysteryDisplay.visible = false;
        mysteryLid.rotation.x = 0;
        sfx.buy();
      }
    },
  });
}

function pickMysteryWeapon() {
  const total = MYSTERY_POOL.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of MYSTERY_POOL) {
    r -= w;
    if (r <= 0) return key;
  }
  return 'smg';
}

function updateMystery(dt) {
  if (mystery.state === 'cycling') {
    mystery.t -= dt;
    mystery.swapT -= dt;
    if (mystery.swapT <= 0) {
      mystery.swapT = 0.12;
      const k = MYSTERY_POOL[Math.random() * MYSTERY_POOL.length | 0][0];
      mysteryDisplay.material.color.setHex(WEAPON_COLORS[k]);
    }
    mysteryDisplay.position.y = 1.3 + (2.6 - mystery.t) * 0.15;
    mysteryDisplay.rotation.y += dt * 6;
    if (mystery.t <= 0) {
      mystery.state = 'offering';
      mystery.t = 10;
      mystery.offer = pickMysteryWeapon();
      mysteryDisplay.material.color.setHex(WEAPON_COLORS[mystery.offer]);
    }
  } else if (mystery.state === 'offering') {
    mystery.t -= dt;
    mysteryDisplay.rotation.y += dt * 1.2;
    mysteryDisplay.position.y = 1.65 + Math.sin(elapsed * 2) * 0.06;
    if (mystery.t <= 0) {
      mystery.state = 'idle';
      mysteryBeam.visible = false;
      mysteryDisplay.visible = false;
      mysteryLid.rotation.x = 0;
    }
  }
}

let promptDenyT = 0;
function denyPrompt() { promptDenyT = 0.5; sfx.deny(); }

// ---------------- Punkte / HUD ----------------
function addPoints(n, showPopup = false) {
  const mult = state.doubleT > 0 ? 2 : 1;
  state.points += n * mult;
  state.totalPoints += n * mult;
  if (showPopup) popup('+' + (n * mult));
}

function popup(text, special = false) {
  if (ui.popups.children.length > 8) ui.popups.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'pop' + (special ? ' special' : '');
  el.textContent = text;
  el.style.left = rand(-20, 30) + 'px';
  el.style.top = rand(-10, 10) + 'px';
  ui.popups.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// Toast-Meldungen (Medaillen, Events) — CSS-Animation macht Ein-/Ausblenden
function toast(text) {
  if (!ui.toasts) return;
  while (ui.toasts.children.length >= 4) ui.toasts.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  ui.toasts.appendChild(el);
  setTimeout(() => el.remove(), 4100);
}

let hitmarkerT = 0;
function showHitmarker(kill) {
  hitmarkerT = 0.09;
  ui.hitmarker.classList.toggle('kill', kill);
  ui.hitmarker.style.opacity = 1;
}

function rebuildPerkIcons() {
  ui.perkicons.innerHTML = '';
  for (const key of player.perks) {
    const p = PERKS[key];
    const el = document.createElement('div');
    el.className = 'perkicon';
    el.style.background = '#' + p.color.toString(16).padStart(6, '0');
    el.textContent = p.code;
    el.title = p.name;
    ui.perkicons.appendChild(el);
  }
}

function updateHUD() {
  ui.points.textContent = state.points;
  ui.round.textContent = state.round;
  const aliveCount = zombies.filter(z => z.state !== 'dead').length;
  ui.zcount.textContent = state.betweenRounds ? 'PAUSE' : '☠ ' + (aliveCount + state.leftToSpawn);
  const w = currentWeapon();
  ui.weapon.textContent = w.upgraded ? '★ ' + w.def.name : w.def.name;
  ui.weapon.classList.toggle('upgraded', w.upgraded);
  ui.ammo.textContent = w.reloading ? '— / ' + w.reserve : `${w.ammo} / ${w.reserve}`;
  ui.ammo.classList.toggle('empty', w.ammo === 0 && !w.reloading);
  ui.grenadeicon.textContent = '💣 ×' + player.grenades;
  ui.reloadhint.textContent =
    w.reloading ? 'Lädt nach…' :
    (w.ammo === 0 && w.reserve > 0) ? 'R — Nachladen' :
    (w.ammo === 0 && w.reserve === 0) ? 'Keine Munition!' : '';
  const hp = clamp(player.health / player.maxHealth, 0, 1);
  ui.health.style.width = (hp * 100) + '%';
  ui.health.classList.toggle('low', hp < 0.35);
  let bar = '';
  if (state.instaT > 0) bar += `<span>☠ INSTA-KILL ${Math.ceil(state.instaT)}</span>`;
  if (state.doubleT > 0) bar += `<span style="color:#fd6">×2 PUNKTE ${Math.ceil(state.doubleT)}</span>`;
  ui.powerupbar.innerHTML = bar;
}

// ---------------- Eingabe ----------------
const keys = {};
let mouseDown = false, mouseClicked = false, rightDown = false;

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!state.started || state.paused || state.over || e.repeat) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'KeyE') {
    tryInteract();
    repairCooldown = 0.4;
  }
  if (e.code === 'KeyV') doKnife();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyL') {
    flashlight.visible = !flashlight.visible;
    playTone(900, 0.05, 0.08); // Klick-Sound für Stirnlampe
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('contextmenu', e => e.preventDefault()); // Rechtsklick = Zielen, kein Kontextmenü
addEventListener('mousedown', e => {
  if (e.button === 0) { mouseDown = true; mouseClicked = true; }
  if (e.button === 2) { rightDown = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false; });
addEventListener('wheel', () => {
  if (!state.started || state.paused) return;
  switchWeapon((player.weaponIndex + 1) % player.weapons.length);
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const sens = 0.0021 * SETTINGS.sens;
  player.yaw -= e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
});

function switchWeapon(i) {
  if (i >= player.weapons.length || i === player.weaponIndex) return;
  currentWeapon().reloading = false;
  player.weaponIndex = i;
  buildViewmodel();
  playTone(440, 0.05, 0.06);
}

function startReload() {
  const w = currentWeapon();
  if (w.reloading || w.ammo >= w.mag || w.reserve <= 0) return;
  w.reloading = true;
  w.reloadT = effReload(w);
  sfx.reload(w.reloadT);
}

// ---------------- Kollision ----------------
function resolveCollision(pos, radius) {
  for (const b of colliders) {
    if (b.maxY !== null && pos.y >= b.maxY - 0.1) continue;
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + dx / d * radius;
      pos.z = cz + dz / d * radius;
    } else {
      const px = Math.min(pos.x - b.minX, b.maxX - pos.x);
      const pz = Math.min(pos.z - b.minZ, b.maxZ - pos.z);
      if (px < pz) pos.x = (pos.x - b.minX < b.maxX - pos.x) ? b.minX - radius : b.maxX + radius;
      else pos.z = (pos.z - b.minZ < b.maxZ - pos.z) ? b.minZ - radius : b.maxZ + radius;
    }
  }
  pos.x = clamp(pos.x, ACTIVE_MAP.moveBounds.minX, ACTIVE_MAP.moveBounds.maxX);
  pos.z = clamp(pos.z, ACTIVE_MAP.moveBounds.minZ, ACTIVE_MAP.moveBounds.maxZ);
}

// ---------------- Schießen ----------------
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
let fireCooldown = 0, gunKick = 0, camKick = 0, muzzleT = 0;
const muzzleWorld = new THREE.Vector3();

function fireWeapon() {
  const w = currentWeapon();
  if (w.reloading || fireCooldown > 0 || knifeT > 0) return;
  if (w.ammo <= 0) {
    play2D('error_buzzer', 0.5);
    fireCooldown = 0.25;
    if (w.reserve > 0) startReload();
    return;
  }
  w.ammo--;
  state.shots++;
  fireCooldown = effRate(w);
  gunKick = 1;
  camKick += w.def.pellets > 1 ? 0.03 : 0.011;
  muzzleT = 0.05;
  if (w.def.energy) playZap();
  else playShot(w);

  camera.updateMatrixWorld(true);
  muzzleFlash.getWorldPosition(muzzleWorld);
  muzzleLight.position.copy(muzzleWorld);
  muzzleLight.color.setHex(w.def.energy ? 0x44ff66 : 0xffc060);
  if (!w.def.energy) ejectCasing();

  const tracerColor = w.def.energy ? 0x55ff77 : 0xffdf9a;
  const tracerThick = w.def.energy ? 3 : 1;
  const moving = player.vel.lengthSq() > 4;
  const rayTargets = shootTargets.concat(hitboxGroup.children);
  let hitAny = false, headAny = false;
  for (let i = 0; i < w.def.pellets; i++) {
    const s = w.def.spread * (moving ? 1.5 : 1) * (player.sliding ? 1.8 : 1) * (rightDown ? 0.35 : 1);
    raycaster.setFromCamera({ x: rand(-s, s), y: rand(-s, s) }, camera);
    const hits = raycaster.intersectObjects(rayTargets, true);
    let end = null;
    for (const h of hits) {
      let o = h.object, z = null;
      while (o) { if (o.userData && o.userData.zombie) { z = o.userData.zombie; break; } o = o.parent; }
      if (z && z.state !== 'dead') {
        let headshot = h.object.name === 'head';
        let hitName = h.object.name;
        if (!headshot) {
          for (const h2 of hits) {
            if (h2.object.name === 'head' && h2.object.userData.zombie === z
              && h2.distance - h.distance < 0.4) { headshot = true; hitName = 'head'; break; }
          }
        }
        hitZombie(z, w, headshot, h.point, hitName);
        hitAny = true;
        if (headshot) headAny = true;
      } else if (h.face) {
        spawnSparks(h.point, h.face.normal);
      }
      end = h.point;
      break;
    }
    if (!end) end = raycaster.ray.at(50, new THREE.Vector3());
    spawnTracer(muzzleWorld, end, tracerColor, tracerThick);
    // Strahlenkanone: kleiner Flächenschaden am Einschlag
    if (w.def.energy && end) {
      for (const z of [...zombies]) {
        if (z.state === 'dead') continue;
        const d = Math.hypot(z.pos.x - end.x, z.pos.z - end.z);
        if (d < 1.8 && d > 0.01) {
          z.hp -= state.instaT > 0 ? 1e9 : 110;
          z.flashT = 0.12;
          if (z.hp <= 0) killZombie(z, false, 60);
        }
      }
    }
  }
  if (hitAny) state.hits++;
  if (headAny) state.headshots++;
}

// ---------------- Interaktion ----------------
function nearestInteractable() {
  let bestI = null, bestD = 99;
  for (const it of interactables) {
    if (!it.available()) continue;
    const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
    if (d < it.radius && d < bestD) { bestD = d; bestI = it; }
  }
  return bestI;
}
function tryInteract() {
  const it = nearestInteractable();
  if (it) it.action();
}

// ---------------- Runden ----------------
function startRound(r) {
  state.round = r;
  state.dogRound = (r > 0 && r % 5 === 0);
  // Brute-Boss: alle 4 Runden ein dicker Brocken (nie in Hunde-Runden)
  state.bossPending = (!state.dogRound && r >= 4 && r % 4 === 0);
  state.rageApplied = false;
  headKillStreak = 0;
  killTimes.length = 0;
  state.leftToSpawn = state.dogRound ? Math.floor(4 + r * 2) : Math.floor(6 + r * 4 + r * r * 0.18);
  state.betweenRounds = false;
  state.spawnT = 1.5;
  ui.roundflash.textContent = state.dogRound ? 'HÖLLENHUNDE' : 'RUNDE ' + r;
  ui.roundflash.style.opacity = 1;
  setTimeout(() => { ui.roundflash.style.opacity = 0; }, 2200);
  sfx.round();
  if (state.dogRound) toast('🐺 HUNDE-RUNDE — Überlebe die Meute!');
  else if (state.bossPending) toast('☠ Etwas Großes ist in der Nähe…');
}

function maxAlive() { return Math.min(24, 6 + state.round * 2); }
function spawnInterval() { return Math.max(0.5, 2.2 - state.round * 0.09); }

// ---------------- Spieler-Schaden ----------------
let damageFlash = 0, flashT = 0, shake = 0, dmgdirT = 0;
function damagePlayer(dmg, srcX, srcZ) {
  if (state.over) return;
  player.health -= dmg;
  player.lastHit = elapsed;
  damageFlash = 1;
  shake = Math.min(1, shake + 0.4);
  sfx.hurt();
  // Schadensrichtungs-Pfeil: zeigt, aus welcher Richtung der Treffer kam
  if (srcX !== undefined) {
    const dx = srcX - player.pos.x, dz = srcZ - player.pos.z;
    const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
    const rightX = Math.cos(player.yaw), rightZ = -Math.sin(player.yaw);
    const a = Math.atan2(dx * rightX + dz * rightZ, dx * fwdX + dz * fwdZ);
    ui.dmgdir.style.transform = `translate(-50%,-50%) rotate(${(a * 180 / Math.PI).toFixed(1)}deg)`;
    dmgdirT = 1;
  }
  if (player.health <= 0 && !state.over) gameOver();
}

function gameOver() {
  state.over = true;
  document.exitPointerLock?.();
  ui.finalround.textContent = state.round;
  ui.finalkills.textContent = state.kills;
  ui.finalpoints.textContent = state.totalPoints;
  // Statistiken: Treffsicherheit & Kopfschüsse
  const acc = state.shots > 0 ? Math.round(100 * state.hits / state.shots) : 0;
  const hsPct = state.hits > 0 ? Math.round(100 * state.headshots / state.hits) : 0;
  ui.finalstats.textContent = `Treffsicherheit ${acc}% · Kopfschussquote ${hsPct}% (${state.headshots})`;
  const newBest = Math.max(best, state.round);
  ui.finalbest.textContent = 'Beste Runde: ' + newBest;
  if (state.round > best) localStorage.setItem('untot_best', String(state.round));
  // Bestenliste (Top 5, lokal gespeichert)
  let scores = [];
  try { scores = JSON.parse(localStorage.getItem('untot_scores') || '[]'); } catch (e) { }
  scores.push({ r: state.round, k: state.kills });
  scores.sort((a, b) => b.r - a.r || b.k - a.k);
  scores = scores.slice(0, 5);
  localStorage.setItem('untot_scores', JSON.stringify(scores));
  ui.scorelist.textContent = 'Top-Runden: ' + scores.map(s => `R${s.r} (${s.k} Kills)`).join(' · ');
  ui.gameover.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  stopAmbient();
}

// ---------------- Zombie-Update ----------------
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
function zombieInside(z) {
  const b = ACTIVE_MAP.insideBounds;
  return z.pos.x > b.minX && z.pos.x < b.maxX && z.pos.z > b.minZ && z.pos.z < b.maxZ;
}

// Max. Drehgeschwindigkeit beim Verfolgen (rad/s) — begrenzt, wie schnell
// ein Zombie seine Bewegungsrichtung ändern darf (siehe z.moveDir in
// updateZombieFSM). ~6 rad/s = eine 180°-Wende in ~0.5s.
const ZOMBIE_TURN_RATE = 6;

// Grid für die Nachbarsuche bei der Zombie-Abstoßung (ersetzt den früheren
// O(n²)-Check über alle Zombies, siehe CHANGELOG.md "Known follow-ups").
// Zellgröße >= Interaktionsradius (0.8m), damit ein Nachbar innerhalb der
// Reichweite garantiert in der gleichen oder einer der 8 Nachbarzellen liegt.
const ZOMBIE_GRID_CELL = 1.0;
const zombieGrid = new Map();
function buildZombieGrid() {
  zombieGrid.clear();
  for (const z of zombies) {
    if (z.state !== 'chase') continue;
    const key = Math.floor(z.pos.x / ZOMBIE_GRID_CELL) + ',' + Math.floor(z.pos.z / ZOMBIE_GRID_CELL);
    let bucket = zombieGrid.get(key);
    if (!bucket) zombieGrid.set(key, bucket = []);
    bucket.push(z);
  }
}

// Zombie-KI-Zustände. 'idle'/'wander'/'alert' sind für eine spätere
// Wahrnehmungslogik vorgesehen (Phase 2, noch nicht implementiert) — aktuell
// verfolgen Zombies den Spieler sofort nach dem Aufstehen, daher sind nur
// 'chase' und 'attack' erreichbar. z.aiState wird an keiner anderen Stelle
// gelesen; das Setzen ist rein additiv und ändert kein bestehendes Verhalten.
const ZOMBIE_AI_STATES = ['idle', 'wander', 'alert', 'chase', 'attack'];

// Bündelt die KI-/Bewegungslogik eines aktiven (nicht toten, nicht gerade
// aufstehenden) Zombies: Ziel wählen (Spieler/Fenster/Tür), Bewegung,
// Abstoßung gegenüber Nachbarn, Nahkampf-Angriff, Animations-FSM.
// 1:1 aus updateZombies() extrahiert — reines Refactoring, keine
// Verhaltensänderung (siehe ROADMAP.md Phase 2).
function updateZombieFSM(z, dt, pZone, inside) {
  z.aiState = 'chase';
  const zZone = zoneAt(z.pos.x, z.pos.z);
  let tx = player.pos.x, tz = player.pos.z;
  let isAttackingWindow = false;

  // Stagger: kurz taumeln statt laufen
  if (z.staggerT > 0) z.staggerT -= dt;

  if (!z.isDog && z.win && !z.climbing) {
    let wx = z.win.pos.x, wz = z.win.pos.z;
    const wd = Math.hypot(wx - z.pos.x, wz - z.pos.z);
    if (z.win.boards > 0 && wd < 1.35) {
      // An der Barrikade: Bretter abreißen
      isAttackingWindow = true;
      z.aiState = 'attack';
      z.playAnim('attack', 0.12);
      z.attackCd -= dt;
      if (z.attackCd <= 0) {
        z.win.boards--;
        z.win.meshes[z.win.boards].visible = false;
        z.attackCd = 1.5;
        play3D('barricade_break_', wx, wz);
        // Holzsplitter
        for (let s = 0; s < 12; s++) {
          spawnParticle(new THREE.Vector3(wx, 1.6, wz),
            new THREE.Vector3(rand(-2, 2), rand(0.5, 3), rand(-2, 2)), 0x8a6a40, rand(0.3, 0.7));
        }
      }
    } else if (z.win.boards > 0) {
      tx = wx; tz = wz; // zum Fenster laufen
    } else {
      // Fenster offen → durchklettern
      if (wd < 1.7) {
        z.climbing = true;
        z.climbT = 0;
        z.climbStart = z.pos.clone();
        z.climbStart.y = z.group.position.y;
        z.climbEnd = new THREE.Vector3().copy(z.win.inner);
        z.playAnim(z.actions && z.actions.crawl ? 'crawl' : 'walk', 0.15);
      } else {
        tx = wx; tz = wz;
      }
    }
  }

  if (z.climbing) {
    z.climbT += dt / 1.4;
    if (z.climbT >= 1) {
      z.climbing = false;
      z.win = null; // drin — ab jetzt normale Jagd
      z.pos.y = 0;
      z.group.position.y = 0;
    } else {
      const t = z.climbT;
      z.pos.lerpVectors(z.climbStart, z.climbEnd, t);
      z.group.position.x = z.pos.x;
      z.group.position.z = z.pos.z;
      z.group.position.y = lerp(z.climbStart.y, 0, t) + Math.sin(t * Math.PI) * 1.35;
      if (z.spineBone) z.spineBone.rotation.x = Math.sin(t * Math.PI) * 0.7;
    }
  }

  if (!isAttackingWindow && !z.climbing && !z.win && zZone !== pZone && !z.isDog) {
    const nz = nextZoneToward(zZone, pZone);
    if (nz >= 0) {
      const key = zZone < nz ? `${zZone},${nz}` : `${nz},${zZone}`;
      const c = doorCenters[key];
      if (c) { tx = c[0]; tz = c[1]; }
    }
  }

  tmpV.set(tx - z.pos.x, 0, tz - z.pos.z);
  const distToTarget = tmpV.length();
  if (distToTarget > 0.01) tmpV.divideScalar(distToTarget);

  // Bewegungsrichtung glätten (Turn-Rate-limitiert) statt sie jeden Frame
  // hart auf die Zielrichtung zu springen — verhindert ruckartige/
  // "teleportartige" Richtungswechsel, z.B. beim Wechsel Fenster→Spieler.
  if (distToTarget > 0.01) {
    const curAngle = Math.atan2(z.moveDir.x, z.moveDir.z);
    const targetAngle = Math.atan2(tmpV.x, tmpV.z);
    let diff = targetAngle - curAngle;
    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const maxTurn = ZOMBIE_TURN_RATE * dt;
    const turn = clamp(diff, -maxTurn, maxTurn);
    const newAngle = curAngle + turn;
    z.moveDir.set(Math.sin(newAngle), 0, Math.cos(newAngle));
  }

  const distToPlayer = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z);

  if (!isAttackingWindow && !z.climbing && z.staggerT <= 0 && distToPlayer > 1.35) {
    z.pos.addScaledVector(z.moveDir, z.speed * dt);
    if (z.isBoss && Math.random() < 0.02 && distToPlayer < 10) shake = Math.min(1, shake + 0.15);
  }

  if (!z.climbing) {
    // Abstoßung nur gegenüber Zombies in den 9 umliegenden Grid-Zellen
    // statt gegenüber allen Zombies (siehe buildZombieGrid oben).
    const gcx = Math.floor(z.pos.x / ZOMBIE_GRID_CELL), gcz = Math.floor(z.pos.z / ZOMBIE_GRID_CELL);
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        const bucket = zombieGrid.get((gcx + gx) + ',' + (gcz + gz));
        if (!bucket) continue;
        for (const o of bucket) {
          if (o === z) continue;
          const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.64 && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
            z.pos.x += dx / d * push * dt * 8;
            z.pos.z += dz / d * push * dt * 8;
          }
        }
      }
    }

    // Kollision & Map-Klemme nur drinnen — draußen laufen sie frei durch den Wald
    if (inside && !z.win) resolveCollision(z.pos, 0.4);
    z.group.position.x = z.pos.x;
    z.group.position.z = z.pos.z;
    if (!z.isCrawler || z.crawlAnim) {
      z.group.position.y = inside ? 0 : terrainH(z.pos.x, z.pos.z);
    }
  }

  // Box-Fallback-Animation (Hunde-Galopp / einfacher Zombie)
  if (z.animParts) {
    z.animT += dt * z.speed * 3.2;
    const sw = Math.sin(z.animT);
    if (z.animParts.legs) {
      z.animParts.legs.forEach((leg, li) => {
        leg.rotation.x = Math.sin(z.animT * 2 + li * Math.PI * 0.5) * 0.7;
      });
      z.group.position.y += Math.abs(Math.sin(z.animT * 2)) * 0.12;
    } else if (z.animParts.legL) {
      z.animParts.legL.rotation.x = sw * 0.7;
      z.animParts.legR.rotation.x = -sw * 0.7;
      z.animParts.armL.rotation.x = 0.15 + Math.sin(z.animT * 0.7) * 0.12;
      z.animParts.armR.rotation.x = 0.15 - Math.sin(z.animT * 0.7) * 0.12;
      z.group.position.y += Math.abs(sw) * 0.05;
    }
  }

  // Angriff auf den Spieler: Ausfall-Animation, Schaden am Anschlag
  if (!isAttackingWindow && !z.climbing) {
    z.attackCd -= dt;
    if (distToPlayer < 1.7 && z.attackCd <= 0 && z.hitDelay < 0) {
      z.attackCd = z.isDog ? ZOMBIE_DEFS.dog.attackCooldown : (z.isBoss ? ZOMBIE_DEFS.boss.attackCooldown : ZOMBIE_DEFS.normal.attackCooldown);
      z.hitDelay = 0.28;
      z.lungeT = 0.34;
      playAttack(z.pos.x, z.pos.z);
      if (!z.isDog && z.actions) {
        const moves = ['attack', 'bite', 'neckbite'].filter(a => z.actions[a]);
        if (moves.length) {
          z.playAnim(moves[Math.random() * moves.length | 0], 0.07);
          z.attackAnimT = 0.85;
        }
      }
    }
  }
  if (z.hitDelay >= 0) {
    z.aiState = 'attack';
    z.hitDelay -= dt;
    if (z.hitDelay < 0) {
      const d2p = Math.hypot(player.pos.x - z.pos.x, player.pos.z - z.pos.z);
      if (d2p < 2.3) damagePlayer(z.isBoss ? ZOMBIE_DEFS.boss.damage : (z.isDog ? ZOMBIE_DEFS.dog.damage : ZOMBIE_DEFS.normal.damage), z.pos.x, z.pos.z);
    }
  }

  // Ausfallschritt: Modell schnellt visuell zum Spieler vor
  if (z.lungeT > 0) {
    z.lungeT -= dt;
    const lp = Math.sin((1 - z.lungeT / 0.34) * Math.PI);
    z.group.position.x = z.pos.x + tmpV.x * lp * 0.4;
    z.group.position.z = z.pos.z + tmpV.z * lp * 0.4;
  }

  // Animations-Zustandsmaschine (Mixamo)
  if (z.actions && !z.climbing && !isAttackingWindow) {
    if (z.attackAnimT > 0) z.attackAnimT -= dt;
    else z.playAnim(z.crawlAnim ? 'crawlrun' : (z.isRunner || z.raged ? 'run' : 'walk'));
  }

  z.shadow.position.set(z.pos.x, z.group.position.y + 0.02, z.pos.z);
}

function updateZombies(dt) {
  const pZone = zoneAt(player.pos.x, player.pos.z);
  buildZombieGrid();

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];

    if (z.state === 'dead') {
      z.deadT += dt;
      // Leichen bleiben ~15s liegen, bevor sie einsinken und despawnen
      if (z.hasDeathAnim) {
        if (z.mixer) z.mixer.update(dt);
        if (z.deadT > CORPSE_LIFETIME) z.group.position.y -= dt * 0.9;
        if (z.deadT > CORPSE_LIFETIME + 1) {
          corpseGroup.remove(z.group);
          scene.remove(z.shadow);
          zombies.splice(i, 1);
        }
      } else {
        z.group.rotation.x = -Math.min(Math.PI / 2, z.deadT * 2.6);
        if (z.deadT > CORPSE_LIFETIME) z.group.position.y -= dt * 1.2;
        if (z.deadT > CORPSE_LIFETIME + 1) {
          corpseGroup.remove(z.group);
          scene.remove(z.shadow);
          zombies.splice(i, 1);
        }
      }
      continue;
    }

    if (z.mixer) z.mixer.update(dt);

    // Treffer-Aufblitzen / Rage-Glühen
    if (z.flashT > 0) {
      z.flashT -= dt;
      if (!z.flashOn) {
        z.flashOn = true;
        for (const m of z.mats) if (m.emissive) m.emissive.setHex(0x771515);
      }
    } else if (z.flashOn) {
      z.flashOn = false;
      for (const m of z.mats) if (m.emissive) m.emissive.setHex(0x000000);
    } else if (z.raged) {
      const p = (Math.sin(elapsed * 7 + z.swayPhase) * 0.5 + 0.5) * 0.45;
      for (const m of z.mats) if (m.emissive) m.emissive.setRGB(p, p * 0.08, 0);
    }

    const inside = zombieInside(z);

    if (z.state === 'rise') {
      z.aiState = 'idle';
      z.riseT += dt;
      const ground = inside ? 0 : terrainH(z.pos.x, z.pos.z);
      z.group.position.y = ground - 1.9 + 1.9 * Math.min(1, z.riseT / 1.1);
      if (z.riseT >= 1.1) { z.state = 'chase'; z.group.position.y = ground; }
    } else {
      updateZombieFSM(z, dt, pZone, inside);
    }

    z.group.rotation.y = Math.atan2(player.pos.x - z.pos.x, player.pos.z - z.pos.z) + FACING;
    // Kopf: unheimlich schiefe Haltung + leichtes Pendeln (nach der Animation additiv)
    if (!z.isDog && z.headBone && z.attackAnimT <= 0) {
      z.headBone.rotation.z += z.headTilt;
      z.headBone.rotation.y += Math.sin(elapsed * 1.3 + z.swayPhase) * 0.15;
    }
    z.glow.material = state.instaT > 0 ? glowYellowSpriteMat : glowSpriteMat;

    if (z.headBone && z.spineBone) {
      z.headBone.getWorldPosition(tmpV2);
      tmpV2.y += 0.1;
      z.headHB.position.copy(tmpV2);
      z.glow.position.copy(tmpV2);
      z.spineBone.getWorldPosition(tmpV2);
      z.bodyHB.position.copy(tmpV2);
      z.legsHB.position.set(z.pos.x, z.group.position.y + 0.35, z.pos.z);
    } else {
      z.headHB.position.set(z.pos.x, z.group.position.y + 1.78, z.pos.z);
      z.glow.position.copy(z.headHB.position);
      z.bodyHB.position.set(z.pos.x, z.group.position.y + 1.1, z.pos.z);
      z.legsHB.position.set(z.pos.x, z.group.position.y + 0.35, z.pos.z);
    }
    z.headHB.updateMatrixWorld(true);
    z.bodyHB.updateMatrixWorld(true);
    z.legsHB.updateMatrixWorld(true);

    if (z.isDog && Math.random() < 0.6) {
      for(let i=0; i<3; i++) {
        spawnParticle(
           new THREE.Vector3(z.pos.x + rand(-0.3, 0.3), z.group.position.y + rand(0.2, 0.8), z.pos.z + rand(-0.3, 0.3)),
           new THREE.Vector3(0, rand(1, 3), 0),
           Math.random() > 0.5 ? 0xff4400 : 0x222222,
           rand(0.3, 0.6)
        );
      }
    }
  }
}

// ---------------- Spieler-Update ----------------
let bobT = 0, swayY = 0, swayP = 0, prevYaw = 0, prevPitch = 0, adsBlend = 0, stepT = 0.5;
let repairCooldown = 0;
function updatePlayer(dt) {
  const w = currentWeapon();

  // Barrikaden aufbauen durch Gedrückthalten von 'E'
  if (keys['KeyE']) {
    let nearestW = null, minDist = 2.2;
    for (const win of windows) {
      if (win.boards < 5) {
        const d = Math.hypot(win.pos.x - player.pos.x, win.pos.z - player.pos.z);
        if (d < minDist) {
          minDist = d;
          nearestW = win;
        }
      }
    }
    if (nearestW) {
      repairCooldown -= dt;
      if (repairCooldown <= 0) {
        nearestW.boards++;
        nearestW.meshes[nearestW.boards - 1].visible = true;
        addPoints(10);
        play3D('barricade_repair_', nearestW.pos.x, nearestW.pos.z, 1.0, 4, 15);
        // Holzsplitter-Partikel spawnen
        for (let s = 0; s < 8; s++) {
          spawnParticle(
            new THREE.Vector3(nearestW.pos.x, 1.6, nearestW.pos.z),
            new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2.5), rand(-1.5, 1.5)),
            0x8a6a40,
            rand(0.2, 0.5)
          );
        }
        repairCooldown = 0.4; // Alle 0.4s ein Brett reparieren
      }
    } else {
      repairCooldown = 0;
    }
  } else {
    repairCooldown = 0;
  }

  if (w.reloading) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) {
      const need = w.mag - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
      w.reloading = false;
    }
  }

  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const wishX = (-sin * f + cos * s);
  const wishZ = (-cos * f - sin * s);
  const wishLen = Math.hypot(wishX, wishZ);

  player.sprinting = keys.ShiftLeft && f > 0 && !player.sliding && !rightDown;
  // Zielen (ADS): Rechtsklick — Waffe mittig, Zoom, weniger Streuung, langsamer
  const isAds = rightDown && !w.reloading && !player.sliding;

  player.slideCd -= dt;
  if (player.sprinting && (keys.KeyC || keys.ControlLeft) && player.slideCd <= 0 && player.onGround) {
    player.sliding = true;
    player.slideT = 0.55;
    player.slideCd = 1.2;
    player.slideDir.set(wishX / wishLen || -sin, 0, wishZ / wishLen || -cos);
    playTone(200, 0.15, 0.05, 'triangle');
  }

  const isCrouching = keys.ControlLeft && !player.sprinting && !player.sliding;
  player.crouching = isCrouching;
  const speedMult = player.perks.has('stamin') ? 1.13 : 1;
  let targetSpeed = (player.sprinting ? 7.6 : 4.8) * speedMult;
  if (isCrouching) targetSpeed *= 0.45;
  let moveX = 0, moveZ = 0;

  if (player.sliding) {
    player.slideT -= dt;
    if (player.slideT <= 0) player.sliding = false;
    const slideSpeed = (10 * (player.slideT / 0.55) + 2) * speedMult;
    moveX = player.slideDir.x * slideSpeed;
    moveZ = player.slideDir.z * slideSpeed;
  } else if (wishLen > 0) {
    moveX = wishX / wishLen * targetSpeed;
    moveZ = wishZ / wishLen * targetSpeed;
  }

  const accel = player.onGround ? 12 : 3;
  player.vel.x = lerp(player.vel.x, moveX, Math.min(1, accel * dt));
  player.vel.z = lerp(player.vel.z, moveZ, Math.min(1, accel * dt));

  if (keys.Space && player.onGround && !player.sliding) {
    player.yVel = 5.0;
    player.onGround = false;
  }
  player.yVel -= 13.5 * dt;
  let groundY = 0;
  for (const b of colliders) {
    if (b.maxY !== null && player.pos.x >= b.minX - 0.3 && player.pos.x <= b.maxX + 0.3 &&
        player.pos.z >= b.minZ - 0.3 && player.pos.z <= b.maxZ + 0.3) {
      if (b.maxY > groundY && player.pos.y >= b.maxY - 0.5) {
        groundY = b.maxY;
      }
    }
  }

  player.pos.y += player.yVel * dt;
  if (player.pos.y <= groundY) { player.pos.y = groundY; player.yVel = 0; player.onGround = true; }

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  resolveCollision(player.pos, player.radius);

  let targetEye = eyeStand;
  if (player.sliding) targetEye = eyeSlide;
  else if (player.crouching) targetEye = 1.0;
  eyeHeight = lerp(eyeHeight, targetEye, Math.min(1, 10 * dt));
  const speed2d = Math.hypot(player.vel.x, player.vel.z);
  if (speed2d > 0.5 && player.onGround && !player.sliding) bobT += dt * speed2d * 1.6;
  const bobY = Math.sin(bobT) * 0.035;

  camera.position.set(player.pos.x, player.pos.y + eyeHeight + bobY, player.pos.z);
  camKick = lerp(camKick, 0, Math.min(1, 12 * dt));
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + camKick;

  // Kamera-Wackeln (Schaden / Explosionen)
  shake = Math.max(0, shake - 2.4 * dt);
  if (shake > 0.01) {
    camera.rotation.x += (Math.random() - 0.5) * 0.035 * shake;
    camera.rotation.y += (Math.random() - 0.5) * 0.035 * shake;
  }

  const targetFov = isAds
    ? SETTINGS.fov * 0.74
    : SETTINGS.fov + (player.sliding ? 9 : (player.sprinting ? 7 : 0));
  camera.fov = lerp(camera.fov, targetFov, Math.min(1, 10 * dt));
  camera.updateProjectionMatrix();

  const yawD = player.yaw - prevYaw, pitchD = player.pitch - prevPitch;
  prevYaw = player.yaw; prevPitch = player.pitch;
  swayY = lerp(swayY, clamp(yawD * 5, -0.1, 0.1), Math.min(1, 10 * dt));
  swayP = lerp(swayP, clamp(pitchD * 5, -0.1, 0.1), Math.min(1, 10 * dt));

  // Waffe: Hüftanschlag ↔ Zielen (ADS) weich überblenden
  gunKick = lerp(gunKick, 0, Math.min(1, 14 * dt));
  adsBlend = lerp(adsBlend, isAds ? 1 : 0, Math.min(1, 12 * dt));
  const bobScale = 1 - adsBlend * 0.85;
  gunGroup.position.z = lerp(-0.45, -0.3, adsBlend) + gunKick * 0.08;
  gunGroup.position.y = lerp(-0.24, -0.153, adsBlend) + Math.sin(bobT * 2) * 0.007 * bobScale + (w.reloading ? -0.13 : 0);
  gunGroup.position.x = lerp(0.26, 0, adsBlend) + Math.sin(bobT) * 0.004 * bobScale;
  gunGroup.rotation.x = (w.reloading ? -0.55 : gunKick * 0.12) + swayP * 1.4 * bobScale;
  gunGroup.rotation.y = swayY * 1.4 * bobScale;

  // Schrittgeräusche
  if (speed2d > 1 && player.onGround && !player.sliding) {
    stepT -= dt * speed2d;
    if (stepT <= 0) { playFootstep(player.sprinting); stepT = 2.3; }
  } else {
    stepT = Math.min(stepT, 0.6);
  }

  // Messer-Animation
  knifeCd -= dt;
  if (knifeT > 0) {
    knifeT -= dt;
    const p = 1 - knifeT / 0.28;
    knifeGroup.visible = true;
    knifeGroup.position.set(0.35 - Math.sin(p * Math.PI) * 0.38, -0.28 + Math.sin(p * Math.PI) * 0.1, -0.45 - Math.sin(p * Math.PI) * 0.18);
    knifeGroup.rotation.z = -p * 1.1;
    knifeGroup.rotation.x = Math.sin(p * Math.PI) * 0.4;
    if (p > 0.35 && !knifeHitDone) {
      knifeHitDone = true;
      knifeStrike();
    }
  } else {
    knifeGroup.visible = false;
  }

  muzzleT -= dt;
  const flashOn = muzzleT > 0;
  if (muzzleFlash) {
    muzzleFlash.material.opacity = flashOn ? rand(0.6, 1) : 0;
    muzzleFlash.rotation.z = rand(0, Math.PI);
  }
  muzzleLight.intensity = flashOn ? 40 : 0;

  fireCooldown -= dt;
  if ((w.def.auto && mouseDown) || (!w.def.auto && mouseClicked)) {
    if (document.pointerLockElement === renderer.domElement || testMode) fireWeapon();
  }
  mouseClicked = false;

  if (elapsed - player.lastHit > 4 && player.health < player.maxHealth) {
    player.health = Math.min(player.maxHealth, player.health + 22 * dt);
  }
}

// ---------------- Spiel-Loop ----------------
const clock = new THREE.Clock();
let elapsed = 0;
let groanT = 3, dripT = 6, heartT = 0;
let fpsAcc = 0, fpsFrames = 0;
let testMode = false;

function updateSpawning(dt) {
  if (!state.betweenRounds) {
    state.spawnT -= dt;
    const aliveList = zombies.filter(z => z.state !== 'dead');
    const alive = aliveList.length;
    if (state.leftToSpawn > 0 && alive < maxAlive() && state.spawnT <= 0) {
      spawnZombie();
      state.leftToSpawn--;
      state.spawnT = spawnInterval();
    }
    // Rage: Die letzten 3 Zombies der Runde rasten aus
    if (state.leftToSpawn === 0 && !state.rageApplied && !state.dogRound && alive > 0 && alive <= 3) {
      state.rageApplied = true;
      for (const z of aliveList) {
        if (z.isDog || z.isCrawler) continue;
        z.raged = true;
        z.isRunner = true;
        z.speed = Math.min(5, Math.max(z.speed * 1.5, 3.4));
        if (z.actions) {
          for (const n of ['walk', 'run']) if (z.actions[n]) z.actions[n].timeScale = z.speed / ANIM_BASE_SPEED[n];
          if (z.actions.scream && !z.climbing) { z.playAnim('scream', 0.15); z.attackAnimT = 1.1; }
        }
        playGroan(z.pos.x, z.pos.z);
      }
      toast('⚠ DIE LETZTEN DREHEN DURCH!');
    }
    if (state.leftToSpawn === 0 && alive === 0 && zombies.length === 0) {
      state.betweenRounds = true;
      state.betweenT = 5;
      if (state.dogRound) spawnPowerup('maxammo', player.pos.x, player.pos.z);
      ui.roundflash.textContent = 'RUNDE ' + state.round + ' ÜBERSTANDEN';
      ui.roundflash.style.opacity = 1;
      setTimeout(() => { ui.roundflash.style.opacity = 0; }, 2000);
      sfx.roundEnd();
    }
  } else {
    state.betweenT -= dt;
    if (state.betweenT <= 0) startRound(state.round + 1);
  }
}

function render() {
  if (bloomOn) composer.render();
  else renderer.render(scene, camera);
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.started || state.paused || state.over) { render(); return; }
  elapsed += dt;
  updateDynamicTrees();

  // Zone 0 (Orange) - weiches Flackern eines schwachen Glühfadens
  // (defensiv: manche Maps haben weniger als 4 Zonen-Lichter, siehe map2.json)
  if (lights[0]) lights[0].intensity = 75 + Math.sin(elapsed * 12) * Math.random() * 15;

  // Zone 1 (Blau) - unregelmäßiges Neon-Flackern (kaputte Röhre)
  if (lights[1]) {
    const neon = Math.random() < 0.05 ? 12 : (95 + Math.sin(elapsed * 45) * 15);
    lights[1].intensity = neon;
  }

  // Zone 2 (Grün) - langsames, atemartiges Pulsieren (Giftmüll-Vibe)
  if (lights[2]) lights[2].intensity = 75 + Math.sin(elapsed * 3.5) * 20;

  // Zone 3 (Rot) - schnelles Alarm-Pulsieren
  if (lights[3]) lights[3].intensity = 100 + Math.sin(elapsed * 18) * 35;

  updateSpawning(dt);

  // Zombie-Stöhnen aus der echten Richtung des Zombies
  groanT -= dt;
  if (groanT <= 0) {
    groanT = rand(2, 5);
    const chasing = zombies.filter(z => z.state === 'chase');
    if (chasing.length) {
      const z = chasing[Math.random() * chasing.length | 0];
      playGroan(z.pos.x, z.pos.z);
    }
  }

  // Wassertropfen-Ambiente im Bunker
  dripT -= dt;
  if (dripT <= 0) {
    dripT = rand(4, 10);
    if (SETTINGS.ambient) playDrip();
  }

  // Herzschlag bei niedrigem Leben
  if (player.health < player.maxHealth * 0.35) {
    heartT -= dt;
    if (heartT <= 0) {
      playHeartbeat();
      heartT = lerp(0.55, 1.0, player.health / (player.maxHealth * 0.35));
    }
  }

  updatePlayer(dt);
  updateZombies(dt);
  updateEffects(dt);
  updatePowerups(dt);
  updateGrenades(dt);
  updateMystery(dt);

  for (const it of interactables) {
    if (it.holder) it.holder.rotation.y += dt * 0.4;
  }

  const it = nearestInteractable();
  if (it) {
    ui.prompt.classList.remove('hidden');
    promptDenyT -= dt;
    ui.prompt.classList.toggle('deny', promptDenyT > 0);
    ui.prompt.textContent = promptDenyT > 0 ? 'Nicht möglich!' : 'E — ' + it.label();
  } else {
    ui.prompt.classList.add('hidden');
    promptDenyT = 0;
  }

  hitmarkerT -= dt;
  if (hitmarkerT <= 0) ui.hitmarker.style.opacity = 0;
  dmgdirT = Math.max(0, dmgdirT - dt * 1.1);
  ui.dmgdir.style.opacity = Math.min(1, dmgdirT * 1.5);
  damageFlash = Math.max(0, damageFlash - dt * 1.4);
  const lowHp = player.health < 40 * (player.maxHealth / 100) ? 0.25 : 0;
  const dmgOpac = Math.min(1, damageFlash + lowHp);
  ui.damage.style.opacity = dmgOpac;
  const bo = $('blood-overlay');
  if (bo) {
    if (SETTINGS.bloodScreen) {
      const hpRatio = player.health / player.maxHealth;
      let bloodOpac = Math.max(0, 1 - hpRatio - 0.2) * 1.5 + damageFlash * 0.8;
      if (hpRatio < 0.35) {
        // Pulsieren basierend auf kritischem Herzschlag
        const pulse = Math.sin(elapsed * 12) * 0.18 + 0.82;
        bloodOpac *= pulse;
      }
      bo.style.opacity = Math.min(1, bloodOpac);
    } else {
      bo.style.opacity = 0;
    }
  }
  flashT = Math.max(0, flashT - dt * 1.5);
  ui.flash.style.opacity = flashT * 0.8;

  updateHUD();

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    ui.fps.textContent = Math.round(fpsFrames / fpsAcc) + ' FPS';
    fpsAcc = 0; fpsFrames = 0;
  }

  render();
}
tick();

// ---------------- Einstellungen anwenden / UI ----------------
function applySettings() {
  const q = SETTINGS.quality;
  const cap = q === 'niedrig' ? 0.75 : q === 'mittel' ? 1.25 : Math.min(devicePixelRatio, 2);
  // Render-Auflösung: >100% = Supersampling gegen Pixel-Kanten
  const ratio = Math.min(Math.min(devicePixelRatio, cap) * SETTINGS.resScale, 3);
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  composer.setSize(innerWidth, innerHeight);
  bloomOn = q === 'hoch';
  ssaoPass.enabled = false;
  renderPass.enabled = true;

  // Echtzeit-Schatten (Hoch: 1024er Maps)
  const wantShadows = q === 'hoch';
  const res = 1024;
  if (renderer.shadowMap.enabled !== wantShadows) {
    renderer.shadowMap.enabled = wantShadows;
    scene.traverse(o => {
      if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { mm.needsUpdate = true; });
      }
    });
  }
  for (const l of lampLights) {
    l.castShadow = wantShadows && l.userData.shadowCapable;
    if (l.shadow.mapSize.x !== res) {
      l.shadow.mapSize.set(res, res);
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
  }
  realShadows = wantShadows;
  muzzleLight.castShadow = wantShadows;
  for (const z of zombies) if (z.shadow) z.shadow.visible = !realShadows;

  for (const c of volumeCones) c.visible = q !== 'niedrig';
  ui.grain.style.display = (SETTINGS.grain && q !== 'niedrig') ? '' : 'none';
  ui.fps.style.display = SETTINGS.showFps ? '' : 'none';
  maxDecals = q === 'niedrig' ? 12 : 40;
  casingsEnabled = q !== 'niedrig';
  if (state.started && !state.over) {
    if (SETTINGS.ambient) startAmbient(); else stopAmbient();
  }
}

const QDESC = {
  niedrig: 'Reduzierte Auflösung, keine Extras — für sehr schwache GPUs',
  mittel: 'Ausgewogen, ohne Schatten — für Office-Laptops',
  hoch: 'Echtzeit-Schatten + Bloom — für Gaming-Laptops (GTA5-Klasse)',
};
function refreshSettingsUI() {
  document.querySelectorAll('#settings .qbtns button').forEach(b => {
    b.classList.toggle('active', b.dataset.q === SETTINGS.quality);
  });
  $('qdesc').textContent = QDESC[SETTINGS.quality];
  $('set-res').value = SETTINGS.resScale;
  $('resval').textContent = Math.round(SETTINGS.resScale * 100) + '%';
  $('set-fov').value = SETTINGS.fov;
  $('fovval').textContent = SETTINGS.fov;
  $('set-sens').value = SETTINGS.sens;
  $('sensval').textContent = SETTINGS.sens.toFixed(1);
  $('set-grain').checked = SETTINGS.grain;
  $('set-ambient').checked = SETTINGS.ambient;
  $('set-fps').checked = SETTINGS.showFps;
  $('set-vol').value = SETTINGS.volume;
  $('volval').textContent = Math.round(SETTINGS.volume * 100) + '%';
  const sB = $('set-blood'); if(sB) sB.checked = SETTINGS.bloodScreen;
}

document.querySelectorAll('#settings .qbtns button').forEach(b => {
  b.addEventListener('click', () => {
    SETTINGS.quality = b.dataset.q;
    saveSettings(); applySettings(); refreshSettingsUI();
  });
});
$('set-res').addEventListener('input', e => {
  SETTINGS.resScale = parseFloat(e.target.value);
  $('resval').textContent = Math.round(SETTINGS.resScale * 100) + '%';
  saveSettings();
  applySettings();
});
$('set-fov').addEventListener('input', e => {
  SETTINGS.fov = parseInt(e.target.value);
  $('fovval').textContent = SETTINGS.fov;
  saveSettings();
});
$('set-sens').addEventListener('input', e => {
  SETTINGS.sens = parseFloat(e.target.value);
  $('sensval').textContent = SETTINGS.sens.toFixed(1);
  saveSettings();
});
$('set-vol').addEventListener('input', e => {
  SETTINGS.volume = parseFloat(e.target.value);
  $('volval').textContent = Math.round(SETTINGS.volume * 100) + '%';
  if (audioListener) audioListener.setMasterVolume(SETTINGS.volume);
  saveSettings();
});
$('set-grain').addEventListener('change', e => { SETTINGS.grain = e.target.checked; saveSettings(); applySettings(); });
$('set-ambient').addEventListener('change', e => { SETTINGS.ambient = e.target.checked; saveSettings(); applySettings(); });
$('set-fps').addEventListener('change', e => { SETTINGS.showFps = e.target.checked; saveSettings(); applySettings(); });
const sB2 = $('set-blood'); if(sB2) sB2.addEventListener('change', e => { SETTINGS.bloodScreen = e.target.checked; saveSettings(); });
$('opensettings').addEventListener('click', () => { refreshSettingsUI(); ui.settings.classList.remove('hidden'); });
$('pausesettings').addEventListener('click', () => { refreshSettingsUI(); ui.settings.classList.remove('hidden'); });
$('closesettings').addEventListener('click', () => ui.settings.classList.add('hidden'));

const quitHandler = () => {
  window.close();
};
$('quitbtn').addEventListener('click', quitHandler);
$('pausequitbtn').addEventListener('click', quitHandler);

// Dezente Umgebungs-Reflexionen auf allen Standard-Materialien
scene.traverse(o => {
  if (o.isMesh && o.material && o.material.isMeshStandardMaterial && o.material.envMapIntensity === 1) {
    o.material.envMapIntensity = 0.25;
  }
});

applySettings();

// ---------------- Start / Pause / Restart ----------------
function requestLock() {
  initAudio();
  if (audioListener && audioListener.context.state === 'suspended') {
    audioListener.context.resume().catch(() => {});
  }
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => { testMode = true; });
  } catch (e) { 
    testMode = true; 
  }
}

ui.cta.addEventListener('click', () => {
  if (!assetsLoaded || state.started) return;
  initAudio();
  startAmbient();
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  state.started = true;
  startRound(1);
  requestLock();
});

$('continuebtn').addEventListener('click', () => {
  ui.pause.classList.add('hidden');
  state.paused = false;
  requestLock();
});
$('pauserestart').addEventListener('click', () => location.reload());
$('restart').addEventListener('click', () => location.reload());

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && state.started && !state.over && !testMode) {
    state.paused = true;
    ui.pause.classList.remove('hidden');
  }
});

// Debug-Hook
window.__debug = {
  state, player, zombies, doors, zones, SETTINGS, mystery, windows,
  fire: fireWeapon, interact: tryInteract, kill: z => killZombie(z, false),
  knife: doKnife, grenade: throwGrenade, powerup: spawnPowerup,
  toast, spawn: spawnZombie, damage: damagePlayer, hitZombie, limbDebris,
  applySettings, giveWeapon,
  render, canvas: () => renderer.domElement, renderer, camera, zAssets, THREE,
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  gltfLoaded: () => !!zAssets.tpose,
  assetsLoaded: () => assetsLoaded,
  activeMap: () => ACTIVE_MAP_ID,
  // Wechselt die aktive Map (vorerst der einzige Umschalt-Mechanismus, kein
  // UI). Setzt nur das Flag und lädt neu — ein Live-Wechsel ohne Reload
  // würde ein komplettes Neu-Aufbauen der Szene brauchen.
  setMap(id) {
    localStorage.setItem('untot_map', id);
    location.reload();
  },
  step(n = 60, dt = 1 / 60) {
    for (let i = 0; i < n; i++) {
      elapsed += dt;
      updateSpawning(dt);
      updatePlayer(dt);
      updateZombies(dt);
      updateEffects(dt);
      updatePowerups(dt);
      updateGrenades(dt);
      updateMystery(dt);
      scene.updateMatrixWorld(true);
    }
    updateHUD();
  },
};

console.log('[UNTOT] Spiel geladen — bereit.');
