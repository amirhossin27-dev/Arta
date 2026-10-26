# Arta-Push-Relay 🔔

Damit Mitteilungen auch dann ankommen, wenn Arta auf dem Handy **ganz geschlossen** ist, braucht es diesen kleinen Weiterleitungs-Server. Er läuft kostenlos bei Cloudflare.

**Warum?** Die Push-Dienste von Google (Android), Apple (iPhone) und Mozilla nehmen keine Anfragen direkt aus dem Browser an. Der Worker reicht die Mitteilung nur durch:

- Die Nachricht ist schon auf dem sendenden Handy **für das Empfänger-Handy verschlüsselt** (RFC 8291) – der Worker sieht nur Zeichensalat.
- Er speichert nichts und hat keine Schlüssel.
- Er leitet nur an die bekannten Push-Dienste weiter und nimmt nur Anfragen von Arta an (`ALLOWED_ORIGINS` oben in `worker.js`).

## Einrichten (einmalig, ca. 5 Minuten)

1. Auf **https://dash.cloudflare.com/sign-up** ein kostenloses Konto anlegen (E-Mail bestätigen, keine Kreditkarte nötig).
2. Im Dashboard links **„Workers & Pages“** öffnen (manchmal unter „Compute“) → **„Erstellen“ / „Create“** → **„Mit Hello World beginnen“ / „Start with Hello World!“**.
3. Als Namen z. B. `arta-push` eingeben → **„Bereitstellen“ / „Deploy“**.
4. Auf **„Code bearbeiten“ / „Edit code“** tippen, den vorhandenen Code komplett löschen und den Inhalt von [`worker.js`](worker.js) einfügen → **„Bereitstellen“ / „Deploy“**.
5. Die Adresse des Workers kopieren, sie sieht so aus: `https://arta-push.<dein-name>.workers.dev`. Im Browser geöffnet zeigt sie **„Arta-Push-Relay läuft ✓“**.
6. Die Adresse in [`src/lib/liveConfig.ts`](../src/lib/liveConfig.ts) bei `DEFAULT_PUSH_URL` eintragen (oder Claude schicken). Nach dem nächsten Veröffentlichen ist Push aktiv.

## Danach auf beiden Handys

1. Arta einmal öffnen (damit die neue Version geladen ist), am besten über das Symbol auf dem Home-Bildschirm.
2. Unter **Liebe** auf „Ja, gerne 💞“ tippen oder in den ⚙️ Einstellungen unter **🔔 Mitteilungen** auf „An“ – und die Frage des Handys erlauben.
3. In den Einstellungen sollte dann stehen: **„✓ Kommt auch an, wenn Arta ganz geschlossen ist.“**

iPhone: Mitteilungen gehen nur, wenn Arta auf dem Home-Bildschirm liegt (Safari → Teilen ⬆️ → „Zum Home-Bildschirm“) und iOS mindestens 16.4 ist.

## Kosten & Grenzen

Der kostenlose Cloudflare-Tarif erlaubt 100.000 Anfragen pro Tag – für zwei Handys mehr als genug. Fällt der Worker einmal aus, kommen die Mitteilungen eben nur, solange Arta läuft; die Daten selbst gehen weiter über den Live-Sync.

Läuft Arta einmal unter einer anderen Adresse als `https://amirhossin27-dev.github.io`, muss diese oben in `worker.js` bei `ALLOWED_ORIGINS` ergänzt werden.
