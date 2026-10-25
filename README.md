# Arta 💞 – Liebe, Sport & Genuss

Arta ist eine App für Paare: Ihr plant zusammen Sport, Essen und Einkäufe, motiviert euch gegenseitig und schickt euch zwischendurch kleine Liebesbotschaften.

Sie läuft als **Web-App im Browser** und lässt sich wie eine normale App auf den Home-Bildschirm legen (PWA). Sie braucht **kein Konto und keinen Server**: Alle Daten bleiben auf euren Handys.

## Was Arta kann

**🏠 Heute**
- Persönliche Begrüßung und eine „Liebe des Tages“
- Gemeinsame Herzpunkte mit Paar-Level (von „Frisch verliebt“ bis „Legenden der Liebe“), Paar-Serie und Wochenziel
- „Unser Tag“: Fortschritt von euch beiden nebeneinander, mit Anfeuern-Knopf
- Mein Tagesplan (morgens, mittags, abends) mit Sport und Essen
- Stimmungs-Check und „Frage des Tages“ für euch zwei

**💪 Sport**
- Jeden Tag ein neues Angebot an Grundeinheiten: 5 für zuhause, 3 für draußen und 2 Partner-Übungen
- 50 Übungen mit Anleitung, Dauer, Schwierigkeit und kcal (berechnet aus eurem Gewicht)
- Einplanen für dich, deinen Schatz (als kleine Challenge 😜) oder euch beide, mit Uhrzeit, bis zu 2 Wochen im Voraus
- Eingebauter Timer, Wochenansicht und Bonuspunkte, wenn ihr eine gemeinsame Einheit beide schafft

**🥗 Essen**
- Tägliche kcal-Bilanz (Tagesziel + Sport − Essen) mit Eiweiß, Kohlenhydraten und Fett
- „Gerichte des Tages“ und ein Rezeptbuch mit 34 einfachen, gesunden Rezepten
- Nährwerte werden aus den Zutaten berechnet; Portionen sind umrechenbar
- Schnell-Eintrag für Alltagsessen (Döner, Cappuccino, Pizza …) oder eigene Einträge
- Zutaten mit einem Tipp auf die Einkaufsliste, Favoriten, kcal-Rechner

**🛒 Einkauf**
- Gemeinsame Liste mit automatischen Kategorien („500 g Quark“ und „2 Avocados“ werden erkannt)
- Abhaken, aufräumen und die Liste per WhatsApp verschicken

**💞 Liebe**
- Zähler „Tage zusammen“, Countdown zum nächsten Jahrestag und Meilensteine
- Herzen senden, Liebesbotschaften (auch als versteckte Überraschung, die beim anderen zufällig auftaucht)
- Liebes-Gutscheine verschenken und einlösen, Date-Ideen-Generator

**🌸 Zyklus (Reiter unter „Liebe“)**
- Periodenkalender: Beginn und Ende der Periode eintragen, Blutungsstärke, Symptome und Notizen als Tagebuch
- Vorhersage der nächsten Perioden, des Eisprungs und der fruchtbaren Tage – je mehr Einträge, desto genauer (Durchschnitt der letzten Zyklen)
- Aktueller Zyklustag und Phase (Menstruation, Follikelphase, Eisprung, Lutealphase) mit Erklärung, Sport- und Ernährungstipps
- Tipps für beide: was ihr selbst guttut und wie der Partner unterstützen kann – passend zu Phase und eingetragenen Symptomen
- Wissen: Fruchtbarkeit & Kinderwunsch, Schwangerschaftstest, Schwangerschaft mit Geburtstermin-Rechner, Geburt, Wochenbett & Baby, wann zur Frauenärztin
- Kurzer Hinweis auf der Heute-Seite für euch beide
- Die Vorhersagen sind Schätzungen – kein Verhütungsmittel und kein Ersatz für ärztliche Beratung

**🎮 Spiele (Arta Arcade)**
- Kurze Klassiker für zwischendurch, an einem Handy zu zweit oder allein
- Zu zweit: Tic-Tac-Toe, Vier gewinnt, Pärchen-Memory, Pong-Duell (gegenübersitzen!) und Blitz-Duell (wer tippt schneller, wenn das Herz erscheint?) – die meisten auch gegen den Computer „Arta 🤖“
- Solo mit Highscore-Duell: Herz-Schlange (Snake im Game-Boy-Look), Herz-Breakout und Herz-Simon
- Einsatz wählen: Wer verliert, schenkt dem anderen automatisch einen Liebes-Gutschein (Kuss, Massage, Abwasch …)
- Gesamtwertung mit Krone 👑, Siege und Rekorde werden beim Sync geteilt; 8-Bit-Sounds lassen sich abschalten

**✨ Liebes-Einblendungen**
Kleine Pop-ups, Herzchen und Konfetti: beim Öffnen, nach jedem Workout, wenn der Tagesplan geschafft ist und zwischendurch. Wie oft das passiert, stellt ihr in den Einstellungen ein.

## So verbindet ihr eure zwei Handys

Arta hat absichtlich keinen Server. Deshalb funktioniert das Synchronisieren über einen Link:

1. Person A richtet Arta ein und tippt oben auf **🔄**, dann auf **„Link senden“** (z. B. per WhatsApp).
2. Person B öffnet den Link. Arta erkennt die Einladung und richtet sich automatisch als „die andere Person“ ein.
3. Ab dann schickt ihr euch ab und zu so einen Link, z. B. abends. Pläne, Essen, Einkaufsliste, Botschaften, Gutscheine, Herzen und Spielstände werden zusammengeführt.

Die Daten stecken im Teil hinter dem `#` des Links. Dieser Teil wird nie an einen Server übertragen, auch nicht an GitHub.

> 📱 **iPhone-Tipp:** Ist Arta auf dem Home-Bildschirm installiert, öffnet iOS Links in Safari statt in der App. Dann einfach die ganze Nachricht kopieren und in Arta unter 🔄 → „Stand übernehmen“ einfügen.

Ihr habt nur ein gemeinsames Gerät? Tippt oben auf eure beiden Symbole, um zu wechseln, wer gerade dran ist.

## Starten

### Variante 1: Online über GitHub Pages (empfohlen fürs Handy)

1. Auf GitHub im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
2. Sobald der Code auf `main` liegt, baut und veröffentlicht GitHub die App automatisch.
3. Danach ist sie erreichbar unter **https://amirhossin27-dev.github.io/Arta/**
4. Auf dem Handy öffnen und zum Home-Bildschirm hinzufügen:
   - **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“

### Variante 2: Lokal auf dem Computer

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run dev
```

Dann im Browser `http://localhost:5173` öffnen. Vite zeigt auch eine Netzwerk-Adresse (z. B. `http://192.168.0.10:5173`), die ihr im gleichen WLAN auf dem Handy öffnen könnt.

Weitere Befehle:

| Befehl | Zweck |
| --- | --- |
| `npm test` | Tests ausführen |
| `npm run build` | Fertige App nach `dist/` bauen |
| `npm run preview` | Gebaute App lokal ansehen (inkl. Offline-Modus) |

## Technik

- React 19 + TypeScript, gebaut mit Vite
- Speicherung im Browser (`localStorage`), Offline-Unterstützung über einen Service Worker
- Sync: Datenstand wird komprimiert (`deflate`) in den Link gepackt und per „last-writer-wins“ zusammengeführt
- Keine externen Dienste, keine Tracker

```
src/
  data/        Übungen, Rezepte, Zutaten-Nährwerte, Liebestexte, Zyklus-Wissen
  lib/         Speicher, Sync, Statistik, kcal-Berechnung, Tagesangebot, Zyklus-Rechnung
  components/  Wiederverwendbare Bausteine, Detailansichten, Einblendungen
  games/       Spiele (Logik, Arcade-Bildschirm, Canvas-Spielschleife, 8-Bit-Sounds)
  screens/     Heute, Sport, Essen, Einkauf, Liebe, Spiele, Einrichtung
```

**Hinweis:** kcal- und Nährwerte sind Richtwerte und ersetzen keine Ernährungs- oder Trainingsberatung. Die Zyklus-Vorhersagen sind Schätzungen nach der Kalendermethode, kein Verhütungsmittel und kein Ersatz für ärztliche Beratung.
