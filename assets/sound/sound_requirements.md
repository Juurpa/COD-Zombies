# 🧟‍♂️ Der ultimative Sound-Guide (Director's Cut)

Wenn das Spiel ein "richtig krankes" Meisterwerk werden soll, muss das Sound-Design extrem detailliert sein. Hier ist die exakte Regie-Anweisung für **jedes einzelne Soundfile**, das du brauchst. 

Alle Sounds sollten trocken (ohne künstlichen Hall) und hochauflösend (z.B. `.wav` bei der Erstellung, später `.mp3` oder `.ogg`) sein.

## 📁 WICHTIG: Dateiaufteilung (Einzeln vs. Kombiniert)
In der Spieleentwicklung gibt es eine goldene Regel dafür, wie Sounds abgespeichert werden müssen:

1. **Sachen, die oft passieren (Schüsse, Schritte, Zombie-Stöhnen):** 
   Müssen **immer einzelne Dateien** sein! Mache niemals eine lange Datei mit 5 Schüssen hintereinander. 
   *Richtig:* `ak47_shoot_1.wav`, `ak47_shoot_2.wav`, `ak47_shoot_3.wav`. 
   *Warum?* Das Spiel wählt bei jedem Klick per Zufall **eine** dieser Dateien aus. So klingt es nicht wie ein Maschinengewehr aus der Dose.
2. **Komplexe, feste Abläufe (Nachladen einer Waffe):**
   Sollte **genau 1 Datei** sein, die den gesamten Ablauf am Stück enthält (Magazin raus, Magazin rein, Durchladen). 
   *Richtig:* `ak47_reload.wav` (Dauer: ca. 1.5 bis 2 Sekunden).
3. **Lange Hintergrundgeräusche (Ambience, Maschinen-Brummen):**
   Sollte **1 lange Datei** sein (ca. 10 bis 30 Sekunden), die so geschnitten ist, dass sie nahtlos im Kreis ("Loop") laufen kann.

---

## 1. 🧟 Zombies (Die Bedrohung)
Die Zombies müssen furchteinflößend und eklig klingen. Wir brauchen extrem viele Variationen, damit man nie merkt, dass sich etwas wiederholt.

*   **zombie_idle_1 bis zombie_idle_8 (Wandern/Suchen)**
    *   *Klang:* Tiefes, nasses Gurgeln im Hals. Ein Röcheln, als hätten sie Schleim und Blut in der Lunge. Ab und zu ein unregelmäßiges, pfeifendes Einatmen. 
    *   *Vibe:* Krank, langsam, erstickend.
*   **zombie_chase_1 bis zombie_chase_6 (Spieler entdeckt / Rennen)**
    *   *Klang:* Der Sound wird abrupt lauter. Ein tierisches, wütendes Kreischen oder ein tiefes, brüllendes Keuchen. Klingt aggressiv und panisch zugleich.
    *   *Vibe:* Der Spieler soll sofort Herzklopfen bekommen, wenn er das hört.
*   **zombie_attack_1 bis zombie_attack_5 (Zuschlagen)**
    *   *Klang:* Ein extrem kurzes, heftiges Zischen oder Ausatmen ("Haaa!"), begleitet vom Geräusch zerreißender Luft (Swoosh der Hände).
*   **zombie_hit_1 bis zombie_hit_5 (Zombie wird getroffen)**
    *   *Klang:* Nasses, dumpfes Klatschen (wie wenn man rohes Fleisch auf einen Tisch wirft) + ein abrupt abgebrochenes, schmerzerfülltes Aufstöhnen des Zombies.
*   **zombie_headshot_1 bis zombie_headshot_4 (Der wichtigste Sound!)**
    *   *Klang:* Ein explosionsartiges "Splat". Wie eine reife Wassermelone, die mit einem Vorschlaghammer zerschmettert wird. Dazu ein lautes Knacken von Knochen und feuchtes Spritzen.
    *   *Vibe:* Extrem befriedigend und extrem eklig.
*   **zombie_death_1 bis zombie_death_5 (Sterben)**
    *   *Klang:* Ein langes, hohles Röcheln, bei dem die letzte Luft entweicht, gefolgt von einem schweren, dumpfen Aufprall eines Körpers auf hartem Boden ("Thud").

---

## 2. 🔫 Waffen (Punch & Mechanik)
Jede Waffe muss sich massiv anfühlen. Jede Kugel muss im Bauch spürbar sein. 

*   **Pistole / Revolver (`revolver_shoot_1` bis `3` -> 3 einzelne Dateien!)**
    *   *Klang:* Ein extrem scharfer, ohrenbetäubender Peitschenknall ("Crack") im hohen Frequenzbereich. Weniger Bass, dafür ein extrem lautes metallisches Klicken im Hintergrund (der Schlitten/die Trommel, die zurückschlägt).
*   **Revolver Nachladen (`revolver_reload.wav` -> 1 Datei am Stück!)**
    *   *Klang:* Schweres Metall. Das Ausklappen der Trommel ("Klack"), das leise Rieseln der Patronenhülsen ("Kling-Kling"), das Einschieben der neuen Patronen ("Sch-Sch-Sch") und das wuchtige, befriedigende Einrasten der Trommel ("Klak-Tsching!").
*   **Sturmgewehr / AK47 (`ak47_shoot_1` bis `4` -> 4 einzelne Dateien!)**
    *   *Klang:* Sehr viel Bass. Ein aggressives, ohrenbetäubendes Wummern, das in der Brust drückt. Jeder Schuss muss ein langes, metallisches Echo nach sich ziehen.
*   **AK47 Nachladen (`ak47_reload.wav` -> 1 Datei am Stück!)**
    *   *Klang:* Aggressives Metall-auf-Metall-Kratzen. Magazin wird hart herausgerissen, neues Magazin knallt brutal rein ("Clack-Clack"), gefolgt vom Durchziehen des Ladehebels ("Ratsch-Klack").
*   **Schrotflinte (`shotgun_shoot_1` bis `3` -> 3 einzelne Dateien!)**
    *   *Klang:* Der absolut lauteste Waffensound im Spiel. Ein massiver, ohrenbetäubender Knall mit extremem Bass ("KABOOM"). 
*   **Schrotflinte Pump-Action (`shotgun_pump.wav` -> 1 Datei)**
    *   *Klang:* Ein langsames, sehr befriedigendes und sattes "Tsch-Tschak". Sehr viel Bassanteil, damit es sich mächtig anfühlt.
*   **MG42 (`mg42_shoot_1` bis `4` -> 4 einzelne Dateien!)**
    *   *Klang:* Eine kreischende Kreissäge aus Metall. Die Schüsse verschmelzen fast zu einem einzigen, extrem bedrohlichen Rattern.

---

## 3. 💥 Impact & Kugel-Einschläge (Die Umgebung lebt)
Wenn du daneben schießt, muss man das hören!
*   **bullet_hit_concrete_1-5:** Ein heller, harter Knall ("Pew!"), begleitet von bröckelndem, rieselndem Staub und Stein.
*   **bullet_hit_wood_1-5:** Dumpfes, massives Splittern. Wie ein dicker Ast, der in der Mitte durchgebrochen wird.
*   **bullet_hit_flesh_1-5:** Feuchtes, klebriges Pitschten (das gleiche wie `zombie_hit`, aber ohne Zombie-Stimme).

---

## 4. 🏃‍♂️ Spieler & Bewegung (Das Gefühl von Gewicht)
*   **footstep_concrete_1-8 (Schritte)**
    *   *Klang:* Staubige Schuhsohlen auf hartem Beton. Ein schwerer, dumpfer Auftritt.
*   **player_sprint_breath_loop**
    *   *Klang:* Panisches, schweres und unregelmäßiges Atmen. Klingt nach purer Angst und Erschöpfung.
*   **player_heartbeat**
    *   *Klang:* Extrem tiefer Sub-Bass (hörst du fast nur mit Kopfhörern). "Bumm-Bumm..... Bumm-Bumm". Wird schneller, je näher man dem Tod ist.
*   **player_damage_1-3**
    *   *Klang:* Ein kurzes, raues Aufstöhnen. Klingt, als würde man in den Magen geboxt werden.

---

## 5. 🏚️ Welt-Interaktionen (Das Gameplay)
*   **barricade_repair_1-3 (Fenster reparieren)**
    *   *Klang:* Ein lautes, klapperndes Hämmern ("Klonk, Klonk"), Holzbretter quietschen und kratzen übereinander.
*   **barricade_break_1-3 (Zombie reißt Bretter ab)**
    *   *Klang:* Reißendes, gewaltsam splitterndes Holz, gefolgt von aufschlagenden Brettern auf dem Boden.
*   **buy_door_1-2 (Trümmer / Türen wegräumen)**
    *   *Klang:* Schweres Schieben von Geröll, bröckelnder Stein, quietschendes rostiges Metall. Ein Sound, der "Befreiung" suggeriert.

---

## 6. 👹 Announcer & UI (Gänsehaut-Faktor)
Das UI darf nicht nach einem normalen Videospiel klingen, es muss in die Horror-Welt passen.
*   **points_pickup_1-4 (Punkte bekommen)**
    *   *Klang:* Ein sehr schnelles, scharfes "Kassenklingeln" (Cha-Ching), aber tiefer gepitcht und vielleicht gemischt mit einem leisen Messer-Zischen.
*   **error_buzzer (Geld reicht nicht)**
    *   *Klang:* Ein extrem ungemütlicher, tiefer, kratziger Buzzer. Kein Piepsen, sondern ein fieses, elektrisches Brummen ("ÖÖÖT").
*   **round_start (Neue Welle)**
    *   *Klang:* Wie aus "Inception" oder "Silent Hill". Ein ohrenbetäubender, tiefer, metallischer Schrei/Horn-Sound ("BRAAAWM"), begleitet von kratzigen Streichinstrumenten und einem leisen, unheimlichen Flüstern im Hintergrund.
*   **round_end (Welle überlebt)**
    *   *Klang:* Etwas Beruhigendes, aber extrem Gruseliges. Eine alte, verstimmte Spieluhr, die 3 Noten spielt, oder ein ferner Glockenschlag.

*   **Der Dämonen-Announcer (Die magischen Drops)**
    *   *Vibe:* Die Stimme muss extrem tief, kratzig, echoend und diabolisch klingen.
    *   `announcer_maxammo`: Langsam und genüsslich gesprochen: "MAAAX... AMMMOOO!"
    *   `announcer_instakill`: Geflüstert, aber ohrenbetäubend laut: "Insta-Kill."
    *   `announcer_doublepoints`: Verrückt lachend gesprochen.
    *   `announcer_dogs`: "Fetch me their souls!" (Hol mir ihre Seelen) gefolgt von einem lauten Donnerschlag und Wolfsheulen.

---

## 7. 🎁 Power-Ups & Automaten
*   **powerup_loop (Drop liegt auf dem Boden)**
    *   *Klang:* Ein durchgehendes, magisches, sirrendes Leuchten (wie ein kaputtes Radio gemischt mit Engeschören).
*   **powerup_pickup (Drop aufgesammelt)**
    *   *Klang:* Ein massiver, belohnender "Wusch"-Sound (Swoosh), der den ganzen Raum füllt.
*   **mysterybox_open / _close**
    *   *Klang:* Ein schweres, altes Holzknarren, Metallschlösser brechen auf. Ein himmlisches, aber unheimliches Glimmen ertönt.
*   **mysterybox_spin_loop**
    *   *Klang:* Schnelles, surrendes Rattern (wie ein Glücksrad aus der Hölle).
*   **perk_drink**
    *   *Klang:* Glasflasche ploppt auf, lautes Schlucken (Gluck, Gluck, Gluck), gefolgt von einem tiefen, satten Rülpser.
