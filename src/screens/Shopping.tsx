import { useState, type FormEvent, type MouseEvent } from 'react';
import { SHOPPING_DONE } from '../data/messages';
import { Empty } from '../components/ui';
import { cls, usePeople } from '../lib/hooks';
import { heartBurst, showLove } from '../lib/love';
import { pickRandom } from '../lib/random';
import { formatShopQty, guessCategory, parseShoppingInput, SHOP_CATEGORIES } from '../lib/shopping';
import { alive } from '../lib/stats';
import { actions, useData } from '../lib/store';
import type { ShopCategory, ShoppingItem } from '../lib/types';

const BASICS = ['Milch', 'Eier', 'Vollkornbrot', 'Bananen', 'Äpfel', 'Haferflocken', 'Joghurt', 'Tomaten', 'Gurke', 'Wasser', 'Kaffee', 'Toilettenpapier'];

function ShopRow({ item, onToggle }: { item: ShoppingItem; onToggle: (item: ShoppingItem, e: MouseEvent<HTMLButtonElement>) => void }) {
  const data = useData();
  const by = data.persons[item.addedBy];
  return (
    <div className={cls('shop-row', item.done && 'done')}>
      <button className="check" onClick={(e) => onToggle(item, e)} aria-label={item.done ? 'Zurück auf die Liste' : 'Abhaken'}>
        {item.done ? '✓' : ''}
      </button>
      <span className="shop-name">{item.name}</span>
      {item.qty !== undefined && <span className="shop-qty">{formatShopQty(item.qty, item.unit)}</span>}
      <span className="shop-by" title={`hinzugefügt von ${by.name}`}>
        {by.emoji}
      </span>
      <button className="icon-btn small ghost" onClick={() => actions.removeShopping(item.id)} aria-label={`${item.name} löschen`}>
        ✕
      </button>
    </div>
  );
}

export function Shopping() {
  const data = useData();
  const { me, partner } = usePeople();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ShopCategory | null>(null);
  const [copied, setCopied] = useState(false);

  const items = alive(data.shopping).sort((a, b) => a.createdAt - b.createdAt);
  const open = items.filter((i) => !i.done);
  const inCart = items.filter((i) => i.done);
  const parsed = parseShoppingInput(text);
  const guessed = text.trim() ? guessCategory(parsed.name) : 'sonstiges';
  const activeCat = category ?? guessed;

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    actions.addShopping([{ ...parsed, category: activeCat }]);
    setText('');
    setCategory(null);
  };

  const toggle = (item: ShoppingItem, e: MouseEvent<HTMLButtonElement>) => {
    actions.setShoppingDone(item.id, !item.done);
    if (!item.done) {
      heartBurst(e, '✨', 4);
      if (open.length === 1) {
        showLove({ emoji: '🛒', title: 'Alles im Wagen!', text: pickRandom(SHOPPING_DONE), big: true, tone: 'party' });
      }
    }
  };

  const share = async () => {
    const lines = SHOP_CATEGORIES.flatMap((c) => {
      const inCat = open.filter((i) => i.category === c.id);
      if (!inCat.length) return [];
      return [`${c.emoji} ${c.label}`, ...inCat.map((i) => `• ${i.name}${i.qty !== undefined ? ` (${formatShopQty(i.qty, i.unit)})` : ''}`), ''];
    });
    const textOut = `🛒 Unsere Einkaufsliste 💕\n\n${lines.join('\n').trim()}\n\nDanke, Schatz! ❤️`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Einkaufsliste', text: textOut });
        return;
      }
      await navigator.clipboard.writeText(textOut);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Teilen abgebrochen
    }
  };

  return (
    <section className="screen">
      <div className="hero hero-shop" data-deco="🛒">
        <p className="eyebrow">Gemeinsam einkaufen</p>
        <h1>Unsere Einkaufsliste</h1>
        <p className="hero-sub">
          {open.length} offen · {inCart.length} im Wagen
        </p>
      </div>

      <form className="add-form" onSubmit={add}>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCategory(null);
          }}
          placeholder="z. B. 2 Avocados oder 500 g Quark"
          aria-label="Artikel hinzufügen"
          enterKeyHint="done"
        />
        <button className="btn primary" type="submit" disabled={!text.trim()} aria-label="Hinzufügen">
          +
        </button>
      </form>
      {text.trim() && (
        <div className="chips cat-chips">
          {SHOP_CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={cls('chip', c.id === activeCat && 'active')} onClick={() => setCategory(c.id)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      )}

      {!open.length && !inCart.length && (
        <Empty emoji="🧺" title="Die Liste ist leer">
          Tippe oben etwas ein oder füge Zutaten direkt aus einem Rezept hinzu. Hier ein paar Klassiker:
        </Empty>
      )}

      {!text.trim() && (
        <div className="chips basics">
          {BASICS.map((b) => (
            <button key={b} className="chip" onClick={() => actions.addShopping([{ name: b, category: guessCategory(b) }])}>
              + {b}
            </button>
          ))}
        </div>
      )}

      {SHOP_CATEGORIES.map((c) => {
        const inCat = open.filter((i) => i.category === c.id);
        if (!inCat.length) return null;
        return (
          <div key={c.id} className="card shop-group">
            <h3>
              {c.emoji} {c.label}
            </h3>
            {inCat.map((i) => (
              <ShopRow key={i.id} item={i} onToggle={toggle} />
            ))}
          </div>
        );
      })}

      {inCart.length > 0 && (
        <div className="card shop-group cart">
          <div className="card-head">
            <h3>✅ Im Wagen</h3>
            <button className="link" onClick={() => actions.clearDoneShopping()}>
              Liste aufräumen
            </button>
          </div>
          {inCart.map((i) => (
            <ShopRow key={i.id} item={i} onToggle={toggle} />
          ))}
        </div>
      )}

      {open.length > 0 && (
        <button className="btn soft block" onClick={share}>
          {copied ? '✓ Kopiert!' : `📤 Liste an ${partner.name} schicken`}
        </button>
      )}
      <p className="hint center">
        {me.emoji} und {partner.emoji} zeigen, wer etwas auf die Liste gesetzt hat. Kategorien erkennt Arta automatisch.
      </p>
    </section>
  );
}
