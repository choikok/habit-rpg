// 7단계 규칙 시험: 하루 일과(시간대)와 시간대별 순서·추천.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';
import { SUGGESTIONS } from '../js/suggestions.js';
import { exportData, importData } from '../js/backup.js';

const at = (d, h, min = 0) => new Date(2026, 10, d, h, min).getTime(); // 11/16 월 … 11/21 토, 11/22 일
const MON = (h, min) => at(16, h, min);
const time = (state, ms) => G.currentTime(state, ms).time;

function setup() {
  const state = G.createState();
  G.processRollover(state, MON(5));
  let n = 0; // 추가한 순서가 그대로 목록 순서가 되도록 1밀리초씩 띄운다
  const add = (name, when, days) => G.addHabit(state, { name, difficulty: 'easy', category: 'life', when, days }, MON(5) + ++n).id;
  return { state, add };
}
const names = (state, list) => list.map((h) => h.name);

test('기본 일과: 평일 08:30–17:30 업무, 22시부터 자기 전 (말씀하신 업무 시간)', () => {
  const s = G.createState().settings;
  assert.deepEqual([s.workStart, s.workEnd, s.nightStart, s.workDays], [510, 1050, 1320, [1, 2, 3, 4, 5]]);
});

test('평일 시간대 경계', () => {
  const { state } = setup();
  const cases = [
    [MON(4, 0), 'morning'], [MON(8, 29), 'morning'], [MON(8, 30), 'work'], [MON(12, 0), 'work'],
    [MON(17, 29), 'work'], [MON(17, 30), 'evening'], [MON(21, 59), 'evening'], [MON(22, 0), 'night'],
    [at(17, 1, 0), 'night'], [at(17, 3, 59), 'night'], // 다음 날 새벽 3:59까지는 아직 월요일 밤
  ];
  for (const [ms, expected] of cases) assert.equal(time(state, ms), expected, new Date(ms).toString());
  assert.equal(G.currentTime(state, at(17, 3, 59)).day, '2026-11-16');
});

test('쉬는 날(토·일)에는 업무 시간이 없고, 정오까지 아침 · 17:30까지 낮', () => {
  const { state } = setup();
  assert.deepEqual([9, 12, 17, 18, 23].map((h) => time(state, at(21, h))), ['morning', 'day', 'day', 'evening', 'night']);
  assert.equal(G.currentTime(state, at(21, 9)).workDay, false);
  assert.equal(G.currentTime(state, at(20, 9)).workDay, true); // 금요일
});

test('오늘 화면 순서: 지금 시간대 → 지나간 시간대(아직 안 함) → 이따가 → 완료', () => {
  const { state, add } = setup();
  const ids = {
    stretch: add('스트레칭', 'morning'),
    water: add('물 마시기', 'work'),
    any: add('채소 먹기', 'any'),
    walk: add('산책', 'evening'),
    phone: add('휴대폰 끄기', 'night'),
    focus: add('집중 시간', 'work'),
  };
  // 월요일 10시(업무 시간)
  let g = G.todayGroups(state, MON(10)).groups;
  assert.deepEqual(names(state, g.now), ['물 마시기', '집중 시간', '채소 먹기']); // 업무 습관이 맨 위, '언제나'는 그 아래
  assert.deepEqual(names(state, g.missed), ['스트레칭']);
  assert.deepEqual(names(state, g.later), ['산책', '휴대폰 끄기']);
  assert.deepEqual(g.done, []);
  // 하나 완료하면 '완료'로 내려간다
  G.checkHabit(state, ids.water, MON(10));
  g = G.todayGroups(state, MON(10, 5)).groups;
  assert.deepEqual(names(state, g.now), ['집중 시간', '채소 먹기']);
  assert.deepEqual(names(state, g.done), ['물 마시기']);
  // 아침 7시: 아침 습관이 먼저, 나머지는 이따가 (시간 순서대로)
  g = G.todayGroups(state, MON(7)).groups;
  assert.deepEqual(names(state, g.now), ['스트레칭', '채소 먹기']);
  assert.deepEqual(names(state, g.missed), []);
  assert.deepEqual(names(state, g.later), ['집중 시간', '산책', '휴대폰 끄기']);
  // 저녁 8시: 저녁 → 지나간 아침·업무
  g = G.todayGroups(state, MON(20)).groups;
  assert.deepEqual(names(state, g.now), ['산책', '채소 먹기']);
  assert.deepEqual(names(state, g.missed), ['스트레칭', '집중 시간']);
  assert.deepEqual(names(state, g.later), ['휴대폰 끄기']);
  // 자정이 지나도(하루 기준 시각 4시 전) 같은 날의 '자기 전'
  g = G.todayGroups(state, at(17, 1)).groups;
  assert.deepEqual(names(state, g.now), ['휴대폰 끄기', '채소 먹기']);
});

test('쉬는 날에는 업무 시간 습관이 밀리지 않고 지금에 함께 보인다', () => {
  const { state, add } = setup();
  add('스트레칭', 'morning');
  add('물 마시기', 'work');
  add('산책', 'evening');
  G.processRollover(state, at(21, 5));
  let g = G.todayGroups(state, at(21, 14)).groups; // 토요일 낮
  assert.deepEqual(names(state, g.now), ['물 마시기']);
  assert.deepEqual(names(state, g.missed), ['스트레칭']);
  assert.deepEqual(names(state, g.later), ['산책']);
  g = G.todayGroups(state, at(21, 9)).groups; // 토요일 아침
  assert.deepEqual(names(state, g.now), ['스트레칭', '물 마시기']);
});

test('오늘 예정이 아닌 습관은 어느 묶음에도 나오지 않는다', () => {
  const { state, add } = setup();
  add('주말 등산', 'morning', [0, 6]);
  add('물 마시기', 'work');
  const g = G.todayGroups(state, MON(10)).groups;
  assert.deepEqual(Object.values(g).flat().map((h) => h.name), ['물 마시기']);
});

test('시간대를 정하지 않은 예전 습관: 추천에서 왔으면 추천의 시간대, 아니면 언제나', () => {
  const { state } = setup();
  const [water] = G.addSuggested(state, ['water'], 'easy', MON(5));
  delete water.when; // 시간대 기능이 생기기 전에 만든 습관을 흉내 낸다
  const plain = G.addHabit(state, { name: '영양제 먹기', difficulty: 'easy', category: 'life' }, MON(5, 1));
  delete plain.when;
  assert.equal(G.habitWhen(water), 'work');
  assert.equal(G.habitWhen(plain), 'any');
  assert.deepEqual(names(state, G.todayGroups(state, MON(7)).groups.later), ['물 300ml 마시기']);
});

test('추천에는 모두 하기 좋은 시간대가 있고, 업무 시간에 할 수 있는 추천이 6개 있다', () => {
  for (const s of Object.values(SUGGESTIONS)) assert.ok(Object.hasOwn(G.TIMES, s.when), s.id);
  assert.deepEqual(G.suggestionsFor('work').map((s) => s.title).sort(),
    ['계단 오르기', '메일 정리', '물 마시기', '일어나 몸 풀기', '집중 시간', '하루 돌아보기'].sort());
  for (const t of G.TIME_ORDER) assert.ok(G.suggestionsFor(t).length >= 4, t);
  // 추천을 담으면 시간대도 함께 들어간다
  const { state } = setup();
  const [walk, focus] = G.addSuggested(state, ['walk', 'focus'], 'easy', MON(5));
  assert.deepEqual([walk.when, focus.when], ['evening', 'work']);
});

test('습관의 시간대 입력과 수정', () => {
  const { state } = setup();
  const h = G.addHabit(state, { name: '물 마시기', difficulty: 'easy', category: 'life', when: 'work' }, MON(6));
  assert.equal(h.when, 'work');
  G.updateHabit(state, h.id, { name: '물 마시기', difficulty: 'easy', category: 'life', when: 'evening' }, MON(6, 5));
  assert.equal(h.when, 'evening');
  assert.equal(G.addHabit(state, { name: '산책', difficulty: 'easy', category: 'life' }, MON(6, 6)).when, 'any'); // 기본값
  assert.throws(() => G.addHabit(state, { name: 'x', difficulty: 'easy', category: 'life', when: 'lunch' }, MON(6)), /언제/);
});

test('하루 일과 바꾸기: 다른 업무 시간·요일, 잘못된 순서는 거부', () => {
  const { state } = setup();
  G.setRoutine(state, { workStart: 9 * 60, workEnd: 18 * 60, nightStart: 23 * 60, workDays: [1, 2, 3, 4, 5, 6] });
  assert.equal(time(state, MON(8, 45)), 'morning');
  assert.equal(time(state, MON(17, 45)), 'work');
  assert.equal(time(state, MON(22, 30)), 'evening');
  assert.equal(time(state, at(21, 10)), 'work'); // 토요일도 업무일로
  assert.throws(() => G.setRoutine(state, { workStart: 18 * 60, workEnd: 9 * 60, nightStart: 1380, workDays: [1] }), /업무 끝/);
  assert.throws(() => G.setRoutine(state, { workStart: 540, workEnd: 1080, nightStart: 1020, workDays: [1] }), /자기 전/);
  assert.throws(() => G.setRoutine(state, { workStart: -1, workEnd: 1080, nightStart: 1380, workDays: [1] }), /시각/);
  // 업무 요일을 모두 끄면 매일이 쉬는 날
  G.setRoutine(state, { workStart: 540, workEnd: 1080, nightStart: 1380, workDays: [] });
  assert.equal(time(state, MON(10)), 'morning');
  assert.equal(time(state, MON(13)), 'day');
});

test('밤 근무처럼 자정을 넘는 일과도 하루 기준 시각부터 순서대로면 된다', () => {
  const { state } = setup();
  G.setDayStartHour(state, 10);
  G.setRoutine(state, { workStart: 22 * 60, workEnd: 6 * 60, nightStart: 7 * 60, workDays: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(time(state, MON(23)), 'work');
  assert.equal(time(state, at(17, 6, 30)), 'evening');
  assert.equal(time(state, at(17, 8)), 'night');
  assert.equal(time(state, MON(15)), 'morning');
});

test('백업: 하루 일과와 습관 시간대가 저장되고, 예전 백업은 기본 일과로 가져온다', () => {
  const { state } = setup();
  G.addSuggested(state, ['water', 'walk'], 'easy', MON(6));
  G.setRoutine(state, { workStart: 540, workEnd: 1080, nightStart: 1380, workDays: [1, 3, 5] });
  const data = JSON.parse(JSON.stringify(exportData(state, MON(12))));
  const restored = importData(JSON.stringify(data));
  assert.deepEqual(
    ['workStart', 'workEnd', 'nightStart', 'workDays'].map((k) => restored.settings[k]),
    [540, 1080, 1380, [1, 3, 5]],
  );
  assert.deepEqual(Object.values(restored.habits).map((h) => h.when), ['work', 'evening']);
  assert.equal(restored.dirty.size, 0);

  const old = structuredClone(data);
  for (const k of ['workStart', 'workEnd', 'nightStart', 'workDays']) delete old.settings[k];
  for (const h of old.habits) delete h.when;
  const r2 = importData(JSON.stringify(old));
  assert.deepEqual([r2.settings.workStart, r2.settings.workEnd, r2.settings.workDays], [510, 1050, [1, 2, 3, 4, 5]]);
  assert.equal(G.habitWhen(Object.values(r2.habits)[0]), 'work'); // 추천에서 온 습관은 추천의 시간대

  for (const change of [
    (d) => (d.settings.workEnd = 100),
    (d) => (d.settings.workDays = ['월']),
    (d) => (d.habits[0].when = '<b>'),
  ]) {
    const bad = structuredClone(data);
    change(bad);
    assert.throws(() => importData(JSON.stringify(bad)), /설정|시간대/);
  }
});
