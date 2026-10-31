import { Component, type ReactNode } from 'react';
import { Empty, Sheet } from './ui';

/**
 * Fängt Abstürze ab: Statt eines weißen Bildschirms (als App auf dem iPhone gibt es dort nicht
 * einmal einen Neu-laden-Knopf) erscheint eine kurze Meldung mit einem Ausweg.
 */
export class CrashGuard extends Component<{ children: ReactNode; fallback: (retry: () => void) => ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}

const reload = () => window.location.reload();

/** Ein Bereich ist abgestürzt – ohne `retry` hilft nur noch neu laden. */
export function Crashed({ retry, retryLabel = 'Nochmal versuchen' }: { retry?: () => void; retryLabel?: string }) {
  return (
    <Empty emoji="😵" title="Hoppla, hier ist etwas schiefgelaufen">
      <p>Deine Daten sind sicher gespeichert.</p>
      <div className="btn-row">
        {retry && (
          <button className="btn primary" onClick={retry}>
            {retryLabel}
          </button>
        )}
        <button className={retry ? 'btn soft' : 'btn primary'} onClick={reload}>
          🔄 Arta neu laden
        </button>
      </div>
    </Empty>
  );
}

/** Ein Tab ist abgestürzt – Kopfleiste und die anderen Tabs gehen weiter. */
export function TabCrashed({ retry }: { retry: () => void }) {
  return (
    <div className="card">
      <Crashed retry={retry} />
    </div>
  );
}

/** Ein Fenster oder Spiel ist abgestürzt: einfach schließen, der Rest läuft weiter. */
export function SheetCrashed({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Hoppla 😵" onClose={onClose}>
      <Crashed retry={onClose} retryLabel="Schließen" />
    </Sheet>
  );
}

/** Ganz Arta ist abgestürzt. */
export function AppCrashed() {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <Crashed />
      </div>
    </div>
  );
}
