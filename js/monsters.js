// 몬스터 그림. 모두 이 파일에서 직접 그린 SVG다. 좌표계는 120 × 120.
// 같은 모양이 5스테이지마다 다시 나오므로, 단계(rank)가 오르면 색조를 돌려 다른 느낌을 준다.

const INK = '#2b2140';
const eyes = (x1, x2, y, fill = INK) => `
  <ellipse cx="${x1}" cy="${y}" rx="4" ry="5" fill="${fill}"/><ellipse cx="${x2}" cy="${y}" rx="4" ry="5" fill="${fill}"/>
  <circle cx="${x1 + 1.3}" cy="${y - 1.8}" r="1.4" fill="#fff"/><circle cx="${x2 + 1.3}" cy="${y - 1.8}" r="1.4" fill="#fff"/>`;
const brows = (x1, x2, y) => `
  <path d="M${x1 - 7} ${y - 4} L${x1 + 5} ${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M${x2 + 7} ${y - 4} L${x2 - 5} ${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;

const ART = {
  // 말랑 젤리
  jelly: `
    <path d="M18 94 Q10 46 60 38 Q110 46 102 94 Q100 106 60 106 Q20 106 18 94 Z" fill="#5fd68a"/>
    <path d="M30 62 Q36 48 52 45" fill="none" stroke="#c9f5d9" stroke-width="5" stroke-linecap="round"/>
    ${eyes(47, 73, 76)}${brows(47, 73, 67)}
    <path d="M52 90 Q60 85 68 90" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  // 성난 버섯
  mushroom: `
    <rect x="38" y="58" width="44" height="48" rx="17" fill="#f3e6cc"/>
    <path d="M12 64 Q12 20 60 18 Q108 20 108 64 Q60 76 12 64 Z" fill="#e2574c"/>
    <g fill="#fff3e0"><circle cx="38" cy="40" r="7"/><circle cx="66" cy="32" r="8"/><circle cx="88" cy="50" r="6"/><circle cx="24" cy="56" r="4"/></g>
    ${eyes(50, 70, 84)}${brows(50, 70, 76)}
    <path d="M54 97 Q60 93 66 97" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  // 밤 박쥐
  bat: `
    <path d="M40 58 Q14 24 2 62 Q14 56 18 72 Q27 62 38 76 Z" fill="#5a44a0"/>
    <path d="M80 58 Q106 24 118 62 Q106 56 102 72 Q93 62 82 76 Z" fill="#5a44a0"/>
    <path d="M42 44 L38 22 L54 38 Z M78 44 L82 22 L66 38 Z" fill="#7a5cc4"/>
    <circle cx="60" cy="64" r="26" fill="#7a5cc4"/>
    ${eyes(50, 70, 60, '#ffe08a')}${brows(50, 70, 52)}
    <path d="M50 76 Q60 84 70 76" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M54 78.5 L56.5 85 L59 79.5 Z M61 79.5 L63.5 85 L66 78.5 Z" fill="#fff"/>`,
  // 돌 거인
  golem: `
    <rect x="12" y="52" width="20" height="40" rx="9" fill="#7f8ba1"/>
    <rect x="88" y="52" width="20" height="40" rx="9" fill="#7f8ba1"/>
    <rect x="28" y="44" width="64" height="62" rx="16" fill="#9aa3b2"/>
    <rect x="38" y="14" width="44" height="36" rx="11" fill="#b9c3d4"/>
    <path d="M44 62 L52 72 L46 82 M78 58 L72 68 L80 78" fill="none" stroke="#6c778d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M38 18 Q52 10 66 16 Q58 22 50 20 Q44 24 38 18 Z" fill="#5fd68a"/>
    <rect x="46" y="28" width="9" height="8" rx="2" fill="#7fe3ff"/><rect x="65" y="28" width="9" height="8" rx="2" fill="#7fe3ff"/>
    <path d="M52 42 L68 42" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  // 불꽃 도깨비 (보스)
  imp: `
    <path d="M60 2 Q74 18 68 30 Q82 24 80 40 Q70 34 60 36 Q50 34 40 40 Q38 24 52 30 Q46 18 60 2 Z" fill="#ffcf5c"/>
    <path d="M30 46 L20 20 L42 38 Z M90 46 L100 20 L78 38 Z" fill="#fff3e0" stroke="#d9a441" stroke-width="1.5" stroke-linejoin="round"/>
    <ellipse cx="60" cy="72" rx="38" ry="36" fill="#ff7a3c"/>
    <ellipse cx="60" cy="88" rx="22" ry="14" fill="#ffb37a"/>
    ${eyes(46, 74, 66)}${brows(46, 74, 57)}
    <path d="M44 84 Q60 98 76 84 Z" fill="${INK}"/>
    <path d="M49 85 L52.5 92 L56 85.5 Z M64 85.5 L67.5 92 L71 85 Z" fill="#fff"/>`,
};

/** @param monster battle.js 의 monsterFor() 결과 */
export function monsterSVG(monster) {
  const hue = (monster.rank * 55) % 360;
  return `
<svg viewBox="0 0 120 120" role="img" aria-label="${monster.name}" data-kind="${monster.kind}"${hue ? ` style="filter:hue-rotate(${hue}deg)"` : ''}>
  <ellipse cx="60" cy="110" rx="36" ry="6" fill="#000" opacity=".28"/>
  ${ART[monster.kind]}
</svg>`;
}
