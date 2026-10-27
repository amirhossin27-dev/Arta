# Arta-Push-Relay 🔔

Damit Mitteilungen auch dann ankommen, wenn Arta auf dem Handy **ganz geschlossen** ist, braucht es diesen kleinen Weiterleitungs-Server. Er läuft kostenlos bei Cloudflare.

**Warum?** Die Push-Dienste von Google (Android), Apple (iPhone) und Mozilla nehmen keine Anfragen direkt aus dem Browser an. Der Worker reicht die Mitteilung nur durch:

- Die Nachricht ist schon auf dem sendenden Handy **für das Empfänger-Handy verschlüsselt** (RFC 8291) – der Worker sieht nur Zeichensalat.
- Er speichert nichts und hat keine Schlüssel.
- Er leitet nur an die bekannten Push-Dienste weiter und nimmt nur Anfragen von Arta an (`ALLOWED_ORIGINS` oben in `worker.js`).

Außerdem liefert er eure **gemeinsamen Termine an den iPhone-Kalender** (Kalender-Abo):

- Jedes Handy legt seine Termine verschlüsselt in euren Live-Raum. Den Kalender-Schlüssel kennt nur die Abo-Adresse, die ihr in Arta unter **📅 Termine → 📲 iPhone-Kalender** bekommt.
- Holt der Kalender das Abo ab, liest der Worker die beiden Einträge, entschlüsselt sie kurz, führt sie zusammen und gibt eine .ics-Datei zurück. Gespeichert wird nichts – nur ein Zeitstempel „zuletzt abgeholt“ landet im Raum, damit Arta „✓ Abo läuft“ anzeigen kann.
- Für einzelne Termine schickt er unter `/termin.ics` die Datei zurück, die die App ihm mitgibt – so zeigt Safari auf dem iPhone „Zum Kalender hinzufügen“.

## Update für die Termine (wenn der Worker schon läuft)

Wer den Worker schon für die Mitteilungen eingerichtet hat, muss ihn einmal aktualisieren – sonst steht in Arta „Der Arta-Push-Relay kann noch keine Kalender“:

1. Auf **https://dash.cloudflare.com** → **„Workers & Pages“** → euren Worker (z. B. `arta-push`) öffnen.
2. **„Code bearbeiten“ / „Edit code“** → den Code komplett löschen und den neuen Inhalt von [`worker.js`](worker.js) einfügen → **„Bereitstellen“ / „Deploy“**.
3. Prüfen: Die Adresse des Workers mit `/kalender` am Ende im Browser öffnen (z. B. `https://arta-push.<dein-name>.workers.dev/kalender`) – dort muss **„Arta-Kalender ✓“** stehen.

Die Adresse bleibt gleich, in Arta muss nichts geändert werden.

## Einrichten (einmalig, ca. 5 Minuten)

1. Auf **https://dash.cloudflare.com/sign-up** ein kostenloses Konto anlegen (E-Mail bestätigen, keine Kreditkarte nötig).
2. Im Dashboard links **„Workers & Pages“** öffnen (manchmal unter „Compute“) → **„Erstellen“ / „Create“** → **„Mit Hello World beginnen“ / „Start with Hello World!“**.
3. Als Namen z. B. `arta-push` eingeben → **„Bereitstellen“ / „Deploy“**.
4. Auf **„Code bearbeiten“ / „Edit code“** tippen, den vorhandenen Code komplett löschen und den Inhalt von [`worker.js`](worker.js) einfügen → **„Bereitstellen“ / „Deploy“**.
5. Die Adresse des Workers kopieren, sie sieht so aus: `https://arta-push.<dein-name>.workers.dev`. Im Browser geöffnet zeigt sie **„Arta-Push-Relay läuft ✓ · mit Kalender ✓“**.
6. Die Adresse in [`src/lib/liveConfig.ts`](../src/lib/liveConfig.ts) bei `DEFAULT_PUSH_URL` eintragen (oder Claude schicken). Nach dem nächsten Veröffentlichen ist Push aktiv.

## Danach auf beiden Handys

1. Arta einmal öffnen (damit die neue Version geladen ist), am besten über das Symbol auf dem Home-Bildschirm.
2. Unter **Liebe** auf „Ja, gerne 💞“ tippen oder in den ⚙️ Einstellungen unter **🔔 Mitteilungen** auf „An“ – und die Frage des Handys erlauben.
3. In den Einstellungen sollte dann stehen: **„✓ Kommt auch an, wenn Arta ganz geschlossen ist.“**

iPhone: Mitteilungen gehen nur, wenn Arta auf dem Home-Bildschirm liegt (Safari → Teilen ⬆️ → „Zum Home-Bildschirm“) und iOS mindestens 16.4 ist.

## Kosten & Grenzen

Der kostenlose Cloudflare-Tarif erlaubt 100.000 Anfragen pro Tag – für zwei Handys mehr als genug (auch ein Kalender, der alle 15 Minuten abholt, braucht nur knapp 100 am Tag). Fällt der Worker einmal aus, kommen die Mitteilungen eben nur, solange Arta läuft, und der iPhone-Kalender behält den letzten Stand; die Daten selbst gehen weiter über den Live-Sync.

Läuft Arta einmal unter einer anderen Adresse als `https://amirhossin27-dev.github.io`, muss diese oben in `worker.js` bei `ALLOWED_ORIGINS` ergänzt werden.
