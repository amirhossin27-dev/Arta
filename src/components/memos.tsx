import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { formatDateTime } from '../lib/date';
import { cls, usePeople } from '../lib/hooks';
import { useLive } from '../lib/live';
import { heartBurst, showLove } from '../lib/love';
import {
  agoText,
  isUnseen,
  itemsOf,
  lastChange,
  matchesMemo,
  MAX_ITEM_TEXT,
  MAX_MEMO_ITEMS,
  MAX_MEMO_TEXT,
  MAX_MEMO_TITLE,
  MAX_MEMOS,
  MEMO_COLORS,
  MEMO_EMOJIS,
  MEMO_TEMPLATES,
  memoIsEmpty,
  memoLabel,
  sortedMemos,
  templateById,
  type MemoTemplate,
} from '../lib/memos';
import { uid } from '../lib/random';
import { alive } from '../lib/stats';
import { actions, getData, useData, useDevice } from '../lib/store';
import type { Memo, MemoColor, MemoItem } from '../lib/types';
import { nav } from '../lib/ui';
import { Empty, Sheet } from './ui';

/** Kopfzeile und Vorschau einer Notiz – ohne Titel wird die erste Textzeile zur Überschrift. */
function tileText(m: Memo): { head: string; body: string } {
  const title = m.title.trim();
  const text = m.text.trim();
  if (title) return { head: title, body: text };
  const [first = '', ...rest] = text.split('\n');
  return { head: first.trim() || 'Notiz', body: rest.join('\n').trim() };
}

function MemoTile({ memo, onOpen }: { memo: Memo; onOpen: () => void }) {
  const data = useData();
  const device = useDevice();
  const items = itemsOf(data, memo.id);
  const open = items.filter((i) => !i.done);
  const change = lastChange(data, memo);
  const who = data.persons[change.by];
  const unseen = isUnseen(data, memo, device.me, device.memosSeen);
  const { head, body } = tileText(memo);
  return (
    <button className={cls('memo-tile', `memo-${memo.color}`, unseen && 'unseen')} onClick={onOpen}>
      {memo.pinned && (
        <span className="memo-pin" aria-label="angepinnt">
          📌
        </span>
      )}
      <b className="memo-tile-title">
        {memo.emoji} {head}
      </b>
      {body && <span className="memo-tile-text">{body}</span>}
      {items.length > 0 && (
        <span className="memo-tile-items">
          {open.slice(0, 3).map((i) => (
            <span key={i.id}>○ {i.text}</span>
          ))}
          <span className="memo-tile-progress">
            {open.length === 0 ? '🎉 alles erledigt' : `☑️ ${items.length - open.length}/${items.length} erledigt${open.length > 3 ? ` · +${open.length - 3}` : ''}`}
          </span>
        </span>
      )}
      <span className="memo-tile-meta">
        {unseen && <span className="memo-new">neu</span>}
        {who.emoji} {who.name} · {agoText(change.at)}
      </span>
    </button>
  );
}

function TemplateChips({ onPick, active }: { onPick: (t: MemoTemplate) => void; active?: string }) {
  return (
    <div className="chips memo-templates">
      {MEMO_TEMPLATES.map((t) => (
        <button key={t.id} className={cls('chip', active === t.id && 'active')} onClick={() => onPick(t)}>
          {t.emoji} {t.title || 'Freie Notiz'}
        </button>
      ))}
    </div>
  );
}

/** Karte auf „Heute“: angepinnte und zuletzt geänderte Notizen. */
export function MemosCard() {
  const data = useData();
  const all = sortedMemos(data);
  const list = all.slice(0, 4);
  return (
    <div className="card memos-card">
      <div className="card-head">
        <h2>📝 Unsere Notizen</h2>
        {all.length > 0 && (
          <button className="link" onClick={() => nav.open({ type: 'memos' })}>
            Alle{all.length > list.length ? ` (${all.length})` : ''}
          </button>
        )}
      </div>
      {list.length ? (
        <>
          <div className="memo-grid">
            {list.map((m) => (
              <MemoTile key={m.id} memo={m} onOpen={() => nav.open({ type: 'memo', id: m.id })} />
            ))}
          </div>
          <button className="btn soft block small memos-add" onClick={() => nav.open({ type: 'memo' })}>
            + Neue Notiz
          </button>
        </>
      ) : (
        <>
          <p className="muted small">Packliste, Geschenkideen, Filme für den nächsten Kuschelabend – schreibt es hier zusammen auf. Ihr könnt beide alles ändern und abhaken. ✨</p>
          <TemplateChips onPick={(t) => nav.open({ type: 'memo', template: t.id })} />
        </>
      )}
    </div>
  );
}

export function MemosSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const { partner } = usePeople();
  const live = useLive();
  const [query, setQuery] = useState('');
  const all = sortedMemos(data);
  const list = all.filter((m) => matchesMemo(data, m, query));
  return (
    <Sheet title="📝 Unsere Notizen" onClose={onClose}>
      <button className="btn primary block" onClick={() => nav.open({ type: 'memo', back: true })}>
        + Neue Notiz
      </button>
      {all.length >= 5 && <input type="search" className="memo-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Notizen durchsuchen …" />}
      {all.length === 0 && (
        <Empty emoji="🗒️" title="Noch keine Notizen">
          Fangt mit einer Vorlage an – oder schreibt einfach drauflos. 💞
          <TemplateChips onPick={(t) => nav.open({ type: 'memo', template: t.id, back: true })} />
        </Empty>
      )}
      {query && list.length === 0 && <p className="muted center">Nichts gefunden für „{query.trim()}“.</p>}
      {list.length > 0 && (
        <div className="memo-grid">
          {list.map((m) => (
            <MemoTile key={m.id} memo={m} onOpen={() => nav.open({ type: 'memo', id: m.id, back: true })} />
          ))}
        </div>
      )}
      {all.length > 0 && (
        <p className="hint center">{live ? `⚡ Ihr seid live verbunden – ${partner.name} sieht jede Änderung sofort.` : `Eure Notizen kommen beim nächsten Paar-Sync auch bei ${partner.name} an.`}</p>
      )}
    </Sheet>
  );
}

// ───────────────────────── Bearbeiten ─────────────────────────

function ItemRow({ item, onCheck }: { item: MemoItem; onCheck: (item: MemoItem, e: MouseEvent) => void }) {
  const [value, setValue] = useState(item.text);
  const [focused, setFocused] = useState(false);
  // Änderungen vom anderen Handy übernehmen – aber nicht, während du hier gerade tippst.
  useEffect(() => {
    if (!focused) setValue(item.text);
  }, [item.text, focused]);
  return (
    <div className={cls('memo-item', item.done && 'done')}>
      <button className={cls('memo-check', item.done && 'on')} role="checkbox" aria-checked={item.done} aria-label={item.text} onClick={(e) => onCheck(item, e)}>
        {item.done ? '✓' : ''}
      </button>
      <input
        value={value}
        maxLength={MAX_ITEM_TEXT}
        aria-label="Punkt"
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          actions.renameMemoItem(item.id, value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button className="icon-btn small ghost" onClick={() => actions.removeMemoItem(item.id)} aria-label={`„${item.text}“ löschen`}>
        ✕
      </button>
    </div>
  );
}

type Fields = Pick<Memo, 'title' | 'text' | 'emoji' | 'color'>;

export function MemoSheet({ id, template, back, onClose }: { id?: string; template?: string; back?: boolean; onClose: () => void }) {
  const data = useData();
  const device = useDevice();
  const { me, partner } = usePeople();
  const live = useLive();
  const [memoId] = useState(() => id ?? uid());
  const rec: Memo | undefined = data.memos[memoId];
  const memo = rec && !rec.deleted ? rec : undefined;
  const [tpl, setTpl] = useState(() => (id ? undefined : templateById(template) ?? MEMO_TEMPLATES[0]));
  const [title, setTitle] = useState(memo?.title ?? tpl?.title ?? '');
  const [text, setText] = useState(memo?.text ?? '');
  const [emoji, setEmoji] = useState(memo?.emoji ?? tpl?.emoji ?? '📝');
  const [color, setColor] = useState<MemoColor>(memo?.color ?? tpl?.color ?? 'gelb');
  const [pickEmoji, setPickEmoji] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  // Getippt, aber noch nicht gespeichert.
  const dirty = useRef(false);
  // Hier neu angelegt: beim Schließen leer → wegräumen, sonst dem Schatz Bescheid geben.
  const createdHere = useRef(!id);
  const latest = useRef<Fields>({ title, text, emoji, color });
  latest.current = { title, text, emoji, color };

  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    actions.saveMemo(memoId, latest.current);
  }, [memoId]);

  // Automatisch speichern, kurz nachdem du aufhörst zu tippen – der Schatz sieht es dann (live) gleich.
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(flush, 600);
    return () => window.clearTimeout(t);
  }, [title, text, emoji, color, flush]);

  // Geht die App in den Hintergrund, sofort speichern. Beim Schließen (auch ohne „Fertig“) aufräumen.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
      const d = getData();
      const m = d.memos[memoId];
      if (!createdHere.current || !m || m.deleted) return;
      if (memoIsEmpty(d, m)) actions.removeMemo(memoId);
      else actions.announceMemo(memoId);
    };
  }, [flush, memoId]);

  // Hat der Schatz die Notiz geändert, während sie hier offen ist? Dann seinen Stand zeigen –
  // außer du tippst gerade, dann gewinnt dein Stand.
  const remoteStamp = memo && memo.editedBy !== device.me ? memo.updatedAt : 0;
  useEffect(() => {
    const m = getData().memos[memoId];
    if (!remoteStamp || dirty.current || !m) return;
    setTitle(m.title);
    setText(m.text);
    setEmoji(m.emoji);
    setColor(m.color);
  }, [remoteStamp, memoId]);

  // Das Textfeld wächst mit dem Text mit (die Seite scrollt, nicht das Feld).
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  const items = itemsOf(data, memoId);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const change = memo ? lastChange(data, memo) : undefined;
  useEffect(() => {
    if (change) actions.markMemoSeen(memoId, change.at);
  }, [change?.at, memoId]);

  // Vorlage: Listen springen gleich zum ersten Punkt, freie Notizen in den Text.
  useEffect(() => {
    if (id) return;
    const t = window.setTimeout(() => (tpl?.list ? itemRef.current : textRef.current)?.focus(), 250);
    return () => window.clearTimeout(t);
  }, [tpl, id]);

  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      dirty.current = true;
      set(v);
    };

  const pickTemplate = (t: MemoTemplate) => {
    setTpl(t);
    // Titel nur vorschlagen, solange er leer ist oder noch der vorige Vorschlag drinsteht.
    if (!title.trim() || MEMO_TEMPLATES.some((x) => x.title === title.trim())) setTitle(t.title);
    setEmoji(t.emoji);
    setColor(t.color);
  };

  const full = !rec && alive(data.memos).length >= MAX_MEMOS;
  const itemsFull = items.length >= MAX_MEMO_ITEMS;

  const addItem = () => {
    if (!newItem.trim() || itemsFull) return;
    flush();
    if (actions.addMemoItem(memoId, newItem, latest.current)) setNewItem('');
    itemRef.current?.focus();
  };

  const check = (item: MemoItem, e: MouseEvent) => {
    actions.setMemoItemDone(item.id, !item.done);
    if (item.done) return;
    heartBurst(e, '✨', 4);
    if (open.length === 1 && items.length > 1) {
      const label = memo ? memoLabel(getData(), memo) : 'Die Liste';
      showLove({ emoji: '🎉', title: 'Alles abgehakt!', text: `„${label}“ ist komplett. Ihr seid ein tolles Team! 💞`, tone: 'party' });
    }
  };

  const togglePin = () => {
    dirty.current = false;
    actions.saveMemo(memoId, { ...latest.current, pinned: !memo?.pinned });
  };

  const close = () => (back ? nav.open({ type: 'memos' }) : onClose());

  const draft = !rec && !dirty.current;

  return (
    <Sheet
      title={memo ? '📝 Notiz' : '📝 Neue Notiz'}
      onClose={close}
      footer={
        <button className="btn primary block" onClick={close}>
          Fertig ✓
        </button>
      }
    >
      {rec?.deleted ? (
        <div className="notice warn">
          <p>🗑️ {rec.editedBy === me.id ? 'Du hast' : `${data.persons[rec.editedBy].name} hat`} diese Notiz gelöscht.</p>
          <button className="btn soft block" onClick={() => actions.restoreMemo(memoId, latest.current)}>
            ↩️ Wiederherstellen
          </button>
        </div>
      ) : full ? (
        <div className="notice warn">
          <p>Ihr habt schon {MAX_MEMOS} Notizen. Lösch ein paar alte, dann ist wieder Platz für neue.</p>
        </div>
      ) : (
        <>
          {draft && <TemplateChips onPick={pickTemplate} active={tpl?.id} />}

          <div className={cls('memo-editor', `memo-${color}`)}>
            <div className="memo-title-row">
              <button className="memo-emoji-btn" onClick={() => setPickEmoji((p) => !p)} aria-label="Symbol wählen" aria-expanded={pickEmoji}>
                {emoji}
              </button>
              <input
                className="memo-title"
                value={title}
                onChange={(e) => edit(setTitle)(e.target.value)}
                maxLength={MAX_MEMO_TITLE}
                placeholder="Titel"
                aria-label="Titel"
                enterKeyHint="next"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  (tpl?.list || items.length ? itemRef.current : textRef.current)?.focus();
                }}
              />
              <button className={cls('memo-pin-btn', memo?.pinned && 'on')} onClick={togglePin} aria-pressed={!!memo?.pinned} aria-label={memo?.pinned ? 'Nicht mehr anpinnen' : 'Anpinnen'}>
                📌
              </button>
            </div>
            {pickEmoji && (
              <div className="memo-emojis">
                {MEMO_EMOJIS.map((e) => (
                  <button
                    key={e}
                    className={cls('memo-emoji', e === emoji && 'active')}
                    onClick={() => {
                      edit(setEmoji)(e);
                      setPickEmoji(false);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textRef}
              className="memo-text"
              value={text}
              onChange={(e) => edit(setText)(e.target.value)}
              rows={2}
              maxLength={MAX_MEMO_TEXT}
              placeholder={tpl?.list ? 'Notiz (optional) …' : 'Schreib etwas auf …'}
              aria-label="Text"
            />

            <div className="memo-items">
              {open.map((i) => (
                <ItemRow key={i.id} item={i} onCheck={check} />
              ))}
              <div className="memo-item memo-item-new">
                <span className="memo-check add" aria-hidden="true">
                  +
                </span>
                <input
                  ref={itemRef}
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    addItem();
                  }}
                  maxLength={MAX_ITEM_TEXT}
                  enterKeyHint="done"
                  placeholder={itemsFull ? `Höchstens ${MAX_MEMO_ITEMS} Punkte` : items.length ? 'Noch ein Punkt …' : `Punkt für die Liste${tpl?.hint ? ` – ${tpl.hint}` : ''}`}
                  aria-label="Neuer Punkt"
                  disabled={itemsFull}
                />
                {newItem.trim() && (
                  <button className="btn primary small" onClick={addItem}>
                    Dazu
                  </button>
                )}
              </div>
              {done.length > 0 && (
                <>
                  <div className="memo-done-head">
                    <span>✓ Erledigt ({done.length})</span>
                    <button className="link" onClick={() => actions.clearDoneMemoItems(memoId)}>
                      Erledigte löschen
                    </button>
                  </div>
                  {done.map((i) => (
                    <ItemRow key={i.id} item={i} onCheck={check} />
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="memo-colors" role="radiogroup" aria-label="Farbe">
            {MEMO_COLORS.map((c) => (
              <button
                key={c.id}
                className={cls('memo-color', `memo-${c.id}`, c.id === color && 'active')}
                role="radio"
                aria-checked={c.id === color}
                aria-label={c.label}
                onClick={() => edit(setColor)(c.id)}
              />
            ))}
          </div>

          <p className="hint">
            {memo && change ? (
              <>
                Angelegt von {data.persons[memo.createdBy].name} · {formatDateTime(memo.createdAt)}
                <br />
                Zuletzt geändert von {data.persons[change.by].name} · {agoText(change.at)}
                <br />
              </>
            ) : null}
            💾 Speichert automatisch. {live ? `${partner.name} sieht Änderungen sofort. ⚡` : `${partner.name} bekommt sie beim nächsten Paar-Sync.`}
          </p>

          {memo &&
            (confirmDelete ? (
              <div className="notice warn">
                <p>Notiz „{memoLabel(data, memo)}“ für euch beide löschen?</p>
                <div className="btn-row">
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                    Abbrechen
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      createdHere.current = false;
                      dirty.current = false;
                      actions.removeMemo(memoId);
                      showLove({ emoji: '🗑️', title: 'Notiz gelöscht', text: `Auch bei ${partner.name}.`, tone: 'love' });
                      close();
                    }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn danger-ghost block" onClick={() => setConfirmDelete(true)}>
                Notiz löschen
              </button>
            ))}
        </>
      )}
    </Sheet>
  );
}
