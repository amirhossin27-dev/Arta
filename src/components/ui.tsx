import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addDays, fromKey, startOfWeek, todayKey, weekdayShort } from '../lib/date';
import { cls } from '../lib/hooks';

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
  fit,
}: {
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  small?: boolean;
  /** Breite nach Beschriftung statt gleich breit – für einen längeren Reiter. */
  fit?: boolean;
}) {
  return (
    <div className={cls('segmented', small && 'small', fit && 'fit')} role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} className={cls('seg', v === value && 'active')} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cls('chips', className)}>
      {options.map(([v, label]) => (
        <button key={v} className={cls('chip', v === value && 'active')} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProgressRing({
  value,
  max,
  size = 96,
  stroke = 10,
  children,
  className,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div className={cls('ring', className, value > max && 'over')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <div className={cls('bar', className)}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function WeekStrip({ value, onChange, marks }: { value: string; onChange: (k: string) => void; marks?: (k: string) => number }) {
  const today = todayKey();
  const start = startOfWeek(value);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="week">
      <button className="week-nav" onClick={() => onChange(addDays(value, -7))} aria-label="Vorige Woche">
        ‹
      </button>
      {days.map((k) => (
        <button key={k} className={cls('day', k === value && 'active', k === today && 'today')} onClick={() => onChange(k)} aria-label={k}>
          <span className="day-wd">{weekdayShort(k)}</span>
          <span className="day-num">{fromKey(k).getDate()}</span>
          <span className={cls('day-dot', marks && marks(k) > 0 && 'on')} />
        </button>
      ))}
      <button className="week-nav" onClick={() => onChange(addDays(value, 7))} aria-label="Nächste Woche">
        ›
      </button>
    </div>
  );
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-emoji">{emoji}</div>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Stepper({ value, min = 1, max = 12, onChange, label }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="stepper">
      <button className="icon-btn small" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Weniger" disabled={value <= min}>
        −
      </button>
      <span className="stepper-value">
        {value}
        {label ? ` ${label}` : ''}
      </span>
      <button className="icon-btn small" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Mehr" disabled={value >= max}>
        +
      </button>
    </div>
  );
}
