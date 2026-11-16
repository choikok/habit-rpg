// 브라우저 시험: 실제 화면을 모바일 크기로 띄우고 시계를 바꿔 가며 확인한다.
// 실행: node tests/e2e.cjs [스크린샷을 저장할 폴더]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.argv[2];
// GitHub Pages처럼 하위 경로(예: /habit-rpg/)에 올린 경우를 시험하려면 E2E_BASE=/habit-rpg/ 로 실행한다.
const BASE = process.env.E2E_BASE || '/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

let pretendNewVersion = false; // true 면 sw.js 를 다음 버전인 것처럼 내보낸다 (앱 갱신 시험용)

function serve() {
  const server = http.createServer((req, res) => {
    const full = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!full.startsWith(BASE)) return res.writeHead(404).end();
    const rel = full.slice(BASE.length - 1);
    const file = path.join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    if (pretendNewVersion && file.endsWith('sw.js')) {
      return res.end(fs.readFileSync(file, 'utf8').replace(/const VERSION = '[^']+'/, "const VERSION = 'next'"));
    }
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
let afterFailure = async () => {}; // 실패한 시험이 열어 둔 창 때문에 다음 시험까지 막히지 않게 정리한다
// 시험 일부만 돌리기: E2E_ONLY='8단계' (빈 상태에서 시작하는 묶음에만 쓸 것), 실패 내용 전부 보기: E2E_VERBOSE=1
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;
const DETAIL_LINES = process.env.E2E_VERBOSE ? 80 : 6;
async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    await fn();
    results.push(`  통과  ${name}`);
  } catch (err) {
    results.push(`  실패  ${name}\n        ${String(err.message).split('\n').slice(0, DETAIL_LINES).join('\n        ')}`);
    process.exitCode = 1;
    await afterFailure().catch(() => {});
  }
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}${BASE}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: SHOTS ? 2 : 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  afterFailure = () => page.evaluate(() => {
    for (const el of document.querySelectorAll('#overlay-root > *')) el.remove();
  });
  const requested = new Set();
  context.on('request', (r) => requested.add(new URL(r.url()).origin));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const setClock = (iso) => page.clock.setFixedTime(new Date(`${iso}+09:00`));
  const dismissReport = async () => {
    if (!(await page.locator('.report').count())) return;
    await page.locator('[data-report-ok]').click();
    await page.waitForSelector('.report', { state: 'detached' });
  };
  const openAt = async (iso, { keepReport = false } = {}) => {
    await setClock(iso);
    await page.goto(url);
    await page.waitForSelector('#today-date:not(:empty)');
    if (!keepReport) await dismissReport();
  };
  const hp = () => page.textContent('#hp-num');
  const reportText = async () => (await page.locator('.report').innerText()).replace(/\s+/g, ' ');
  const shot = async (name) => {
    if (!SHOTS) return;
    if (await page.locator('.backdrop').count()) await page.waitForTimeout(450); // 창이 다 뜬 뒤에 찍는다
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  };
  const hero = async () => ({
    level: Number(await page.textContent('#hero-level')),
    xp: await page.textContent('#xp-num'),
    gold: await page.textContent('#hero-gold'),
    progress: await page.textContent('#progress-num'),
  });
  const habit = (name) => page.locator('.habit', { hasText: name });
  const rewardOf = async (name) => (await habit(name).locator('.reward').textContent()).trim();
  const closeLevelUp = async () => {
    await page.locator('.levelup button').click();
    await page.waitForSelector('.levelup', { state: 'detached' });
  };

  /** 시험 준비용: 저장된 플레이어 값을 직접 바꾸고 앱을 다시 연다 (레벨 15까지 실제로 키우려면 수십 일이 걸리므로) */
  const seedMeta = async (key, patch) => {
    await page.evaluate(([key, patch]) => new Promise((resolve, reject) => {
      const req = indexedDB.open('habit-rpg');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        if (patch === null) store.delete(key); // 그 항목이 아예 없던 예전 데이터를 흉내 낸다
        else {
          const get = store.get(key);
          get.onsuccess = () => store.put({ key, ...get.result, ...patch });
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), [key, patch]);
    await page.reload();
    await page.waitForSelector('#today-date:not(:empty)');
  };
  const seedPlayer = (patch) => seedMeta('player', patch);
  const chanceDetail = () => page.textContent('#battle-chance-detail');
  const battleResult = async () => {
    await page.waitForSelector('#arena-result[data-result]');
    return page.locator('#arena-result').getAttribute('data-result');
  };
  const tickets = () => page.textContent('#battle-tickets');
  const tab = (name) => page.locator(`.tabbar [data-tab="${name}"]`).click();
  const item = (id) => page.locator(`.item[data-item="${id}"]`);
  const wearing = () => page.locator('#hero-char svg').getAttribute('data-items');
  const buyItem = async (id) => {
    await item(id).locator('[data-action="buy"]').click();
    await page.locator('[data-answer="yes"]').click();
  };

  let minute = 0;
  async function addHabit(name, difficulty, category, iso) {
    await setClock(`${iso.slice(0, 14)}${String(minute++).padStart(2, '0')}:00`); // 추가 순서가 보이도록 1분씩 간격을 둔다
    await page.locator('#view-today [data-action="add-habit"]').first().click();
    await page.fill('[name="name"]', name);
    await page.locator('.seg label', { hasText: difficulty }).click();
    await page.locator('.seg label', { hasText: category }).click();
    if (name === '책 읽기') await shot('02-습관-추가-시트');
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
  }

  await step('처음 열면 Lv.1, 경험치 0/50, 빈 목록 안내가 보인다', async () => {
    await openAt('2026-11-16T09:00:00');
    assert.deepEqual(await hero(), { level: 1, xp: '0 / 50', gold: '0', progress: '0 / 0' });
    assert.equal(await page.textContent('#today-date'), '11월 16일 (월)');
    assert.match(await page.textContent('#habit-list'), /아직 습관이 없어요/);
    await shot('01-처음-화면');
  });

  await step('습관 3개를 추가하면 오늘 목록에 보상 미리보기와 함께 나온다', async () => {
    await addHabit('물 마시기', '쉬움', '생활', '2026-11-16T09:00:00');
    await addHabit('산책', '보통', '운동', '2026-11-16T09:00:00');
    await addHabit('책 읽기', '어려움', '공부', '2026-11-16T09:00:00');
    assert.equal(await page.locator('.habit').count(), 3);
    assert.equal(await rewardOf('물 마시기'), '+5 XP · +2 G');
    assert.equal(await rewardOf('산책'), '+10 XP · +4 G');
    assert.equal(await rewardOf('책 읽기'), '+20 XP · +8 G');
    assert.equal((await hero()).progress, '0 / 3');
  });

  await step('이름 없이 저장하면 안내 문구가 뜨고 추가되지 않는다', async () => {
    await page.locator('#view-today [data-action="add-habit"]').first().click();
    await page.locator('.sheet button[type="submit"]').click();
    assert.match(await page.textContent('.sheet .form-error'), /이름/);
    await page.locator('[data-cancel]').click();
    assert.equal(await page.locator('.habit').count(), 3);
  });

  await step('체크하면 +XP/+G 숫자가 뜨고 경험치·골드·진행률이 오른다', async () => {
    await habit('물 마시기').click();
    assert.match(await page.textContent('#fx-layer'), /\+5 XP\s*\+2 G/);
    assert.equal(await page.locator('#fx-layer .spark').count(), 9); // [4단계] 체크한 자리에서 불꽃이 퍼진다
    assert.deepEqual(await hero(), { level: 1, xp: '5 / 50', gold: '2', progress: '1 / 3' });
    await habit('산책').click();
    await page.waitForTimeout(260);
    await shot('03-체크-순간');
    assert.deepEqual(await hero(), { level: 1, xp: '15 / 50', gold: '6', progress: '2 / 3' });
    assert.equal(await rewardOf('산책'), '획득 +10 XP · +4 G');
  });

  await step('체크하자마자 곧바로 앱을 다시 열어도 저장되어 있다', async () => {
    for (let i = 0; i < 5; i++) {
      await habit('책 읽기').click(); // 체크
      await page.reload();
      await page.waitForSelector('.habit');
      assert.equal(await habit('책 읽기').getAttribute('aria-pressed'), 'true', `체크 ${i + 1}회째`);
      await page.locator('.levelup').waitFor({ state: 'detached' });
      await habit('책 읽기').click(); // 취소
      await page.reload();
      await page.waitForSelector('.habit');
      assert.equal(await habit('책 읽기').getAttribute('aria-pressed'), 'false', `취소 ${i + 1}회째`);
    }
  });

  await step('앱을 다시 열어도 그대로다 (IndexedDB 저장)', async () => {
    await page.reload();
    await page.waitForSelector('.habit');
    assert.deepEqual(await hero(), { level: 1, xp: '15 / 50', gold: '6', progress: '2 / 3' });
    assert.equal(await page.locator('.habit.is-done').count(), 2);
  });

  await step('마지막 습관까지 끝내면 완벽한 하루 +20 XP/+10 G, 레벨 업 화면이 뜬다', async () => {
    await habit('책 읽기').click();
    await page.waitForSelector('.levelup');
    assert.ok((await page.locator('.levelup .confetti').count()) > 30); // [4단계] 화면 전체 축하 연출
    await page.waitForTimeout(700);
    await shot('04-레벨-업');
    assert.match(await page.textContent('.levelup'), /Lv\.2/);
    await closeLevelUp();
    // 5 + 10 + 20 + 20 = 55 → Lv.2 에 5 남음. 골드 2 + 4 + 8 + 10 = 24
    assert.deepEqual(await hero(), { level: 2, xp: '5 / 70', gold: '24', progress: '3 / 3' });
    assert.match(await page.textContent('#perfect-banner'), /완벽한 하루! \+20 XP · \+10 G/);
    await page.waitForTimeout(1300);
    await shot('05-완벽한-하루');
  });

  await step('체크를 취소하면 보상·완벽한 하루 보너스·레벨이 되돌아가고, 다시 체크하면 복구된다', async () => {
    await habit('책 읽기').click();
    assert.deepEqual(await hero(), { level: 1, xp: '15 / 50', gold: '6', progress: '2 / 3' });
    assert.equal(await page.locator('#perfect-banner').isHidden(), true);
    await page.waitForTimeout(300);
    await shot('06-체크-취소');
    await habit('책 읽기').click();
    await page.waitForSelector('.levelup');
    await closeLevelUp();
    assert.deepEqual(await hero(), { level: 2, xp: '5 / 70', gold: '24', progress: '3 / 3' });
  });

  await step('다음 날 새벽 3:59에 열면 아직 16일이다', async () => {
    await openAt('2026-11-17T03:59:00');
    assert.equal(await page.textContent('#today-date'), '11월 16일 (월)');
    assert.equal(await page.locator('.habit.is-done').count(), 3);
  });

  await step('새벽 4:00에 열면 17일로 넘어가고, 연속 2일째 보상은 +10%다', async () => {
    await openAt('2026-11-17T04:00:00');
    assert.equal(await page.textContent('#today-date'), '11월 17일 (화)');
    assert.equal(await page.locator('.habit.is-done').count(), 0);
    assert.equal((await hero()).progress, '0 / 3');
    assert.equal(await rewardOf('물 마시기'), '+6 XP · +2 G'); // 5.5 반올림
    assert.equal(await rewardOf('산책'), '+11 XP · +4 G');
    assert.equal(await rewardOf('책 읽기'), '+22 XP · +8 G');
    assert.match(await habit('산책').locator('.streak').textContent(), /1일 연속 · 보너스 \+10%/);
    await shot('07-둘째-날');
  });

  await step('둘째 날을 전부 끝내면 6+11+22+20 = 59 XP, 골드 +24', async () => {
    for (const name of ['물 마시기', '산책', '책 읽기']) await habit(name).click();
    assert.deepEqual(await hero(), { level: 2, xp: '64 / 70', gold: '48', progress: '3 / 3' });
    assert.match(await habit('산책').locator('.streak').textContent(), /2일 연속/);
  });

  await step('앱을 켜 둔 채 4시를 넘기면 화면이 새 날로 바뀐다', async () => {
    await setClock('2026-11-18T04:00:30');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(await page.textContent('#today-date'), '11월 18일 (수)');
    assert.equal(await rewardOf('산책'), '+12 XP · +4 G'); // 연속 3일째 +20%
  });

  await step('[2단계] 다 지킨 날(16·17일)은 HP가 그대로 50이고 요약 창이 뜨지 않는다', async () => {
    assert.equal(await page.locator('.report').count(), 0);
    assert.equal(await hp(), '50 / 50');
    assert.match(await page.textContent('#today-hint'), /남은 습관 3개 · 이대로 하루가 넘어가면 HP −15/);
  });

  await step('[2단계] 18일에 3개를 모두 빼먹고 19일에 열면 "자리를 비운 동안" 창과 HP −15', async () => {
    await openAt('2026-11-19T09:00:00', { keepReport: true });
    const text = await reportText();
    assert.match(text, /자리를 비운 동안/);
    assert.match(text, /11월 18일 \(수\) HP −15 0\/3 완료/);
    assert.match(text, /HP 50 → 35/);
    assert.equal(await hp(), '35 / 50');
    await shot('09-자리를-비운-동안');
    // 확인하지 않고 닫았다가 다시 열면 요약이 다시 보이고, HP는 한 번만 깎인다
    await openAt('2026-11-19T09:05:00', { keepReport: true });
    assert.match(await reportText(), /HP 50 → 35/);
    assert.equal(await hp(), '35 / 50');
    await dismissReport();
    await openAt('2026-11-19T09:10:00', { keepReport: true });
    assert.equal(await page.locator('.report').count(), 0); // 확인한 뒤에는 다시 뜨지 않는다
    assert.equal(await hp(), '35 / 50');
  });

  await step('[2단계] 습관을 완료하면 HP +2, 취소하면 되돌아간다', async () => {
    await habit('물 마시기').click();
    assert.equal(await hp(), '37 / 50');
    assert.match(await page.textContent('#today-hint'), /남은 습관 2개 · 이대로 하루가 넘어가면 HP −10/);
    await habit('물 마시기').click();
    assert.equal(await hp(), '35 / 50');
  });

  await step('[2단계] 휴식일 버튼: 누르면 안내가 뜨고 벌칙 예고가 사라지며, 다시 열어도 유지된다', async () => {
    await page.locator('[data-action="rest-on"]').click();
    assert.equal(await page.locator('#rest-banner').isVisible(), true);
    assert.doesNotMatch(await page.textContent('#today-hint'), /HP −/);
    await page.locator('[data-action="rest-off"]').click(); // 취소하면 원래대로
    assert.match(await page.textContent('#today-hint'), /HP −15/);
    await page.locator('[data-action="rest-on"]').click();
    await page.waitForTimeout(300);
    await shot('10-휴식일');
    await page.reload();
    await page.waitForSelector('.habit');
    assert.equal(await page.locator('#rest-banner').isVisible(), true);
  });

  await step('하루를 건너뛰면(18일 안 함) 19일에는 보너스 없이 기본 보상이다', async () => {
    assert.equal(await rewardOf('물 마시기'), '+5 XP · +2 G');
    assert.equal(await rewardOf('산책'), '+10 XP · +4 G');
    assert.equal(await rewardOf('책 읽기'), '+20 XP · +8 G');
    assert.equal(await habit('산책').locator('.streak').count(), 0);
  });

  await step('설정: 습관 수정(이름·요일)과 삭제', async () => {
    await page.locator('.tabbar [data-tab="settings"]').click();
    await shot('08-설정');
    const row = page.locator('.manage-list li', { hasText: '산책' });
    await row.locator('[data-action="edit-habit"]').click();
    await page.fill('[name="name"]', '저녁 산책');
    for (const d of ['화', '목', '토', '일']) await page.locator('.sheet .seg.cols-7 label', { hasText: d }).click(); // 월·수·금만 남김
    await page.locator('.sheet button[type="submit"]').click();
    assert.match(await page.locator('.manage-list').textContent(), /저녁 산책\s*운동 · 보통 · 월·수·금/);

    await page.locator('.manage-list li', { hasText: '책 읽기' }).locator('[data-action="delete-habit"]').click();
    await page.locator('[data-answer="no"]').click(); // 취소하면 안 지워진다
    assert.equal(await page.locator('.manage-list li').count(), 3);
    await page.locator('.manage-list li', { hasText: '책 읽기' }).locator('[data-action="delete-habit"]').click();
    await page.locator('[data-answer="yes"]').click();
    assert.equal(await page.locator('.manage-list li').count(), 2);

    await page.locator('.tabbar [data-tab="today"]').click();
    // 19일은 목요일: 월·수·금으로 바꾼 '저녁 산책'은 오늘 목록에서 빠진다
    assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['물 마시기']);
    assert.deepEqual(await hero(), { level: 2, xp: '64 / 70', gold: '48', progress: '0 / 1' }); // 받은 보상은 그대로
  });

  await step('설정: 하루 기준 시각을 오전 6시로 바꾸면 새벽 5시는 아직 전날이다', async () => {
    await page.locator('.tabbar [data-tab="settings"]').click();
    await page.selectOption('#day-start', '6');
    await openAt('2026-11-20T05:00:00');
    assert.equal(await page.textContent('#today-date'), '11월 19일 (목)');
    await page.locator('.tabbar [data-tab="settings"]').click();
    assert.equal(await page.inputValue('#day-start'), '6'); // 다시 열어도 설정이 남아 있다
    await openAt('2026-11-20T06:00:00', { keepReport: true });
    assert.equal(await page.textContent('#today-date'), '11월 20일 (금)');
    assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['물 마시기', '저녁 산책']);
  });

  await step('[2단계] 휴식일이었던 19일은 못 한 습관이 있어도 HP가 깎이지 않는다', async () => {
    const text = await reportText();
    assert.match(text, /11월 19일 \(목\) 벌칙 없음 휴식일 · 0\/1 완료/);
    assert.match(text, /HP 35 → 35/);
    await dismissReport();
    assert.equal(await hp(), '35 / 50');
  });

  await step('[2단계] 같은 주에는 휴식일을 다시 쓸 수 없다', async () => {
    assert.equal(await page.locator('[data-action="rest-on"]').count(), 0);
    assert.match(await page.textContent('#rest-box'), /이번 주 휴식일은 11월 19일 \(목\)에 썼어요/);
    await openAt('2026-11-23T09:00:00'); // 다음 주 월요일
    assert.equal(await page.locator('[data-action="rest-on"]').count(), 1);
  });

  await step('초기화는 두 번 확인한 뒤에만 지운다', async () => {
    await page.locator('.tabbar [data-tab="settings"]').click();
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.locator('[data-answer="no"]').click(); // 두 번째에서 취소
    assert.equal(await page.locator('.manage-list li').count(), 2);
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('.empty-today');
    assert.equal((await hero()).level, 1);
    await page.reload();
    await page.waitForSelector('.empty-today');
    assert.deepEqual(await hero(), { level: 1, xp: '0 / 50', gold: '0', progress: '0 / 0' });
  });

  await step('[6단계] 빈 화면에서 "추천 습관 고르기": 입력 없이 여러 개를 한 번에 담는다', async () => {
    await page.locator('.empty-today [data-action="suggest"]').click();
    assert.equal(await page.locator('.sug-row').count(), 24);
    const submit = page.locator('.sheet [type="submit"]');
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await submit.textContent(), '습관을 골라 주세요');
    const waterName = () => page.textContent('[data-name="water"]');
    assert.equal(await waterName(), '물 300ml 마시기'); // 기본은 쉬움
    await page.locator('.sheet .seg label', { hasText: '보통' }).click();
    assert.equal(await waterName(), '물 1L 마시기');
    await page.locator('.sheet .seg label', { hasText: '어려움' }).click();
    assert.equal(await waterName(), '물 2L 마시기');
    await page.locator('.sheet .seg label', { hasText: '쉬움' }).click();
    for (const name of ['물 300ml 마시기', '산책 10분', '책 10쪽 읽기']) await page.locator('.sug-row', { hasText: name }).click();
    assert.equal(await submit.textContent(), '3개 추가');
    await page.waitForTimeout(300);
    await shot('27-추천-담기');
    await submit.click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    // 월요일 09시는 업무 시간: 업무 습관(물 마시기)이 먼저, 저녁 습관(산책·책 읽기)은 '이따가'
    assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['물 300ml 마시기', '산책 10분', '책 10쪽 읽기']);
    assert.equal(await rewardOf('산책 10분'), '+5 XP · +2 G');
    assert.equal((await hero()).progress, '0 / 3');
    assert.match(await habit('산책 10분').getAttribute('class'), /cat-exercise/);
    assert.match(await habit('물 300ml 마시기').getAttribute('class'), /cat-life/);
  });

  await step('[6단계] 습관 추가 화면의 추천 칩: 누르면 이름·분야가 채워지고, 난이도를 바꾸면 분량이 따라 바뀐다', async () => {
    await setClock('2026-11-23T09:10:00');
    await page.locator('#view-today .section-head [data-action="add-habit"]').click();
    assert.match(await page.locator('.sug-tab.is-on').textContent(), /지금/); // 첫 탭은 지금 시간대 추천
    await page.locator('.sug-tab', { hasText: '운동' }).click();
    assert.equal(await page.locator('.sug-chip').count(), 6);
    assert.equal(await page.locator('.sug-chip', { hasText: '산책' }).isDisabled(), true); // 이미 담은 것
    await page.locator('.sug-tab', { hasText: '생활' }).click();
    assert.equal(await page.locator('.sug-chip', { hasText: '물 마시기' }).isDisabled(), true);
    await page.locator('.sug-chip', { hasText: '일기 쓰기' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '일기 세 줄 쓰기'); // 기본 난이도는 보통
    assert.equal(await page.locator('[name="category"][value="life"]').isChecked(), true);
    assert.deepEqual(await page.locator('.seg .amount').allTextContents(), ['한 줄', '세 줄', '한 쪽']);
    await page.locator('.sheet .seg label', { hasText: '어려움' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '일기 한 쪽 쓰기');
    await page.locator('.sheet .seg label', { hasText: '쉬움' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '일기 한 줄 쓰기');
    await page.waitForTimeout(300);
    await shot('28-추천-칩');
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.equal(await rewardOf('일기 한 줄 쓰기'), '+5 XP · +2 G');
  });

  await step('[6단계] 추천을 고른 뒤 이름을 직접 고치면 연결이 끊겨, 난이도를 바꿔도 이름이 그대로다', async () => {
    await setClock('2026-11-23T09:11:00');
    await page.locator('#view-today .section-head [data-action="add-habit"]').click();
    await page.locator('.sug-tab', { hasText: '생활' }).click();
    await page.locator('.sug-chip', { hasText: '정리' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '정리 15분');
    await page.fill('[name="name"]', '책상 정리 15분');
    assert.equal(await page.locator('.sug-chip.is-on').count(), 0);
    assert.equal(await page.locator('.seg .amount').count(), 0);
    await page.locator('.sheet .seg label', { hasText: '어려움' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '책상 정리 15분');
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.equal(await rewardOf('책상 정리 15분'), '+20 XP · +8 G');
  });

  await step('[6단계] 추천에서 온 습관은 수정 화면에서 난이도를 바꾸면 이름도 바뀌고, 담은 추천은 "추가됨"으로 표시된다', async () => {
    await tab('settings');
    await page.locator('.manage-list li', { hasText: '산책 10분' }).locator('[data-action="edit-habit"]').click();
    assert.equal(await page.locator('.sug-chip').count(), 0); // 수정 화면에는 추천 칩이 없다
    assert.deepEqual(await page.locator('.seg .amount').allTextContents(), ['10분', '30분', '1시간']);
    await page.locator('.sheet .seg label', { hasText: '보통' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '산책 30분');
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.match(await page.locator('.manage-list').textContent(), /산책 30분\s*운동 · 보통 · 매일/);

    await page.locator('#view-settings [data-action="suggest"]').click();
    // 산책·책 읽기·물 마시기·일기는 추가됨. 이름을 고친 '책상 정리'는 추천과 끊겼으므로 '정리'는 다시 고를 수 있다.
    assert.equal(await page.locator('.sug-row.is-used').count(), 4);
    assert.equal(await page.locator('.sug-row.is-used', { hasText: '정리' }).count(), 0);
    await page.locator('.sheet [data-cancel]').click();
    await page.reload(); // 다시 열어도 그대로
    await page.waitForSelector('.habit');
    // 지금(업무): 물 / 이따가: 저녁(산책·책 읽기·책상 정리) → 자기 전(일기)
    assert.deepEqual(await page.locator('.habit-name').allTextContents(),
      ['물 300ml 마시기', '산책 30분', '책 10쪽 읽기', '책상 정리 15분', '일기 한 줄 쓰기']);
  });

  await step('[7단계] 오늘 화면의 연필 버튼으로 바로 수정하고, 수정 화면에서 삭제도 된다', async () => {
    await tab('today');
    assert.equal(await page.locator('.habit-edit').count(), 5);
    await page.waitForTimeout(300);
    await shot('29-오늘-수정-버튼');
    // 연필을 누르면 체크되지 않고 수정 화면이 열린다
    await page.locator('li', { hasText: '책상 정리 15분' }).locator('.habit-edit').click();
    assert.match(await page.textContent('.sheet h2'), /습관 수정/);
    assert.equal(await page.inputValue('[name="name"]'), '책상 정리 15분');
    await page.fill('[name="name"]', '책상 정리 20분');
    await page.locator('.sheet .seg label', { hasText: '보통' }).click();
    for (const d of ['토', '일']) await page.locator('.sheet .seg.cols-7 label', { hasText: d }).click(); // 평일만
    await page.waitForTimeout(300);
    await shot('30-수정-화면');
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.equal(await habit('책상 정리 20분').getAttribute('aria-pressed'), 'false'); // 체크되지 않았다
    assert.equal(await rewardOf('책상 정리 20분'), '+10 XP · +4 G');
    await tab('settings');
    assert.match(await page.locator('.manage-list').textContent(), /책상 정리 20분\s*생활 · 보통 · 평일/);
    await tab('today');

    // 수정 화면의 '이 습관 삭제'
    await page.locator('li', { hasText: '일기 한 줄 쓰기' }).locator('.habit-edit').click();
    await page.locator('[data-delete]').click();
    assert.match(await page.textContent('.dialog'), /"일기 한 줄 쓰기" 습관을 지웁니다/);
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['물 300ml 마시기', '산책 30분', '책 10쪽 읽기', '책상 정리 20분']);

    // 체크된 습관도 연필로 고칠 수 있고, 체크 상태는 그대로다
    await habit('물 300ml 마시기').click();
    await page.locator('li', { hasText: '물 300ml 마시기' }).locator('.habit-edit').click();
    await page.locator('.sheet .seg label', { hasText: '보통' }).click();
    assert.equal(await page.inputValue('[name="name"]'), '물 1L 마시기'); // 추천에서 온 습관: 분량이 따라 바뀐다
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.equal(await habit('물 1L 마시기').getAttribute('aria-pressed'), 'true');

    // 다음 시험을 위해 다시 빈 상태로 되돌린다
    await tab('settings');
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('.empty-today');
  });

  const groupTitles = () => page.locator('.group-title').allTextContents();
  const sectionOf = async () => {
    // 오늘 목록을 [묶음 제목, [습관 이름…]] 으로 읽는다
    return page.evaluate(() => {
      const out = [];
      for (const li of document.querySelectorAll('#habit-list > li')) {
        if (li.classList.contains('group-title')) out.push([li.textContent.trim(), []]);
        else if (li.querySelector('.habit-name')) {
          if (!out.length) out.push(['(제목 없음)', []]);
          out[out.length - 1][1].push(li.querySelector('.habit-name').textContent);
        }
      }
      return out;
    });
  };
  const tick = async (iso) => {
    // 앱을 켜 둔 채 시간이 흐른 상황: 시계를 옮기고 화면으로 돌아온 것처럼 알린다
    await setClock(iso);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  };

  await step('[8단계] 추천을 담으면 시간대도 함께 들어가고, 지금 시간대에 맞는 추천에 "지금" 표시가 붙는다', async () => {
    await openAt('2026-11-23T07:30:00'); // 월요일 아침
    await page.locator('.empty-today [data-action="suggest"]').click();
    assert.match(await page.locator('.sug-row', { hasText: '스트레칭 5분' }).textContent(), /🌅 아침 · 지금/);
    assert.match(await page.locator('.sug-row', { hasText: '물 300ml' }).textContent(), /💼 업무 시간/);
    for (const name of ['스트레칭 5분', '물 300ml', '25분 집중 1번', '산책 10분', '일기 한 줄', '채소 한 끼']) {
      await page.locator('.sug-row', { hasText: name }).click();
    }
    await page.locator('.sheet [type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.equal(await page.textContent('#now-line'), '지금 🌅 아침 · ~08:30');
    assert.deepEqual(await sectionOf(), [
      ['지금 할 것 · 🌅 아침', ['스트레칭 5분', '채소 한 끼 먹기']],
      ['이따가', ['25분 집중 1번', '물 300ml 마시기', '산책 10분', '일기 한 줄 쓰기']], // 한 번에 담으면 분야 순서대로 들어간다
    ]);
    assert.match(await habit('물 300ml 마시기').textContent(), /💼 업무/);
    assert.doesNotMatch(await habit('채소 한 끼 먹기').textContent(), /언제나/); // '언제나'는 따로 표시하지 않는다
  });

  await step('[8단계] 08:30이 지나면 업무 시간 습관이 맨 위로 올라오고, 놓친 아침 습관은 따로 보인다', async () => {
    await tick('2026-11-23T08:30:00');
    assert.equal(await page.textContent('#now-line'), '지금 💼 업무 시간 · 08:30–17:30');
    assert.deepEqual(await sectionOf(), [
      ['지금 할 것 · 💼 업무 시간', ['25분 집중 1번', '물 300ml 마시기', '채소 한 끼 먹기']],
      ['지나간 시간대 · 아직 안 했어요', ['스트레칭 5분']],
      ['이따가', ['산책 10분', '일기 한 줄 쓰기']],
    ]);
    await page.waitForTimeout(300);
    await shot('31-업무-시간');
    // 완료하면 '완료'로 내려간다
    await habit('물 300ml 마시기').click();
    await habit('스트레칭 5분').click(); // 지나간 시간대 습관도 체크할 수 있다
    assert.deepEqual((await sectionOf()).map(([t, n]) => [t, n.length]), [
      ['지금 할 것 · 💼 업무 시간', 2], ['이따가', 2], ['완료', 2],
    ]);
    assert.deepEqual((await sectionOf())[2][1], ['스트레칭 5분', '물 300ml 마시기']);
  });

  await step('[8단계] 17:30이 지나면 저녁, 22시가 지나면 자기 전 습관이 맨 위로 온다', async () => {
    await tick('2026-11-23T17:30:00');
    assert.deepEqual((await sectionOf()).slice(0, 2), [
      ['지금 할 것 · 🌆 저녁', ['산책 10분', '채소 한 끼 먹기']],
      ['지나간 시간대 · 아직 안 했어요', ['25분 집중 1번']],
    ]);
    await tick('2026-11-24T01:00:00'); // 자정이 지나도 새벽 4시 전이면 아직 23일 밤
    assert.equal(await page.textContent('#today-date'), '11월 23일 (월)');
    assert.deepEqual((await sectionOf())[0], ['지금 할 것 · 🌙 자기 전', ['일기 한 줄 쓰기', '채소 한 끼 먹기']]);
  });

  await step('[8단계] 습관 추가 화면의 "지금" 탭: 업무 시간에는 업무 시간에 할 수 있는 추천이 먼저 나온다', async () => {
    await tick('2026-11-23T15:00:00');
    await page.locator('#view-today .section-head [data-action="add-habit"]').click();
    assert.match(await page.locator('.sug-tab.is-on').textContent(), /💼 지금/);
    assert.equal(await page.textContent('#sug-hint'), '업무 시간에 하기 좋은 습관이에요.');
    assert.deepEqual(
      (await page.locator('#sug-chips .sug-chip').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()),
      ['🪜 계단 오르기', '🎯 집중 시간 ✓', '📥 메일 정리', '🧍 일어나 몸 풀기', '📌 하루 돌아보기', '💧 물 마시기 ✓', '🥗 채소 먹기 ✓'],
    );
    await page.locator('.sug-chip', { hasText: '메일 정리' }).click();
    assert.equal(await page.locator('[name="when"][value="work"]').isChecked(), true); // 시간대도 채워진다
    assert.equal(await page.locator('[name="category"][value="work"]').isChecked(), true);
    await page.waitForTimeout(300);
    await shot('32-지금-추천');
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.deepEqual((await sectionOf())[0], ['지금 할 것 · 💼 업무 시간', ['25분 집중 1번', '메일 정리 15분', '채소 한 끼 먹기']]);
  });

  await step('[8단계] 연필로 시간대를 바꾸면 바로 그 묶음으로 옮겨진다', async () => {
    await page.locator('li', { hasText: '채소 한 끼 먹기' }).locator('.habit-edit').click();
    assert.equal(await page.locator('[name="when"][value="any"]').isChecked(), true);
    await page.locator('.when-seg label', { hasText: '저녁' }).click();
    await page.locator('.sheet button[type="submit"]').click();
    await page.waitForSelector('.backdrop', { state: 'detached' });
    assert.deepEqual((await sectionOf()).find(([t]) => t === '이따가')[1], ['산책 10분', '채소 한 끼 먹기', '일기 한 줄 쓰기']);
    assert.match(await habit('채소 한 끼 먹기').textContent(), /🌆 저녁/);
  });

  await step('[8단계] 설정의 하루 일과: 업무 시간과 요일을 바꾸면 그대로 반영되고, 잘못된 순서는 막는다', async () => {
    await tab('settings');
    assert.equal(await page.inputValue('[name="workStart"]'), '08:30');
    assert.equal(await page.inputValue('[name="workEnd"]'), '17:30');
    await page.fill('[name="workStart"]', '18:00');
    await page.locator('#routine-form [type="submit"]').click();
    assert.equal(await page.textContent('#routine-form .form-error'), '업무 끝 시각은 시작보다 늦어야 해요.');
    await page.fill('[name="workStart"]', '09:00');
    await page.fill('[name="workEnd"]', '18:00');
    await page.locator('#routine-form label', { hasText: '토' }).click(); // 토요일도 근무
    await page.locator('#routine-form [type="submit"]').click();
    assert.match(await page.textContent('#toast'), /하루 일과를 저장했어요/);
    await page.locator('#routine-form').scrollIntoViewIfNeeded();
    await shot('33-일과-설정');
    await page.reload();
    await page.waitForSelector('.habit');
    await tab('settings');
    assert.equal(await page.inputValue('[name="workStart"]'), '09:00');
    await tab('today');
    await tick('2026-11-23T08:45:00');
    assert.equal(await page.textContent('#now-line'), '지금 🌅 아침 · ~09:00');
    await tick('2026-11-23T17:45:00');
    assert.equal(await page.textContent('#now-line'), '지금 💼 업무 시간 · 09:00–18:00');
  });

  await step('[8단계] 쉬는 날(일요일)에는 업무 시간이 없고, 업무 습관도 낮에 함께 보인다', async () => {
    await openAt('2026-11-29T14:00:00'); // 일요일
    assert.equal(await page.textContent('#now-line'), '지금 🌤️ 낮 (쉬는 날) · 12:00–18:00');
    assert.deepEqual((await sectionOf())[0], ['지금 할 것 · 🌤️ 낮 (쉬는 날)', ['25분 집중 1번', '물 300ml 마시기', '메일 정리 15분']]);
    // 다음 시험을 위해 11월 23일 시점에서 다시 빈 상태로 되돌린다
    await setClock('2026-11-23T09:11:00');
    await tab('settings');
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('.empty-today');
  });

  await step('[2단계] 열흘 만에 열어도 벌칙은 3일치(−45)까지만: HP 50 → 5', async () => {
    await openAt('2026-11-23T09:00:00');
    minute = 0;
    await addHabit('물 마시기', '쉬움', '생활', '2026-11-23T09:00:00');
    await addHabit('산책', '보통', '운동', '2026-11-23T09:00:00');
    await addHabit('책 읽기', '어려움', '공부', '2026-11-23T09:00:00');
    await openAt('2026-12-03T09:00:00', { keepReport: true });
    const text = await reportText();
    assert.match(text, /11월 23일 \(월\) HP −15/);
    assert.match(text, /11월 24일 \(화\) HP −15/);
    assert.match(text, /11월 25일 \(수\) HP −15/);
    assert.doesNotMatch(text, /11월 26일/);
    assert.match(text, /그 뒤 7일은 벌칙 없이 넘어갔어요/);
    assert.match(text, /HP 50 → 5/);
    await shot('11-열흘-만에');
    await dismissReport();
    assert.equal(await hp(), '5 / 50');
    assert.equal(await page.locator('.bar.hp.is-low').count(), 1);
  });

  await step('[2단계] HP가 0이 되면 경험치 10%만 잃고 레벨은 그대로, HP 25로 되살아난다', async () => {
    await habit('책 읽기').click(); // +20 XP, HP 5 → 7
    assert.deepEqual([(await hero()).xp, await hp()], ['20 / 50', '7 / 50']);
    await openAt('2026-12-04T09:00:00', { keepReport: true }); // 3일에 2개 못 함 → −10 → 0 이하
    const text = await reportText();
    assert.match(text, /12월 3일 \(목\) HP −10 1\/3 완료/);
    assert.match(text, /HP가 0이 되어 경험치를 2 잃고, HP 25로 다시 일어났어요\. 레벨은 그대로예요/);
    assert.match(text, /HP 7 → 25/);
    await shot('12-HP-0');
    await dismissReport();
    assert.deepEqual([(await hero()).level, (await hero()).xp, await hp()], [1, '18 / 50', '25 / 50']);
  });

  await step('[2단계] 레벨 업하면 HP가 가득 찬다', async () => {
    for (const name of ['물 마시기', '산책', '책 읽기']) await habit(name).click(); // 5 + 10 + 22(책 읽기 연속 2일째) + 20 = 57 → 18 + 57 = 75
    await page.waitForSelector('.levelup');
    await closeLevelUp();
    assert.deepEqual([(await hero()).level, (await hero()).xp, await hp()], [2, '25 / 70', '50 / 50']);
  });

  await step('[3단계] 상점: 골드가 모자라면 살 수 없고, 2단계 이상은 레벨이 될 때까지 잠겨 있다', async () => {
    assert.equal((await hero()).gold, '32'); // 3일 8 + 4일 (2+4+8+10)
    await tab('shop');
    assert.equal(await page.locator('.item').count(), 16);
    assert.equal(await page.textContent('#shop-gold'), '32');
    assert.equal(await page.textContent('#shop-bonus'), '경험치 +0%');
    await item('head1').locator('[data-action="buy"]').click();
    assert.match(await page.textContent('#toast'), /골드가 18 부족해요/);
    assert.equal(await page.locator('.dialog').count(), 0);
    assert.match(await item('head2').textContent(), /Lv\.5에 열림/);
    assert.match(await item('head3').textContent(), /Lv\.10에 열림/);
    assert.match(await item('head4').textContent(), /Lv\.15에 열림/);
    assert.deepEqual(
      await page.locator('.item[data-item^="weapon"] .btn.buy').allTextContents(),
      ['50'], // 1단계만 가격 버튼이 보인다
    );
    await shot('13-상점-처음');
    await tab('today');
  });

  await step('[3단계] 다음 날 골드 56이 되면 천 두건(50 G)을 사고, 사자마자 캐릭터 그림이 바뀐다', async () => {
    await openAt('2026-12-05T09:00:00');
    for (const name of ['물 마시기', '산책', '책 읽기']) await habit(name).click(); // 6 + 11 + 24 + 20 = 61 XP, 24 G
    await page.waitForSelector('.levelup');
    await closeLevelUp();
    assert.deepEqual(await hero(), { level: 3, xp: '16 / 90', gold: '56', progress: '3 / 3' });
    assert.equal(await wearing(), '');

    await tab('shop');
    await item('head1').locator('[data-action="buy"]').click();
    assert.match(await page.textContent('.dialog'), /천 두건을 살까요\?/);
    await page.locator('[data-answer="no"]').click(); // 취소하면 골드가 그대로다
    assert.equal(await page.textContent('#shop-gold'), '56');
    await buyItem('head1');
    assert.equal(await page.textContent('#shop-gold'), '6');
    assert.equal(await page.textContent('#shop-bonus'), '경험치 +2%');
    assert.match(await item('head1').textContent(), /착용 중/);
    assert.equal(await page.locator('#shop-char svg').getAttribute('data-items'), 'head1');
    assert.equal(await wearing(), 'head1'); // 오늘 화면의 캐릭터도 함께 바뀐다
    await page.waitForTimeout(600);
    await shot('14-천-두건-구매');
  });

  await step('[3단계] 장비를 벗고 다시 낄 수 있고, 다시 열어도 그대로다', async () => {
    await item('head1').locator('[data-action="unequip"]').click();
    assert.equal(await wearing(), '');
    assert.equal(await page.textContent('#shop-bonus'), '경험치 +0%');
    assert.equal(await page.textContent('#shop-gold'), '6'); // 벗어도 골드는 돌아오지 않는다
    await item('head1').locator('[data-action="equip"]').click();
    assert.equal(await wearing(), 'head1');
    await page.reload();
    await page.waitForSelector('.habit');
    assert.equal(await wearing(), 'head1');
    assert.equal((await hero()).gold, '6');
  });

  await step('[3단계] Lv.5가 되면 레벨 업 화면에 "2단계 장비가 열렸어요"가 뜨고 상점에서 살 수 있다', async () => {
    await openAt('2026-12-06T09:00:00');
    await seedPlayer({ level: 4, xp: 105, gold: 5000 }); // Lv4 → 5 에는 110 XP 필요
    await habit('물 마시기').click(); // 연속 3일째 +20% → 6 XP (장비 +2%는 0.1 XP가 쌓이기만 한다)
    await page.waitForSelector('.levelup');
    assert.match(await page.textContent('.levelup'), /상점에 2단계 장비가 열렸어요/);
    assert.match(await page.textContent('.levelup'), /깃털 모자 · 가죽 갑옷 · 무쇠 검 · 은빛 목걸이/);
    await page.waitForTimeout(700);
    await shot('15-장비-해금');
    await closeLevelUp();
    assert.deepEqual(await hero(), { level: 5, xp: '1 / 130', gold: '5,002', progress: '1 / 3' });
    await tab('shop');
    assert.match(await item('head3').textContent(), /Lv\.10에 열림/);
    await buyItem('head2');
    assert.equal(await page.textContent('#shop-gold'), '4,852');
    assert.equal(await wearing(), 'head2'); // 같은 부위는 새로 산 것으로 바뀐다
    assert.match(await item('head1').textContent(), /착용$/m);
    assert.equal(await page.textContent('#shop-bonus'), '경험치 +4%');
  });

  await step('[3단계] Lv.10에 3단계, Lv.15에 4단계가 열린다', async () => {
    await seedPlayer({ level: 10 });
    await tab('shop');
    assert.equal(await item('body3').locator('[data-action="buy"]').count(), 1);
    assert.match(await item('body4').textContent(), /Lv\.15에 열림/);
    await seedPlayer({ level: 15 });
    await tab('shop');
    assert.equal(await page.locator('.item .lock').count(), 0);
    assert.deepEqual(
      await page.locator('.item[data-item^="body"] .btn.buy').allTextContents(),
      ['50', '150', '400', '1,000'],
    );
  });

  await step('[3단계] 4단계 4부위를 모두 끼면 효과는 32%가 아니라 최대치 +20%', async () => {
    for (const id of ['head4', 'body4', 'weapon4']) await buyItem(id);
    assert.equal(await page.textContent('#shop-bonus'), '경험치 +20%'); // 8 × 3 = 24 → 20
    await buyItem('accessory4');
    assert.equal(await page.textContent('#shop-bonus'), '경험치 +20%');
    assert.equal(await page.textContent('#shop-gold'), '852'); // 4,852 − 4,000
    assert.equal(await wearing(), 'head4 body4 weapon4 accessory4');
    await page.waitForTimeout(600);
    await shot('16-상점-4단계');
    await tab('today');
    // 산책: 연속 3일째 12 + 장비 20% 2 = 14 / 책 읽기: 연속 4일째 26 + 4 = 30
    assert.equal(await rewardOf('산책'), '+14 XP · +4 G');
    assert.equal(await rewardOf('책 읽기'), '+30 XP · +8 G');
    await habit('산책').click();
    assert.match(await page.textContent('#fx-layer'), /\+14 XP\s*\+4 G/);
    assert.deepEqual(await hero(), { level: 15, xp: '15 / 330', gold: '856', progress: '2 / 3' });
    await page.waitForTimeout(1300);
    await shot('17-오늘-4단계-장비');
  });

  await step('[3단계] 골드를 쓴 뒤 체크를 취소하면 그만큼 골드가 빠진다 (음수 가능)', async () => {
    await seedPlayer({ gold: 3 });
    await habit('산책').click(); // 취소: −4 G
    assert.equal((await hero()).gold, '-1');
    await habit('산책').click();
    assert.equal((await hero()).gold, '3');
  });

  await step('[4단계] 기록 화면: 총 획득 경험치, 완료 횟수, 완벽한 하루, 30일 달력', async () => {
    await tab('log');
    // 3일 20 + 4일 57 + 5일 61 + 6일 (6 + 14) = 158
    assert.equal((await page.textContent('#stat-total-xp')).trim(), '158XP');
    assert.equal((await page.textContent('#stat-completions')).trim(), '9번');
    assert.equal((await page.textContent('#stat-perfect')).trim(), '2일');
    assert.match(await page.textContent('#stat-rate'), /달성률 21%/); // 14일 × 3개 = 42개 중 9개
    assert.equal(await page.locator('.cal-cell').count(), 30);
    const cell = (day) => page.locator(`.cal-cell[data-day="${day}"]`);
    const level = async (day) => (await cell(day).getAttribute('class')).match(/lv-\w+/)[0];
    assert.equal(await page.locator('.cal-cell').first().getAttribute('data-day'), '2026-11-07');
    assert.equal(await level('2026-11-22'), 'lv-none'); // 앱을 쓰기 전
    assert.equal(await level('2026-11-24'), 'lv-0'); // 0/3
    assert.equal(await level('2026-12-03'), 'lv-2'); // 1/3
    assert.equal(await level('2026-12-04'), 'lv-4'); // 3/3
    assert.equal(await level('2026-12-06'), 'lv-3'); // 오늘 2/3
    assert.match(await cell('2026-12-04').textContent(), /★/);
    assert.match(await cell('2026-12-06').getAttribute('class'), /is-today/);
    assert.match(await page.textContent('#cal-detail'), /12월 6일 \(일\)3개 중 2개 완료 \(67%\) · 진행 중/);
    await cell('2026-11-24').click();
    assert.match(await page.textContent('#cal-detail'), /11월 24일 \(화\)3개 중 0개 완료 \(0%\) · HP −15/);
    await cell('2026-12-04').click();
    assert.match(await page.textContent('#cal-detail'), /3개 중 3개 완료 \(100%\) · ★ 완벽한 하루/);
    assert.deepEqual(
      (await page.locator('.streak-list li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()),
      ['물 마시기 🔥 3일 최고 3일', '산책 🔥 3일 최고 3일', '책 읽기 🔥 3일 최고 3일'],
    );
    await shot('18-기록');
  });

  await step('[4단계] 기록 화면은 오늘 화면에서 체크하면 바로 반영된다', async () => {
    await tab('today');
    await habit('책 읽기').click(); // 26 + 4 = 30 XP, 3/3 → 완벽한 하루 +20
    await page.waitForSelector('#fx-layer .confetti', { state: 'attached' }); // 완벽한 하루 색종이 (0.35초 뒤에 나온다)
    await tab('log');
    assert.equal((await page.textContent('#stat-total-xp')).trim(), '208XP');
    assert.equal((await page.textContent('#stat-perfect')).trim(), '3일');
    assert.match(await page.locator('.cal-cell[data-day="2026-12-06"]').getAttribute('class'), /lv-4/);
    assert.match((await page.locator('.streak-list li').nth(2).innerText()).replace(/\s+/g, ' '), /책 읽기 🔥 4일 최고 4일/);
    await tab('today');
    await habit('책 읽기').click(); // 다시 취소해 둔다
    assert.equal((await hero()).progress, '2 / 3');
  });

  let backupFile;
  await step('[4단계] 백업 내보내기: JSON 파일이 내려받아지고 마지막 백업 날짜가 표시된다', async () => {
    await tab('settings');
    assert.match(await page.textContent('#backup-last'), /아직 백업한 적이 없어요/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export"]').click()]);
    assert.equal(download.suggestedFilename(), 'habit-rpg-backup-2026-12-06.json');
    backupFile = path.join(require('node:os').tmpdir(), `habit-rpg-e2e-${Date.now()}.json`);
    await download.saveAs(backupFile);
    const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    assert.equal(data.app, 'habit-rpg');
    assert.equal(data.version, 2);
    assert.deepEqual(data.habits.map((h) => h.name), ['물 마시기', '산책', '책 읽기']);
    assert.equal(data.completions.length, 9);
    assert.deepEqual(data.gear.equipped, { head: 'head4', body: 'body4', weapon: 'weapon4', accessory: 'accessory4' });
    assert.equal(data.player.level, 15);
    assert.match(await page.textContent('#backup-last'), /마지막 백업: 2026년 12월 6일/);
    await shot('19-설정-백업');
  });

  await step('[4단계] 백업 가져오기: 내보낸 뒤에 바꾼 내용이 백업 시점으로 되돌아간다', async () => {
    const before = await hero();
    // 내보낸 뒤에 습관 하나를 지우고 장비를 벗는다
    await page.locator('.manage-list li', { hasText: '산책' }).locator('[data-action="delete-habit"]').click();
    await page.locator('[data-answer="yes"]').click();
    await tab('shop');
    await item('head4').locator('[data-action="unequip"]').click();
    assert.equal(await wearing(), 'body4 weapon4 accessory4');

    await page.setInputFiles('#import-file', backupFile);
    assert.match(await page.textContent('.dialog'), /Lv\.15 · 습관 3개 · 완료 기록 9건/);
    await page.locator('[data-answer="no"]').click(); // 취소하면 아무것도 바뀌지 않는다
    assert.equal(await wearing(), 'body4 weapon4 accessory4');
    await page.setInputFiles('#import-file', backupFile);
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('#view-today:not([hidden])');
    // 아직 안 한 책 읽기가 위, 완료한 물 마시기·산책은 '완료'로 아래
    assert.deepEqual(await page.locator('.habit-name').allTextContents(), ['책 읽기', '물 마시기', '산책']);
    assert.equal(await wearing(), 'head4 body4 weapon4 accessory4');
    assert.deepEqual(await hero(), before);
    await page.reload(); // 가져온 내용이 저장되어 있다
    await page.waitForSelector('.habit');
    assert.deepEqual(await hero(), before);
  });

  await step('[4단계] 백업 가져오기: 엉뚱한 파일은 이유를 알려 주고 데이터를 건드리지 않는다', async () => {
    const before = await hero();
    for (const [content, message] of [
      ['{"hello": 1}', /이 앱에서 내보낸 백업 파일이 아니에요/],
      ['이건 JSON이 아님', /JSON 형식을 읽을 수 없습니다/],
      [fs.readFileSync(backupFile, 'utf8').replace('"level": 15', '"level": -3'), /백업 파일을 읽을 수 없어요\. \(캐릭터\)/],
    ]) {
      await page.setInputFiles('#import-file', { name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from(content) });
      assert.match(await page.textContent('.dialog'), message);
      await page.locator('.dialog button').click();
    }
    assert.deepEqual(await hero(), before);
    assert.equal(await page.locator('.habit').count(), 3);
  });

  await step('[4단계] 초기화한 뒤(새 기기와 같은 상태)에도 백업으로 전부 되살릴 수 있다', async () => {
    const before = await hero();
    await tab('settings');
    await page.locator('[data-action="reset"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('.empty-today');
    assert.equal((await hero()).level, 1);
    await page.setInputFiles('#import-file', backupFile);
    await page.locator('[data-answer="yes"]').click();
    await page.waitForSelector('.habit');
    assert.deepEqual(await hero(), before);
    assert.equal(await wearing(), 'head4 body4 weapon4 accessory4');
    await tab('log');
    assert.equal((await page.textContent('#stat-total-xp')).trim(), '158XP');
    await tab('today');
    fs.rmSync(backupFile);
  });

  await step('[4단계] PWA: 설치 정보(manifest)와 아이콘이 모두 있다', async () => {
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]').href;
      const m = await (await fetch(href)).json();
      const icons = await Promise.all(m.icons.map(async (i) => {
        const res = await fetch(new URL(i.src, href));
        return { ...i, status: res.status, type: res.headers.get('content-type') };
      }));
      return { ...m, icons };
    });
    assert.equal(manifest.name, '습관 모험');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.lang, 'ko');
    assert.deepEqual(manifest.icons.map((i) => [i.sizes, i.purpose, i.status]), [
      ['192x192', 'any', 200], ['512x512', 'any', 200], ['512x512', 'maskable', 200], ['any', 'any', 200],
    ]);
    // 아이콘 PNG의 실제 크기가 적어 둔 크기와 같은지
    const sizes = await page.evaluate(() => Promise.all(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']
      .map((src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img.naturalWidth); img.src = src; }))));
    assert.deepEqual(sizes, [192, 512, 512, 180]);
  });

  await step('[5단계] 전투 탭: 다음 스테이지, 내 능력치(레벨 + 낀 장비), 오늘 전투 기회가 보인다', async () => {
    await page.goto(`${url}?debug&speed=8`); // 시험에서는 전투를 8배 빠르게 돌린다
    await page.waitForSelector('#today-date:not(:empty)');
    await seedMeta('battle', { cleared: 0, wins: 0, losses: 0 });
    // 12월 6일: 물 마시기·산책 완료 → 오늘 기회 2
    assert.equal((await hero()).progress, '2 / 3');
    assert.equal(await page.textContent('#battle-badge'), '2');
    await tab('battle');
    assert.equal(await page.textContent('#stage-label'), '스테이지 1');
    assert.equal(await page.textContent('#stage-name'), '말랑 젤리');
    // Lv15: 공격 6 + 30, 체력 80 + 150 / 별빛 장비 4종: 공격 +30, 방어 6 + 14, 쿨타임 −20%, 피버 3 + 12
    assert.deepEqual(
      await Promise.all(['atk', 'def', 'hp', 'cd', 'fever'].map((k) => page.textContent(`#bs-${k}`))),
      ['66', '20', '230', '6.4초', '15%'],
    );
    assert.equal(await tickets(), '2');
    assert.equal(await chanceDetail(), '오늘 완료 2개 − 싸운 횟수 0');
    await shot('21-전투-대기');
  });

  await step('[5단계] 승리: 골드를 받고 다음 스테이지가 열린다. 오늘 기회를 다 쓰면 더 싸울 수 없다', async () => {
    const before = await hero();
    const hpBefore = await hp();
    await page.locator('[data-action="battle-start"]').click();
    assert.equal(await battleResult(), 'win');
    assert.match(await page.textContent('#arena-result'), /승리!\s*\+3 G/);
    assert.match(await page.textContent('#arena-result'), /다음은 스테이지 2 · 성난 버섯/);
    assert.match(await page.textContent('#arena-result [data-again]'), /다음 스테이지 \(오늘 기회 1\)/);
    await page.waitForTimeout(500);
    await shot('23-전투-승리');
    await page.locator('#arena-result [data-again]').click();
    await page.waitForSelector('#arena-result', { state: 'hidden' });
    assert.equal(await battleResult(), 'win');
    assert.match(await page.textContent('#arena-result'), /\+4 G/);
    assert.equal(await page.locator('#arena-result [data-again]').count(), 0);
    assert.match(await page.textContent('#arena-result'), /오늘 전투 기회를 다 썼어요/);
    await page.locator('#arena-result [data-close]').click();
    assert.equal(await page.locator('.arena').count(), 0);
    assert.equal(await page.textContent('#stage-label'), '스테이지 3');
    assert.equal(await tickets(), '0');
    assert.equal(await page.locator('[data-action="battle-start"]').isDisabled(), true);
    assert.equal(await chanceDetail(), '오늘 완료 2개 − 싸운 횟수 2');
    assert.match(await page.textContent('#battle-record'), /2승 0패/);
    const after = await hero();
    assert.equal(Number(after.gold.replace(',', '')), Number(before.gold.replace(',', '')) + 7);
    assert.deepEqual([after.level, after.xp, await hp()], [before.level, before.xp, hpBefore]);
  });

  await step('[7단계] 싸운 뒤 체크를 해제했다 다시 체크해도 전투 기회가 다시 생기지 않는다', async () => {
    for (let i = 0; i < 3; i++) {
      await tab('today');
      await habit('산책').click(); // 해제
      assert.equal(await page.locator('#battle-badge').isHidden(), true);
      await habit('산책').click(); // 다시 체크
      assert.equal(await page.locator('#battle-badge').isHidden(), true);
      await tab('battle');
      assert.equal(await tickets(), '0');
      assert.equal(await page.locator('[data-action="battle-start"]').isDisabled(), true);
    }
    assert.equal(await chanceDetail(), '오늘 완료 2개 − 싸운 횟수 2');
    await page.reload(); // 다시 열어도 그대로
    await page.waitForSelector('.habit');
    await tab('battle');
    assert.equal(await tickets(), '0');
    // 새 습관을 완료하면 그만큼 생긴다: 책 읽기 +1, 오늘 3/3 완벽한 하루 +1
    await tab('today');
    await habit('책 읽기').click();
    assert.equal(await page.textContent('#battle-badge'), '2');
    await tab('battle');
    assert.equal(await chanceDetail(), '오늘 완료 3개 + 완벽한 하루 1 − 싸운 횟수 2');
  });

  await step('[5단계] 스킬: 쿨타임이 차면 버튼이 켜지고, 누르면 "강타!"가 나간 뒤 다시 쿨타임이 돈다', async () => {
    await seedMeta('battle', { cleared: 19 });
    await tab('battle');
    assert.equal(await page.textContent('#stage-name'), '어둠의 불꽃 도깨비 대장');
    assert.match(await page.locator('.stage-card').getAttribute('class'), /is-boss/);
    await page.locator('[data-action="battle-start"]').click();
    assert.equal(await page.locator('#skill-btn').isDisabled(), true); // 처음에는 쿨타임 중
    await page.waitForSelector('#skill-btn.is-ready');
    await shot('22-전투-중');
    await page.locator('#skill-btn').click();
    await page.waitForSelector('.dmg.skill', { state: 'attached' });
    // 공격력 66 × 3 − 방어 4 = 194
    assert.equal(await page.locator('.dmg.skill').first().textContent(), '강타! 194');
    await page.waitForSelector('#skill-btn:not(.is-ready)');
    assert.ok(['win', 'lose'].includes(await battleResult()));
    await page.locator('#arena-result [data-close]').click();
    assert.equal(await tickets(), '1');
  });

  await step('[5단계] 패배: 오늘 기회만 줄고 골드·경험치·HP·스테이지는 그대로다', async () => {
    await seedMeta('battle', { cleared: 59, wins: 0, losses: 0 });
    const before = [await hero(), await hp()];
    await tab('battle');
    await page.locator('[data-action="battle-start"]').click();
    assert.equal(await battleResult(), 'lose');
    assert.match(await page.textContent('#arena-result'), /패배\s*잃은 것은 없어요/);
    await page.waitForTimeout(400);
    await shot('24-전투-패배');
    await page.locator('#arena-result [data-close]').click();
    assert.deepEqual([await hero(), await hp()], before);
    assert.equal(await page.textContent('#stage-label'), '스테이지 60 · 보스');
    assert.equal(await tickets(), '0');
    assert.match(await page.textContent('#battle-record'), /0승 1패/);
    // 다음 시험을 위해 책 읽기 체크를 되돌린다 (이미 쓴 기회는 그대로 0)
    await tab('today');
    await habit('책 읽기').click();
    await tab('battle');
    assert.equal(await tickets(), '0');
  });

  await step('[5단계] 상점 장비에 전투 능력치가 표시되고, 끼고 벗으면 내 능력치가 바뀐다', async () => {
    await tab('shop');
    const stats = (id) => item(id).locator('.item-stats').textContent();
    assert.equal(await stats('weapon1'), '공격 +4');
    assert.equal(await stats('head4'), '방어 +6 · 쿨타임 −20%');
    assert.equal(await stats('body3'), '방어 +9');
    assert.equal(await stats('accessory4'), '피버 +12%');
    assert.match(await item('head1').locator('.item-effect').textContent(), /경험치 \+2%/); // 경험치 효과도 그대로
    await page.waitForTimeout(300);
    await shot('25-상점-능력치');
    await item('weapon4').locator('[data-action="unequip"]').click();
    await tab('battle');
    assert.equal(await page.textContent('#bs-atk'), '36');
    await tab('shop');
    await item('weapon4').locator('[data-action="equip"]').click();
    await tab('battle');
    assert.equal(await page.textContent('#bs-atk'), '66');
  });

  await step('[7단계] 예전 데이터(전투 없음, 또는 쌓아 둔 기회가 있던 버전)로 열어도 그대로 열린다', async () => {
    const before = await hero();
    await seedMeta('battle', null);
    assert.deepEqual(await hero(), before);
    assert.equal(await page.locator('.habit').count(), 3);
    assert.equal(await wearing(), 'head4 body4 weapon4 accessory4');
    await tab('battle');
    assert.equal(await page.textContent('#stage-label'), '스테이지 1');
    // 쌓아 둔 기회 9번이 있던 버전: 스테이지는 이어지고, 기회는 오늘 기록으로 다시 센다
    await seedMeta('battle', { cleared: 5, tickets: 9, wins: 5, losses: 0 });
    await tab('battle');
    assert.equal(await page.textContent('#stage-label'), '스테이지 6');
    assert.equal(await tickets(), '0'); // 오늘 완료 2개 − 싸운 횟수 4
    await tab('today');
  });

  await step('앱 갱신: 새 버전이 올라오면 "새 버전" 안내가 뜨고, 누르면 새 파일로 바뀌며 데이터는 그대로다', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // 이미 설치된 상태로 다시 연 상황
    await page.waitForSelector('.habit');
    const before = await hero();
    assert.equal(await page.locator('#update-banner').isHidden(), true);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['habit-rpg-v5']);

    pretendNewVersion = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('#update-banner:not([hidden])');
    await shot('26-새-버전-안내');
    await page.locator('#update-banner').click();
    await page.waitForSelector('.habit');
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['habit-rpg-next']); // 예전 파일 묶음은 지워진다
    assert.equal(await page.locator('#update-banner').isHidden(), true);
    assert.deepEqual(await hero(), before);
    assert.equal(await page.locator('.habit').count(), 3);
  });

  await step('[4단계] 오프라인: 인터넷을 끊고 다시 열어도 앱이 뜨고, 체크와 저장이 된다', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForSelector('.habit');
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
    const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
    assert.equal(cached, 17); // 앱 파일 17개가 기기에 저장되어 있다

    await context.setOffline(true);
    server.close(); // 서버까지 꺼서 정말로 받아 올 곳이 없게 한다
    server.closeAllConnections();
    await page.reload();
    await page.waitForSelector('.habit');
    assert.equal(await page.textContent('#today-date'), '12월 6일 (일)');
    assert.equal(await wearing(), 'head4 body4 weapon4 accessory4');
    const before = await hero();
    await habit('책 읽기').click(); // +30 XP, 완벽한 하루 +20
    assert.equal((await hero()).xp, '65 / 330');
    await page.reload();
    await page.waitForSelector('.habit');
    assert.equal((await hero()).xp, '65 / 330');
    assert.equal(await habit('책 읽기').getAttribute('aria-pressed'), 'true');
    for (const name of ['shop', 'log', 'settings']) await tab(name); // 다른 화면도 열린다
    assert.match(await page.textContent('#offline-status'), /오프라인 준비 완료/);
    await shot('20-설정-오프라인');
    await tab('today');
    await habit('책 읽기').click(); // 원래대로
    assert.deepEqual(await hero(), before);
  });

  await step('시험용 시계(?debug): +1일을 누르면 다음 날로 넘어가 정산되고, 배너를 누르면 돌아온다', async () => {
    await setClock('2026-12-06T10:00:00');
    await page.goto(`${url}?debug`);
    await page.waitForSelector('#today-date:not(:empty)');
    await tab('settings');
    await page.locator('[data-action="debug-shift"][data-ms="86400000"]').click();
    assert.equal(await page.textContent('#today-date'), '12월 7일 (월)');
    assert.match(await reportText(), /12월 6일 \(일\) HP −5 2\/3 완료/);
    await dismissReport();
    assert.equal(await hp(), '45 / 50');
    // [7단계] 새 날의 전투 기회는 0에서 시작하고, 습관을 완료하면 생긴다
    await tab('battle');
    assert.equal(await tickets(), '0');
    assert.equal(await chanceDetail(), '오늘 습관을 하나 완료하면 전투 기회가 1번 생겨요.');
    await tab('today');
    await habit('물 마시기').click();
    assert.equal(await page.textContent('#battle-badge'), '1');
    await habit('물 마시기').click();
    assert.equal(await page.locator('#battle-badge').isHidden(), true);
    assert.equal(await page.locator('#debug-banner').isVisible(), true);
    await page.locator('#debug-banner').click();
    assert.equal(await page.textContent('#today-date'), '12월 6일 (일)');
    assert.equal(await page.locator('#debug-banner').isHidden(), true);
    assert.equal(await hp(), '45 / 50');
  });

  await step('외부 서버로 나가는 요청이 하나도 없다 (모든 요청이 앱 자신의 주소)', async () => {
    assert.deepEqual([...requested].filter((origin) => origin !== 'null'), [new URL(url).origin]);
  });

  await step('브라우저 콘솔 오류가 없다', async () => {
    assert.deepEqual(errors, []);
  });

  await browser.close();
  if (server.listening) server.close();
  console.log(results.join('\n'));
  console.log(process.exitCode ? '\n실패한 항목이 있습니다.' : `\n브라우저 시험 ${results.length}개 모두 통과`);
})();
