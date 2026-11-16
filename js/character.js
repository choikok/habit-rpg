// 캐릭터와 장비 그림. 모두 이 파일에서 직접 그린 SVG다.
// 좌표계는 가로 120 × 세로 150 이고, 캐릭터 머리 중심이 (60, 47), 오른손이 (91, 105.5)에 있다.

const SKIN = '#ffd9b8';
const INK = '#2b2140';
const GOLD = '#ffcf5c';
const GOLD_DARK = '#d99a1c';
const STEEL = '#b9c3d4';
const STEEL_DARK = '#8e9bb0';
const SKY = '#7fe3ff';
const RED = '#e2574c';
const RED_DARK = '#c9433a';

const TORSO = 'M39 76 Q60 67 81 76 L86 113 Q60 122 34 113 Z';

/** 네 갈래 반짝이 */
const star = (cx, cy, r, fill = '#fff8d6') =>
  `<path d="M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z" fill="${fill}"/>`;

/** 좌우 대칭으로 한 번 더 그린다 */
const mirror = (svg) => `${svg}<g transform="translate(120 0) scale(-1 1)">${svg}</g>`;

// ───────── 머리 ─────────
const HEAD = {
  // 천 두건
  head1: `
    <path d="M29.6 45 Q26 12.5 60 12 Q94 12.5 90.4 45 Q76 33 60 33 Q44 33 29.6 45 Z" fill="${RED}"/>
    <path d="M29.6 45 Q44 33 60 33 Q76 33 90.4 45 L90.6 39 Q76 27.5 60 27.5 Q44 27.5 29.4 39 Z" fill="${RED_DARK}"/>
    <path d="M89 39 L102 33 L99 42 L104 50 L91 45 Z" fill="${RED_DARK}"/>
    <g fill="#fff" opacity=".85"><circle cx="45" cy="21" r="2"/><circle cx="60" cy="17.5" r="2"/><circle cx="75" cy="21" r="2"/></g>`,
  // 깃털 모자
  head2: `
    <ellipse cx="60" cy="28.5" rx="41" ry="8.5" fill="#6e452c"/>
    <path d="M37 28 Q35 2.5 60 2.5 Q85 2.5 83 28 Q60 34 37 28 Z" fill="#8a5a3c"/>
    <path d="M37 28 Q60 34 83 28 L82.6 21.5 Q60 27.5 37.4 21.5 Z" fill="${RED_DARK}"/>
    <path d="M79 21 Q84 4 99 -5 Q98 12 84 23 Z" fill="#5fd68a"/>
    <path d="M81 20 Q88 7 97 -2" fill="none" stroke="#3d9c63" stroke-width="1.3" stroke-linecap="round"/>`,
  // 강철 투구
  head3: `
    <path d="M60 11 Q55 -5 67 -7 Q79 -5 75 6 Q70 2 66 6 Q63 9 60 11 Z" fill="${RED}"/>
    <path d="M28 50 Q24 10.5 60 10 Q96 10.5 92 50 Q87 37 72 35.5 Q60 34 48 35.5 Q33 37 28 50 Z" fill="${STEEL}"/>
    <path d="M28 50 Q33 37 48 35.5 Q60 34 72 35.5 Q87 37 92 50" fill="none" stroke="${STEEL_DARK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 10.5 L60 35" stroke="${STEEL_DARK}" stroke-width="3"/>
    <rect x="57" y="33" width="6" height="16" rx="2.5" fill="${STEEL_DARK}"/>
    <path d="M36 31 Q39 17 53 13.5" fill="none" stroke="#eef3fa" stroke-width="3" stroke-linecap="round"/>`,
  // 별빛 왕관
  head4: `
    <path d="M38 27.5 L34.5 7 L47 17.5 L60 1 L73 17.5 L85.5 7 L82 27.5 Q60 33.5 38 27.5 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M38 27.5 Q60 33.5 82 27.5 L81.3 22.5 Q60 28.5 38.7 22.5 Z" fill="#f0a92a"/>
    <circle cx="60" cy="18" r="3.8" fill="${SKY}"/>
    <circle cx="46.5" cy="22.5" r="2.4" fill="#ff8fb8"/><circle cx="73.5" cy="22.5" r="2.4" fill="#ff8fb8"/>
    <g fill="#fff3c4"><circle cx="34.5" cy="7" r="2.3"/><circle cx="60" cy="1" r="2.6"/><circle cx="85.5" cy="7" r="2.3"/></g>
    ${star(20, 10, 5)}${star(101, 18, 4)}${star(96, -3, 3)}`,
};

// ───────── 몸 ─────────
// under: 허리띠 아래에 깔리는 장식, over: 허리띠 위에 덮이는 장식(어깨 보호대 등)
const BODY = {
  base: {
    torso: '#efe3cb', sleeve: '#efe3cb', legs: '#4d4a7a', boots: '#8a5a3c', belt: '#8a5a3c', buckle: GOLD,
    under: `<path d="M52 72 L60 84 L68 72" fill="none" stroke="#cdbf9f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    over: '',
  },
  // 여행자 조끼
  body1: {
    torso: '#efe3cb', sleeve: '#efe3cb', legs: '#4d4a7a', boots: '#8a5a3c', belt: '#8a5a3c', buckle: GOLD,
    under: `<path d="M52 72 L60 84 L68 72" fill="none" stroke="#cdbf9f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    over: mirror(`
      <path d="M39 76 Q46 72.5 52 72 L57.5 87 L55.5 118 Q44 116.5 34 113 Z" fill="#4f9d69"/>
      <path d="M52 72 L57.5 87 L55.5 118" fill="none" stroke="#3d7f54" stroke-width="1.6"/>
      <rect x="40.5" y="91" width="9.5" height="6.5" rx="1.5" fill="#3d7f54"/>`),
  },
  // 가죽 갑옷
  body2: {
    torso: '#a8703f', sleeve: '#dccaa6', legs: '#4d4a7a', boots: '#6e452c', belt: '#5b3a29', buckle: '#dfe6f0',
    under: `
      <path d="M60 71.5 L60 100" stroke="#7a4d28" stroke-width="1.8" stroke-dasharray="3 3"/>
      <path d="M44 84 L76 84 M43 92 L77 92" stroke="#8c5a30" stroke-width="1.6" stroke-linecap="round"/>`,
    over: mirror(`<ellipse cx="38.5" cy="78" rx="9.5" ry="6" fill="#7a4d28" transform="rotate(-24 38.5 78)"/>`),
  },
  // 강철 갑옷
  body3: {
    torso: STEEL, sleeve: '#7f8ba1', legs: '#5b6478', boots: STEEL_DARK, belt: '#4d4a7a', buckle: GOLD,
    under: `
      <path d="M60 71.5 L60 100" stroke="${STEEL_DARK}" stroke-width="2"/>
      <path d="M43 88 Q60 95 77 88" fill="none" stroke="${STEEL_DARK}" stroke-width="2" stroke-linecap="round"/>
      <path d="M45 78 Q47 84 46 92" fill="none" stroke="#eef3fa" stroke-width="2.6" stroke-linecap="round"/>`,
    over: mirror(`<ellipse cx="37.5" cy="77.5" rx="11" ry="7.5" fill="#d5dde9" stroke="${STEEL_DARK}" stroke-width="1.5" transform="rotate(-24 37.5 77.5)"/>`),
  },
  // 별빛 갑옷
  body4: {
    torso: '#3b2f8f', sleeve: '#5a4bc4', legs: '#2b2466', boots: GOLD, belt: '#f0a92a', buckle: SKY,
    under: `
      <path d="M50 71.8 L60 83 L70 71.8" fill="none" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${star(60, 91, 6.5, GOLD)}
      <path d="M34.5 110.5 Q60 119.5 85.5 110.5" fill="none" stroke="${GOLD}" stroke-width="2"/>`,
    over: mirror(`<ellipse cx="37.5" cy="77.5" rx="11" ry="7.5" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.5" transform="rotate(-24 37.5 77.5)"/>`),
  },
};

// ───────── 무기 ─────────
// 오른손을 원점으로 삼고 살짝 기울여 든 모습. 손은 무기 위에 다시 그려서 쥔 것처럼 보이게 한다.
const grip = (fill) => `<rect x="-2.6" y="-7" width="5.2" height="15" rx="2" fill="${fill}"/>`;
const WEAPON = {
  // 나무 검
  weapon1: `
    <path d="M-4.5 -9 L-4.5 -44 Q-4.5 -50 0 -55 Q4.5 -50 4.5 -44 L4.5 -9 Z" fill="#c9a06a"/>
    <path d="M0 -13 L0 -47" stroke="#a87f4a" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="-9" y="-11.5" width="18" height="4.5" rx="2" fill="#8a5a3c"/>${grip('#6e452c')}`,
  // 무쇠 검
  weapon2: `
    <path d="M-4 -9 L-4 -50 L0 -58 L4 -50 L4 -9 Z" fill="#8f98a8"/>
    <path d="M-4 -9 L-4 -50 L0 -58 L0 -9 Z" fill="#a9b1bf"/>
    <rect x="-10" y="-11.5" width="20" height="4.5" rx="2" fill="#5b6478"/>${grip('#6e452c')}
    <circle cx="0" cy="9.5" r="3" fill="#5b6478"/>`,
  // 기사의 검
  weapon3: `
    <path d="M-4.5 -9 L-4.5 -54 L0 -64 L4.5 -54 L4.5 -9 Z" fill="#cfd8e6"/>
    <path d="M-4.5 -9 L-4.5 -54 L0 -64 L0 -9 Z" fill="#eef3fa"/>
    <path d="M0 -12 L0 -56" stroke="#9aa7bd" stroke-width="1.2"/>
    <rect x="-12.5" y="-12.5" width="25" height="5.5" rx="2.7" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1"/>
    <circle cx="0" cy="-9.7" r="2.1" fill="${RED}"/>${grip('#3b6fc4')}
    <circle cx="0" cy="9.8" r="3.4" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1"/>`,
  // 별빛 검
  weapon4: `
    <path d="M-5 -9 L-5 -55 L0 -67 L5 -55 L5 -9 Z" fill="none" stroke="${SKY}" stroke-width="6" stroke-linejoin="round" opacity=".35"/>
    <path d="M-5 -9 L-5 -55 L0 -67 L5 -55 L5 -9 Z" fill="#8fd9ff"/>
    <path d="M-5 -9 L-5 -55 L0 -67 L0 -9 Z" fill="#d6f4ff"/>
    <path d="M0 -12 L0 -58" stroke="#fff" stroke-width="1.3"/>
    <path d="M-15 -16 Q-8 -9.5 0 -9.5 Q8 -9.5 15 -16 Q14 -5 0 -6 Q-14 -5 -15 -16 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1"/>
    <circle cx="0" cy="-8" r="2.2" fill="${SKY}"/>${grip('#5a4bc4')}
    ${star(0, 10.5, 4.5, GOLD)}${star(1, -76, 5.5)}${star(13, -42, 3)}${star(-12, -30, 2.6)}`,
};

// ───────── 장신구 ─────────
// back: 몸 뒤에 그리는 부분(망토, 날개), front: 옷 위·얼굴 아래에 그리는 부분
const ACCESSORY = {
  // 행운의 목도리
  accessory1: {
    back: '',
    front: `
      <path d="M67 80 L77.5 77 L82 99 L77.5 96.5 L74.5 101.5 Z" fill="${RED_DARK}"/>
      <path d="M39 72.5 Q60 86 81 72.5 L82.5 81 Q60 95 37.5 81 Z" fill="${RED}"/>
      <path d="M38.2 77 Q60 91 81.8 77" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>`,
  },
  // 은빛 목걸이
  accessory2: {
    back: '',
    front: `
      <path d="M46.5 75 Q60 99 73.5 75" fill="none" stroke="#dfe6f0" stroke-width="2" stroke-linecap="round"/>
      <path d="M60 85.5 L65 92 L60 99.5 L55 92 Z" fill="${SKY}" stroke="#dfe6f0" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M58 90.5 L60 88" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  // 바람 망토
  accessory3: {
    back: `
      <path d="M41 74 Q15 98 17 135 Q29 127 39 134 Q50 127 60 134 Q70 127 81 134 Q91 127 103 135 Q105 98 79 74 Z" fill="#2f7fc1"/>
      <path d="M41 74 Q24 100 25 130 M79 74 Q96 100 95 130" fill="none" stroke="#256aa5" stroke-width="2" stroke-linecap="round"/>`,
    front: `
      <path d="M39.5 73 Q60 85 80.5 73 L81.5 79 Q60 91 38.5 79 Z" fill="#3f95dc"/>
      <circle cx="60" cy="84.5" r="3.6" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1"/>`,
  },
  // 별빛 날개
  accessory4: {
    back: `${mirror(`
      <path d="M46 84 Q31 51 8 48 Q-1 65 9 78 Q1 85 9 97 Q7 107 22 111 Q37 109 46 99 Z" fill="#eaf8ff" stroke="#9fdcff" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M41 86 Q27 69 12 63 M41 92 Q27 85 11 86 M42 97 Q31 100 20 105" fill="none" stroke="#9fdcff" stroke-width="1.3" stroke-linecap="round"/>`)}
      ${star(4, 38, 4.5)}${star(116, 40, 4)}${star(112, 116, 3)}`,
    front: star(60, 81.5, 4.2, GOLD),
  },
};

/** 상점 아이콘용: 그 장비가 잘 보이도록 잘라 낼 영역 */
const ICON_BOX = {
  head: '14 -12 92 78',
  body: '20 62 80 62',
  weapon: '58 26 64 92',
  accessory1: '28 60 64 48',
  accessory2: '28 60 64 48',
  accessory3: '8 58 104 84',
  accessory4: '-6 30 132 92',
};
export const iconViewBox = (item) => ICON_BOX[item.id] ?? ICON_BOX[item.slot];

/**
 * 캐릭터를 그린다.
 * @param equipped 부위별로 낀 장비 id. 예: { head: 'head1', weapon: null }
 */
export function characterSVG(equipped = {}, { viewBox = '0 -8 120 158', label = '내 캐릭터' } = {}) {
  const body = BODY[equipped.body] ?? BODY.base;
  const acc = ACCESSORY[equipped.accessory];
  const weapon = WEAPON[equipped.weapon];
  const data = ['head', 'body', 'weapon', 'accessory'].map((s) => equipped[s]).filter(Boolean).join(' ');

  return `
<svg viewBox="${viewBox}" role="img" aria-label="${label}" data-items="${data}">
  <ellipse cx="60" cy="141" rx="30" ry="6" fill="#000" opacity=".28"/>
  <g class="char-body">
    ${acc?.back ?? ''}
    <rect x="44" y="106" width="13" height="28" rx="6" fill="${body.legs}"/>
    <rect x="63" y="106" width="13" height="28" rx="6" fill="${body.legs}"/>
    <rect x="40" y="127" width="19" height="12" rx="6" fill="${body.boots}"/>
    <rect x="61" y="127" width="19" height="12" rx="6" fill="${body.boots}"/>
    <rect x="27" y="76" width="13" height="30" rx="6.5" fill="${body.sleeve}" transform="rotate(10 34 80)"/>
    <rect x="80" y="76" width="13" height="30" rx="6.5" fill="${body.sleeve}" transform="rotate(-10 86 80)"/>
    <path d="${TORSO}" fill="${body.torso}"/>
    ${body.under}
    <path d="M35.4 100 Q60 108 84.6 100 L85.4 106.5 Q60 114.5 34.6 106.5 Z" fill="${body.belt}"/>
    <rect x="55.5" y="103.5" width="9" height="8" rx="2" fill="${body.buckle}"/>
    ${body.over}
    ${acc?.front ?? ''}
    ${weapon ? `<g transform="translate(91 105.5) rotate(18)">${weapon}</g>` : ''}
    <circle cx="29" cy="105.5" r="6.5" fill="${SKIN}"/>
    <circle cx="91" cy="105.5" r="6.5" fill="${SKIN}"/>
  </g>
  <g class="char-head">
    <circle cx="60" cy="47" r="30" fill="${SKIN}"/>
    <path d="M29.5 50 Q25 14 60 13 Q95 14 90.5 50 Q87 35 74 31 Q64 40 47 33 Q35 36 29.5 50 Z" fill="#5b3a29"/>
    <path d="M56 14 Q60 4 67 9 Q63 11 62 16 Z" fill="#5b3a29"/>
    <ellipse cx="48.5" cy="52" rx="4.2" ry="5.6" fill="${INK}"/>
    <ellipse cx="71.5" cy="52" rx="4.2" ry="5.6" fill="${INK}"/>
    <circle cx="50" cy="49.8" r="1.6" fill="#fff"/>
    <circle cx="73" cy="49.8" r="1.6" fill="#fff"/>
    <ellipse cx="40.5" cy="61" rx="5" ry="3" fill="#ff8f8f" opacity=".55"/>
    <ellipse cx="79.5" cy="61" rx="5" ry="3" fill="#ff8f8f" opacity=".55"/>
    <path d="M54 62.5 Q60 68 66 62.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    ${HEAD[equipped.head] ?? ''}
  </g>
</svg>`;
}
