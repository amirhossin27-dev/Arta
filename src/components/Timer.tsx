import { useEffect, useRef, useState } from 'react';
import { showLove } from '../lib/love';

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    window.setTimeout(() => ctx.close(), 1000);
  } catch {
    // Kein Audio verfügbar
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Timer({ seconds }: { seconds: number }) {
  const [total, setTotal] = useState(seconds);
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const leftRef = useRef(left);
  leftRef.current = left;

  useEffect(() => {
    if (!running) return;
    const end = Date.now() + leftRef.current * 1000;
    const id = window.setInterval(() => {
      const l = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        setRunning(false);
        beep();
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          // ignorieren
        }
        showLove({ emoji: '⏱️', title: 'Zeit um!', text: 'Stark durchgehalten – kurz durchatmen. 💪', tone: 'sport' });
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const adjust = (delta: number) => {
    const next = Math.max(10, total + delta);
    setTotal(next);
    if (!running) setLeft(next);
  };

  const pct = total > 0 ? 1 - left / total : 0;

  return (
    <div className="timer">
      <div className="timer-face" style={{ ['--pct' as string]: pct }}>
        <span className="timer-time">{fmt(left)}</span>
      </div>
      <div className="timer-controls">
        <button className="icon-btn" onClick={() => adjust(-10)} aria-label="10 Sekunden weniger" disabled={running}>
          −10
        </button>
        <button
          className="btn primary"
          onClick={() => {
            if (left === 0) setLeft(total);
            setRunning((r) => !r);
          }}
        >
          {running ? '⏸ Pause' : left === 0 ? '↺ Nochmal' : '▶ Start'}
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            setRunning(false);
            setLeft(total);
          }}
          aria-label="Zurücksetzen"
        >
          ↺
        </button>
        <button className="icon-btn" onClick={() => adjust(10)} aria-label="10 Sekunden mehr" disabled={running}>
          +10
        </button>
      </div>
    </div>
  );
}
