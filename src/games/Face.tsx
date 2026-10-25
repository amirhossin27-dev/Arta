import type { FaceSpec, HairColor } from './guesswho';

const SKIN = ['#fde0cf', '#f3c6a5', '#d9a07a', '#a8714f', '#6e4630'];
const HAIR: Record<HairColor, string> = { schwarz: '#2b2024', braun: '#6b4226', blond: '#e8c15a', rot: '#c8522b', grau: '#b9b9c3', keine: '#4a3b35' };
const EYES = { braun: '#5a3a1e', blau: '#3d8bfd', gruen: '#2f9e5b' };

/** Gezeichnetes Gesicht für „Wer ist wer?“ – alles aus den Merkmalen zusammengesetzt. */
export function Face({ f }: { f: FaceSpec }) {
  const skin = SKIN[f.skin];
  const hair = HAIR[f.hair];
  const long = f.style === 'lang' || f.style === 'zopf';
  return (
    <svg viewBox="0 0 100 100" className="face-svg" aria-hidden="true">
      {/* Haare hinten */}
      {long && <path d="M25 44 Q20 86 31 94 L69 94 Q80 86 75 44 Z" fill={hair} />}
      {f.style === 'locken' && (
        <g fill={hair}>
          {[
            [27, 34], [24, 48], [26, 62], [73, 34], [76, 48], [74, 62], [33, 24], [67, 24], [50, 18], [40, 19], [60, 19],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={9} />
          ))}
        </g>
      )}
      {/* Schultern & Hals */}
      <path d="M14 100 Q14 79 50 77 Q86 79 86 100 Z" fill={f.shirt} />
      <rect x="42" y="62" width="16" height="17" rx="6" fill={skin} />
      <path d="M42 70 Q50 76 58 70 L58 74 Q50 79 42 74 Z" fill="rgba(0,0,0,.12)" />
      {/* Ohren */}
      <ellipse cx="28" cy="50" rx="4.5" ry="6" fill={skin} />
      <ellipse cx="72" cy="50" rx="4.5" ry="6" fill={skin} />
      {f.earrings && (
        <g fill="#ffd166" stroke="#e0a800" strokeWidth=".8">
          <circle cx="28" cy="58" r="2.6" />
          <circle cx="72" cy="58" r="2.6" />
        </g>
      )}
      {/* Kopf */}
      <ellipse cx="50" cy="47" rx="22" ry="26" fill={skin} />
      {/* Bart */}
      {f.beard === 'vollbart' && <path d="M28 50 Q29 78 50 77 Q71 78 72 50 Q67 64 58 64 Q50 61 42 64 Q33 64 28 50 Z" fill={hair} />}
      {/* Augen */}
      {[41, 59].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="48" rx="4.2" ry="3.3" fill="#fff" />
          <circle cx={x} cy="48.3" r="2.3" fill={EYES[f.eyes]} />
          <circle cx={x} cy="48.3" r="1" fill="#111" />
          <circle cx={x + 0.8} cy="47.4" r=".5" fill="#fff" />
        </g>
      ))}
      <path d="M36 41.5 Q41 39 46 41.5 M54 41.5 Q59 39 64 41.5" stroke={f.hair === 'keine' || f.hair === 'grau' ? '#6b5a55' : hair} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Nase */}
      <path d="M50 50 Q48 56 50 57.5 Q52 58 53 56.8" stroke="rgba(0,0,0,.28)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Sommersprossen & Wangen */}
      {f.freckles && (
        <g fill="#b5654a" opacity=".7">
          {[
            [36, 55], [39, 57], [34, 58], [64, 55], [61, 57], [66, 58],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r=".9" />
          ))}
        </g>
      )}
      <circle cx="36" cy="58" r="4" fill="#ff7a8a" opacity=".18" />
      <circle cx="64" cy="58" r="4" fill="#ff7a8a" opacity=".18" />
      {/* Mund */}
      {f.smile ? (
        <path d="M42 61.5 Q50 71 58 61.5 Z" fill="#fff" stroke="#8a2d3b" strokeWidth="1.6" strokeLinejoin="round" />
      ) : (
        <path d="M43.5 63 Q50 67 56.5 63" stroke="#8a2d3b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}
      {f.beard === 'schnurrbart' && <path d="M41 61 Q45 57 50 59.5 Q55 57 59 61 Q55 60.5 50 61.5 Q45 60.5 41 61 Z" fill={hair} />}
      {/* Haare vorne */}
      {f.style === 'kurz' && <path d="M27.5 44 Q26 19 50 18 Q74 19 72.5 44 Q70 33 62 30 Q50 34 38 30 Q30 33 27.5 44 Z" fill={hair} />}
      {long && <path d="M27 50 Q25 18 50 17.5 Q75 18 73 50 Q71 34 64 29 Q52 31 44 27 Q32 32 27 50 Z" fill={hair} />}
      {f.style === 'dutt' && (
        <g fill={hair}>
          <circle cx="50" cy="15" r="9" />
          <path d="M28 44 Q27 20 50 19.5 Q73 20 72 44 Q69 31 50 29 Q31 31 28 44 Z" />
        </g>
      )}
      {f.style === 'zopf' && <path d="M71 40 Q82 52 76 70 Q74 78 78 86" stroke={hair} strokeWidth="7" fill="none" strokeLinecap="round" />}
      {f.style === 'locken' && (
        <g fill={hair}>
          {[
            [34, 27], [43, 23], [52, 22], [61, 25], [67, 31], [30, 34],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={7} />
          ))}
        </g>
      )}
      {f.style === 'glatze' && <path d="M28.5 46 Q28 40 30 37 M71.5 46 Q72 40 70 37" stroke={HAIR.grau} strokeWidth="3" fill="none" strokeLinecap="round" />}
      {/* Brille */}
      {f.glasses && (
        <g stroke="#2d2240" strokeWidth="1.8" fill="rgba(255,255,255,.15)">
          <circle cx="41" cy="48" r="6.6" />
          <circle cx="59" cy="48" r="6.6" />
          <path d="M47.6 47.5 Q50 46 52.4 47.5 M34.4 47 L29 45.5 M65.6 47 L71 45.5" fill="none" />
        </g>
      )}
      {/* Hut */}
      {f.hat && (
        <g>
          <ellipse cx="50" cy="27" rx="31" ry="5.5" fill="#3d2c4e" />
          <path d="M34 27 Q33 9 50 8 Q67 9 66 27 Z" fill="#3d2c4e" />
          <path d="M34 22 Q50 25 66 22 L66 26.5 Q50 29 34 26.5 Z" fill={f.shirt} />
        </g>
      )}
    </svg>
  );
}
