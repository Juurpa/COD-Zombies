import os
import time
from elevenlabs.client import ElevenLabs

# ==========================================
# KONFIGURATION
# ==========================================
# Trage hier deinen ElevenLabs API Key ein:
API_KEY = "sk_a12b3416020b0d0234a18332212340e98adb2cbbbb017ab1"

# Der Ordner, in dem die Sounds gespeichert werden sollen:
OUTPUT_DIR = r"c:\Users\Felix\OneDrive\Desktop\Stuff for Games\Sound"

# Hier habe ich deine Markdown-Anforderungen in strukturierte Aufgaben übersetzt.
# Die Prompts wurden auf Englisch übersetzt, da die ElevenLabs Sound Effects API 
# mit englischen Begriffen deutlich bessere und realistischere Ergebnisse liefert.
SOUND_TASKS = [
    # 1. Zombies
    {"name": "zombie_idle", "count": 8, "prompt": "Deep, wet gurgling in the throat. A death rattle, coughing up phlegm and blood. Occasional irregular, whistling breath. Sick, slow, suffocating zombie sound."},
    {"name": "zombie_chase", "count": 6, "prompt": "Abrupt loud animalistic, angry screeching and deep, roaring panting. Aggressive, fast and panicked zombie chase sound."},
    {"name": "zombie_attack", "count": 5, "prompt": "Extremely short, violent hissing and exhaling 'Haaa!', accompanied by the sound of ripping air, swift swoosh of hands."},
    {"name": "zombie_hit", "count": 5, "prompt": "Wet, dull slapping sound of raw meat hitting a table, combined with an abruptly cut off, pained moan of a zombie."},
    {"name": "zombie_headshot", "count": 4, "prompt": "Explosive, extremely satisfying splat. Like a ripe watermelon being smashed with a sledgehammer. Loud bone cracking and wet blood splattering."},
    {"name": "zombie_death", "count": 5, "prompt": "A long, hollow death rattle where the last air escapes, followed by a heavy, dull thud of a dead body dropping on hard ground."},

    # 2. Waffen
    {"name": "revolver_shoot", "count": 3, "prompt": "Extremely sharp, deafening whip-like crack of a revolver gunshot in the high frequency range. Very loud metallic click in the background of the cylinder snapping back."},
    {"name": "revolver_reload", "count": 1, "prompt": "Heavy metal gun mechanism. Popping out the revolver cylinder, the quiet clinking of brass bullet casings falling out, sliding in new bullets, and a hefty, satisfying metallic click of the cylinder snapping back into place."},
    {"name": "ak47_shoot", "count": 4, "prompt": "Aggressive, deafening booming gunshot of an AK47 assault rifle with lots of bass. Each shot has a long, metallic echo."},
    {"name": "ak47_reload", "count": 1, "prompt": "Aggressive metal-on-metal scraping. Assault rifle magazine brutally ripped out, new magazine slammed in with a clack-clack, followed by the heavy sliding and ratcheting of the charging handle."},
    {"name": "shotgun_shoot", "count": 3, "prompt": "Massive, incredibly loud, deafening shotgun blast with extreme bass. KABOOM sound."},
    {"name": "shotgun_pump", "count": 1, "prompt": "Slow, very satisfying, heavy metallic pump-action sound of a shotgun (ch-chak). Heavy bass component."},
    {"name": "mg42_shoot", "count": 4, "prompt": "Screaming metal circular saw sound. Rapid fire machine gun MG42 shooting, shots blending into a continuous, extremely threatening metallic rattle."},

    # 3. Impacts
    {"name": "bullet_hit_concrete", "count": 5, "prompt": "Bright, hard crack of a bullet hitting solid concrete, accompanied by crumbling, falling dust and stone debris."},
    {"name": "bullet_hit_wood", "count": 5, "prompt": "Dull, massive splintering sound of a bullet hitting wood. Like a thick branch violently snapping in half."},
    {"name": "bullet_hit_flesh", "count": 5, "prompt": "Wet, sticky, meaty squishing sound of a bullet penetrating flesh and blood."},

    # 4. Spieler & Bewegung
    {"name": "footstep_concrete", "count": 8, "prompt": "Dusty shoe soles stepping on hard concrete. A heavy, dull footstep sound."},
    {"name": "player_sprint_breath_loop", "count": 1, "prompt": "Panicked, heavy, and irregular breathing of a human sprinting. Sounds like pure fear and exhaustion."},
    {"name": "player_heartbeat", "count": 1, "prompt": "Extremely deep, sub-bass human heartbeat. Thump-thump. Pumping blood, high tension."},
    {"name": "player_damage", "count": 3, "prompt": "Short, rough, pained gasp of a human taking damage. Sounds like getting punched hard in the stomach."},

    # 5. Welt-Interaktionen
    {"name": "barricade_repair", "count": 3, "prompt": "Loud, clattering hammering on wood, wooden boards squeaking and scraping against each other while repairing a barricade."},
    {"name": "barricade_break", "count": 3, "prompt": "Tearing, violently splintering wood, followed by wooden boards crashing onto the floor."},
    {"name": "buy_door", "count": 2, "prompt": "Heavy pushing of debris, crumbling stone, and squeaking rusty metal hinges. Sound of clearing a path or opening a heavy locked door."},

    # 6. Announcer & UI
    {"name": "points_pickup", "count": 4, "prompt": "Very fast, sharp cash register cha-ching sound, but pitch-shifted down and mixed with a subtle, quiet knife swoosh."},
    {"name": "error_buzzer", "count": 1, "prompt": "Extremely uncomfortable, deep, scratchy error buzzer. A nasty, electrical hum (bzzzt) indicating access denied or not enough money."},
    {"name": "round_start", "count": 1, "prompt": "Inception style. Deafening, deep, metallic horn blare (BRAWWWWW), accompanied by scratchy string instruments and quiet, creepy whispering in the background. Horror ambience."},
    {"name": "round_end", "count": 1, "prompt": "Soothing but extremely creepy. An old, detuned music box playing three slow notes, followed by a distant, echoing church bell toll."},
    
    # Dämonen-Announcer
    {"name": "announcer_maxammo", "count": 1, "prompt": "Demonic, extremely deep, scratchy, echoing voice saying slowly and deliciously: 'MAX... AMMO!'"},
    {"name": "announcer_instakill", "count": 1, "prompt": "Demonic, echoing voice whispering but extremely loud: 'Insta-Kill.'"},
    {"name": "announcer_doublepoints", "count": 1, "prompt": "Demonic, deep echoing voice saying 'Double Points' with a crazy, evil laugh."},
    {"name": "announcer_dogs", "count": 1, "prompt": "Demonic voice shouting: 'Fetch me their souls!' followed by a loud thunderclap and terrifying wolf howling."},

    # 7. Power-Ups & Automaten
    {"name": "powerup_loop", "count": 1, "prompt": "Continuous, magical, buzzing glowing hum. Like a broken radio mixed with an eerie angelic choir."},
    {"name": "powerup_pickup", "count": 1, "prompt": "Massive, rewarding, room-filling magical swoosh sound of collecting a power-up."},
    {"name": "mysterybox_open", "count": 1, "prompt": "Heavy, old wooden creaking, metal locks breaking open. A heavenly but eerie magical glow sound emerges."},
    {"name": "mysterybox_close", "count": 1, "prompt": "Heavy wooden lid slamming shut violently with a clatter of metal locks and chains."},
    {"name": "mysterybox_spin_loop", "count": 1, "prompt": "Fast, whirring, ratcheting clicking sound of a heavy mechanical wheel spinning rapidly. Wheel of fortune from hell."},
    {"name": "perk_drink", "count": 1, "prompt": "Glass bottle popping open, loud gulping (glug, glug, glug), followed by a deep, satisfying belch."}
]

# ==========================================

def generate_all_sounds():
    if API_KEY == "DEIN_API_KEY_HIER":
        print("Fehler: Bitte trage deinen ElevenLabs API Key in das Skript ein.")
        return

    # Initialisiere den ElevenLabs Client
    client = ElevenLabs(api_key=API_KEY)
    
    # Sicherstellen, dass das Ausgabe-Verzeichnis existiert
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total_files = sum(task['count'] for task in SOUND_TASKS)
    print(f"Starte Generierung von insgesamt {total_files} Sound-Dateien...")

    current_file = 0
    for task in SOUND_TASKS:
        name_prefix = task["name"]
        count = task["count"]
        prompt = task["prompt"]

        print(f"\n--- Generiere {count}x '{name_prefix}' ---")
        
        for i in range(1, count + 1):
            current_file += 1
            filename = f"{name_prefix}_{i}.mp3" if count > 1 else f"{name_prefix}.mp3"
            filepath = os.path.join(OUTPUT_DIR, filename)

            # Überspringen, falls Datei schon existiert (gut falls das Skript abstürzt)
            if os.path.exists(filepath):
                print(f"  [{current_file}/{total_files}] '{filename}' existiert bereits. Überspringe...")
                continue

            print(f"  [{current_file}/{total_files}] Erstelle '{filename}'...")
            
            try:
                # Soundeffekt generieren
                audio_generator = client.text_to_sound_effects.convert(
                    text=prompt,
                    duration_seconds=None, # ElevenLabs wählt die optimale Länge
                    prompt_influence=0.4   # Balance zwischen Vorgabe und Kreativität
                )

                # Audio-Daten in die Datei schreiben
                with open(filepath, "wb") as f:
                    for chunk in audio_generator:
                        f.write(chunk)
                
                print(f"    -> Gespeichert!")
                
                # Kurze Pause, um Rate-Limits der API zu vermeiden
                time.sleep(1.5)

            except Exception as e:
                print(f"    -> Fehler beim Generieren von '{filename}': {e}")
                # Wenn es ein Rate-Limit-Fehler ist, etwas länger warten
                if "rate limit" in str(e).lower():
                    print("    -> Rate Limit erreicht. Warte 10 Sekunden...")
                    time.sleep(10)

if __name__ == "__main__":
    generate_all_sounds()
