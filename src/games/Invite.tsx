import { useEffect, useState } from 'react';
import { useData, useDevice } from '../lib/store';
import { other } from '../lib/types';
import { nav, useUI } from '../lib/ui';
import { buzz, tone } from './engine';
import { declineMatch, INVITE_TTL, joinMatch, leaveMatch, useArcade } from './online';
import { GAME_BY_ID } from './registry';

/** Einladung vom Schatz – erscheint überall in der App, auch über anderen Spielen. */
export function ArcadeInvite() {
  const arcade = useArcade();
  const ui = useUI();
  const data = useData();
  const device = useDevice();
  const [, tick] = useState(0);
  const partner = data.persons[other(device.me)];
  const sheet = ui.sheet?.type === 'game' ? ui.sheet : null;
  const inv = arcade.invite && Date.now() - arcade.invite.since < INVITE_TTL && sheet?.join !== arcade.invite.id ? arcade.invite : undefined;
  const m = arcade.match;
  const resume = !inv && !sheet && m && m.together && !m.left ? m : null;

  // Einladungen verfallen – ab und zu neu prüfen.
  useEffect(() => {
    if (!arcade.invite) return;
    const t = window.setInterval(() => tick((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, [arcade.invite]);

  useEffect(() => {
    if (!inv) return;
    [0, 140, 280].forEach((d, k) => window.setTimeout(() => tone([660, 880, 1100][k], 110, 'triangle', 0.06), d));
    buzz([60, 60, 60]);
  }, [inv?.id]);

  if (inv) {
    const game = GAME_BY_ID[inv.game];
    return (
      <div className="arcade-invite" role="dialog" aria-label="Spiel-Einladung">
        <span className="arcade-invite-emoji">{game.emoji}</span>
        <div className="grow">
          <b>
            {partner.emoji} {partner.name} lädt dich zu {game.name} ein!
          </b>
          <span>Online – jeder an seinem Handy.</span>
        </div>
        <div className="arcade-invite-btns">
          <button
            className="btn primary small"
            onClick={() => {
              if (joinMatch(inv)) nav.open({ type: 'game', id: inv.game, join: inv.id });
            }}
          >
            Mitspielen
          </button>
          <button className="btn ghost small" onClick={() => declineMatch(inv)}>
            Später
          </button>
        </div>
      </div>
    );
  }

  if (resume) {
    const game = GAME_BY_ID[resume.game];
    return (
      <div className="arcade-invite resume">
        <span className="arcade-invite-emoji">{game.emoji}</span>
        <div className="grow">
          <b>Euer {game.name} läuft noch</b>
          <span>
            Online mit {partner.emoji} {partner.name}
          </span>
        </div>
        <div className="arcade-invite-btns">
          <button className="btn primary small" onClick={() => nav.open({ type: 'game', id: resume.game, join: resume.id })}>
            Weiterspielen
          </button>
          <button className="btn ghost small" onClick={() => leaveMatch(resume.id)}>
            Beenden
          </button>
        </div>
      </div>
    );
  }
  return null;
}
