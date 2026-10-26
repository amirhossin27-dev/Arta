/**
 * Schritterkennung aus dem Beschleunigungssensor (inkl. Schwerkraft), unabhängig davon, wie das
 * Handy gehalten wird: Wir betrachten nur die Stärke der Beschleunigung, glätten sie leicht und
 * ziehen den langsam mitlaufenden Mittelwert (≈ Schwerkraft) ab. Jeder Ausschlag über die
 * Schwelle ist ein Schritt-Kandidat.
 *
 * Damit Schütteln, Hinlegen oder Tippen nicht als Gehen zählen, gelten Schritte erst, wenn
 * mehrere davon in gleichmäßigem Takt aufeinander folgen. Dann werden sie nachträglich
 * mitgezählt, danach zählt jeder weitere Schritt im Takt sofort.
 */
export class StepDetector {
  /** Ausschlag über dem Mittelwert, ab dem ein Schritt zählt (m/s²). */
  static HIGH = 0.6;
  /** Erst wenn der Ausschlag wieder darunter fällt, kann der nächste Schritt kommen. */
  static LOW = 0.1;
  /** Glättung des Signals (Sekunden). */
  static TAU = 0.07;
  /** Schneller als ~4 Schritte pro Sekunde läuft niemand. */
  static MIN_GAP = 250;
  /** Längere Pause → Gehen beendet. */
  static MAX_GAP = 2000;
  /** So viele Schritte im Takt, bevor wir an echtes Gehen glauben. */
  static CONFIRM = 6;
  /** Wie ungleichmäßig der Takt beim Loslaufen sein darf (längster ÷ kürzester Abstand). */
  static RHYTHM = 1.35;

  private lastT = NaN;
  private smooth = 0;
  private base = 0;
  private armed = true;
  private lastStep = -Infinity;
  private walking = false;
  /** Mittlerer Schrittabstand beim Gehen (ms). */
  private pace = 0;
  private candidates: number[] = [];

  /**
   * Ein Sensorwert (Zeit in ms). Gibt zurück, wie viele Schritte neu gezählt wurden.
   * `touching`: Gerade wurde auf den Bildschirm getippt – dieser Stoß ist kein Schritt.
   */
  push(t: number, x: number, y: number, z: number, touching = false): number {
    const m = Math.hypot(x, y, z);
    if (!Number.isFinite(m)) return 0;
    if (Number.isNaN(this.lastT) || t - this.lastT > 1000 || t < this.lastT) {
      // Erster Wert oder lange Lücke (App war im Hintergrund): neu einschwingen.
      this.lastT = t;
      this.smooth = this.base = m;
      this.armed = true;
      this.walking = false;
      this.candidates = [];
      return 0;
    }
    const dt = (t - this.lastT) / 1000;
    this.lastT = t;
    // Zeitbasierte Filter, damit 30-Hz- und 100-Hz-Sensoren gleich reagieren.
    this.smooth += (1 - Math.exp(-dt / StepDetector.TAU)) * (m - this.smooth);
    this.base += (1 - Math.exp(-dt / 1.2)) * (m - this.base);
    const delta = this.smooth - this.base;

    if (!this.armed) {
      if (delta < StepDetector.LOW) this.armed = true;
      return 0;
    }
    if (delta < StepDetector.HIGH) return 0;
    this.armed = false;
    if (touching) return 0;
    const gap = t - this.lastStep;
    if (gap < StepDetector.MIN_GAP) return 0;

    if (this.walking) {
      // Ein Stoß mitten zwischen zwei Schritten (Tippen, Nachfedern) zählt nicht.
      if (gap < this.pace * 0.6) return 0;
      this.lastStep = t;
      if (gap <= Math.min(StepDetector.MAX_GAP, this.pace * 1.7)) {
        this.pace += 0.2 * (gap - this.pace);
        return 1;
      }
      this.walking = false;
      this.candidates = [t];
      return 0;
    }

    this.lastStep = t;
    if (gap > StepDetector.MAX_GAP) this.candidates = [];
    this.candidates.push(t);
    if (this.candidates.length > StepDetector.CONFIRM) this.candidates.shift();
    if (this.candidates.length < StepDetector.CONFIRM) return 0;
    const gaps = this.candidates.slice(1).map((c, i) => c - this.candidates[i]);
    if (Math.max(...gaps) > Math.min(...gaps) * StepDetector.RHYTHM) return 0;
    const n = this.candidates.length;
    this.pace = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    this.candidates = [];
    this.walking = true;
    return n;
  }
}
