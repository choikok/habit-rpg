// 앱 아이콘을 만든다: 캐릭터 그림(js/character.js)으로 SVG를 조립하고 PNG로 구워 icons/ 에 저장한다.
// 실행: node tools/make-icons.mjs   (캐릭터 그림을 바꿨을 때만 다시 돌리면 된다)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { characterSVG } from '../js/character.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

/** @param maskable true 면 모서리를 자르지 않고, 기기가 둥글게 잘라도 그림이 남도록 가운데로 모은다 */
function iconSVG({ maskable = false } = {}) {
  const portrait = characterSVG({ head: 'head1' }, { viewBox: '18 4 88 88' })
    .trim()
    .replace('<svg ', '<svg x="86" y="96" width="340" height="340" ')
    .replace(/ role="img" aria-label="[^"]*" data-items="[^"]*"/, '');
  const art = `
    <circle cx="256" cy="262" r="178" fill="#8b7bff" opacity=".28"/>
    ${portrait}
    <circle cx="392" cy="392" r="62" fill="#ffcf5c" stroke="#14122b" stroke-width="10"/>
    <path d="M362 393 l21 21 l40 -44" fill="none" stroke="#3a2a00" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4338a8"/><stop offset="1" stop-color="#1b1840"/></linearGradient></defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#bg)"/>
  <g${maskable ? ' transform="translate(256 256) scale(.74) translate(-256 -256)"' : ''}>${art}</g>
</svg>
`;
}

const icon = iconSVG();
const maskable = iconSVG({ maskable: true });
fs.writeFileSync(path.join(OUT, 'icon.svg'), icon);

const browser = await chromium.launch();
async function png(svg, size, name) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(OUT, name), omitBackground: true });
  await page.close();
}
await png(icon, 192, 'icon-192.png');
await png(icon, 512, 'icon-512.png');
await png(maskable, 512, 'icon-maskable-512.png');
await png(maskable, 180, 'apple-touch-icon.png'); // iOS는 모서리를 직접 둥글리므로 꽉 찬 배경을 쓴다
await browser.close();
console.log('icons/ 에 아이콘 5개를 만들었습니다.');
