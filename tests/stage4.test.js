// 4단계 규칙 시험: 기록 화면 통계와 JSON 백업.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';
import { exportData, importData } from '../js/backup.js';

const NOV = (d, h = 9, min = 0) => new Date(2026, 10, d, h, min).getTime();

function setup() {
  const state = G.createState();
  G.processRollover(state, NOV(16, 8));
  const ids = [['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard']].map(([name, difficulty], i) =>
    G.addHabit(state, { name, difficulty, category: 'life' }, NOV(16, 8, i)).id);
  return { state, ids };
}

/** 16일 3/3, 17일 2/3, 18일 휴식(1/3), 19일 0/3, 20일(오늘) 1/3 */
function playWeek() {
  const { state, ids } = setup();
  const day = (d, done, rest = false) => {
    G.processRollover(state, NOV(d));
    if (rest) G.setRestDay(state, true, NOV(d));
    for (const id of ids.slice(0, done)) G.checkHabit(state, id, NOV(d));
  };
  day(16, 3);
  day(17, 2);
  day(18, 1, true);
  day(19, 0);
  day(20, 1);
  return { state, ids };
}

test('달력: 최근 30일의 완료 비율, 휴식일, 완벽한 하루, 깎인 HP', () => {
  const { state } = playWeek();
  const days = G.recentDays(state, '2026-11-20', 30);
  assert.equal(days.length, 30);
  assert.equal(days[0].day, '2026-10-22');
  assert.equal(days[29].day, '2026-11-20');
  const pick = (d) => days.find((x) => x.day === d);
  assert.deepEqual(pick('2026-11-16'), { day: '2026-11-16', done: 3, total: 3, ratio: 1, rest: false, perfect: true, hpLoss: 0 });
  assert.deepEqual(pick('2026-11-17'), { day: '2026-11-17', done: 2, total: 3, ratio: 2 / 3, rest: false, perfect: false, hpLoss: 5 });
  assert.deepEqual(pick('2026-11-18'), { day: '2026-11-18', done: 1, total: 3, ratio: 1 / 3, rest: true, perfect: false, hpLoss: 0 });
  assert.deepEqual(pick('2026-11-19'), { day: '2026-11-19', done: 0, total: 3, ratio: 0, rest: false, perfect: false, hpLoss: 15 });
  assert.deepEqual(pick('2026-11-20'), { day: '2026-11-20', done: 1, total: 3, ratio: 1 / 3, rest: false, perfect: false, hpLoss: 0 });
  assert.equal(pick('2026-11-15').ratio, null); // 앱을 쓰기 전: 기록 없음
});

test('달력: 지난 날의 비율은 나중에 습관을 지우거나 추가해도 달라지지 않는다', () => {
  const { state, ids } = playWeek();
  G.deleteHabit(state, ids[1], NOV(20));
  G.addHabit(state, { name: '스트레칭', difficulty: 'easy', category: 'exercise' }, NOV(20, 10));
  const days = G.recentDays(state, '2026-11-20', 5);
  assert.deepEqual(days.map((d) => `${d.done}/${d.total}`), ['3/3', '2/3', '1/3', '0/3', '1/3']);
  // 오늘은 현재 습관 기준: 물 마시기(완료), 책 읽기, 스트레칭
});

test('습관별 연속 일수와 최고 기록', () => {
  const { state, ids } = playWeek();
  const [water, walk, book] = ids.map((id) => state.habits[id]);
  // 물 마시기: 16, 17, 18(휴식일에도 함), 19 ✗, 20 ✓
  assert.equal(G.currentStreak(state, water, '2026-11-20'), 1);
  assert.equal(G.bestStreak(state, water, '2026-11-20'), 3);
  // 산책: 16, 17 ✓, 18 휴식일(안 끊김), 19 ✗
  assert.equal(G.currentStreak(state, walk, '2026-11-20'), 0);
  assert.equal(G.bestStreak(state, walk, '2026-11-20'), 2);
  // 책 읽기: 16일만
  assert.equal(G.bestStreak(state, book, '2026-11-20'), 1);
  // 오늘 아직 안 한 것은 연속 기록을 끊지 않는다
  G.processRollover(state, NOV(21));
  assert.equal(G.currentStreak(state, water, '2026-11-21'), 1);
});

test('총 획득 경험치, 완료 횟수, 완벽한 하루 수', () => {
  const { state } = playWeek();
  // 16일 5+10+20+20, 17일 6+11, 18일 6, 20일 5(19일에 끊겨서 기본값)
  assert.deepEqual(G.totals(state), { totalXp: 83, completions: 7, perfectDays: 1 });
});

test('총 획득 경험치는 HP가 0이 되어 경험치를 잃어도 줄지 않는다', () => {
  const { state } = playWeek();
  state.player.hp = 5;
  const before = state.player.xp;
  G.processRollover(state, NOV(21)); // 20일 2개 못 함 → HP 0 이하
  assert.ok(state.player.xp < before);
  assert.equal(G.totals(state).totalXp, 83);
});

test('백업: 내보낸 파일을 가져오면 똑같은 상태가 된다', () => {
  const { state } = playWeek();
  state.player.gold = 300;
  G.buyItem(state, 'head1');
  G.buyItem(state, 'weapon1');
  G.equipItem(state, 'weapon', null);
  G.setDayStartHour(state, 5);

  const text = JSON.stringify(exportData(state, NOV(20, 12)));
  const restored = importData(text);
  for (const key of ['player', 'gear', 'battle', 'habits', 'completions', 'days']) {
    assert.deepEqual(restored[key], state[key], key);
  }
  assert.equal(restored.settings.dayStartHour, 5);
  assert.equal(restored.progress.lastDay, '2026-11-20');
  // 가져온 상태로 계속 진행해도 계산이 이어진다
  assert.equal(G.checkHabit(restored, Object.keys(restored.habits)[1], NOV(20, 13)).ok, true);
  assert.deepEqual(G.recentDays(restored, '2026-11-20', 5).map((d) => d.done), [3, 2, 1, 0, 2]);
});

test('백업: 파일에는 앱 이름·버전·내보낸 시각이 들어가고, 시험용 시계 값은 빠진다', () => {
  const { state } = playWeek();
  G.setDebugOffset(state, 86400000);
  const data = exportData(state, NOV(20, 12));
  assert.equal(data.app, 'habit-rpg');
  assert.equal(data.version, 2);
  assert.equal(data.exportedAt, new Date(NOV(20, 12)).toISOString());
  assert.deepEqual(data.settings, { dayStartHour: 4 });
  assert.equal(importData(JSON.stringify(data)).settings.debugOffsetMs, 0);
});

test('백업: 잘못된 파일은 거부하고 이유를 알려 준다', () => {
  const { state } = playWeek();
  const good = () => JSON.parse(JSON.stringify(exportData(state, NOV(20, 12))));
  const broken = (change) => {
    const data = good();
    change(data);
    return JSON.stringify(data);
  };
  assert.throws(() => importData('안녕하세요'), /JSON 형식/);
  assert.throws(() => importData('{"hello":1}'), /이 앱에서 내보낸 백업 파일이 아니에요/);
  assert.throws(() => importData('[1,2,3]'), /이 앱에서 내보낸/);
  assert.throws(() => importData(broken((d) => (d.version = 3))), /더 새로운 버전/);
  assert.throws(() => importData(broken((d) => (d.player.level = 0))), /캐릭터/);
  assert.throws(() => importData(broken((d) => (d.player.hp = 999))), /캐릭터/);
  assert.throws(() => importData(broken((d) => (d.player.xp = '많이'))), /캐릭터/);
  assert.throws(() => importData(broken((d) => (d.settings.dayStartHour = 30))), /설정/);
  assert.throws(() => importData(broken((d) => delete d.habits)), /habits/);
  assert.throws(() => importData(broken((d) => (d.habits[0].difficulty = 'impossible'))), /습관 1번/);
  assert.throws(() => importData(broken((d) => (d.habits[1].name = ''))), /습관 2번 이름/);
  assert.throws(() => importData(broken((d) => (d.habits[0].schedule[0].days = [9]))), /반복 요일/);
  assert.throws(() => importData(broken((d) => (d.habits[1].id = d.habits[0].id))), /중복/);
  assert.throws(() => importData(broken((d) => (d.completions[0].xp = -5))), /완료 기록 1번/);
  assert.throws(() => importData(broken((d) => (d.completions[0].day = '어제'))), /완료 기록 1번/);
  assert.throws(() => importData(broken((d) => (d.days[0].day = '2026-13-45'))), /날짜 기록 1번/);
  assert.throws(() => importData(broken((d) => d.gear.owned.push('laser9'))), /장비/);
  assert.throws(() => importData(broken((d) => (d.gear.equipped.head = 'head4'))), /낀 장비/); // 갖지 않은 장비
  assert.equal(typeof importData(JSON.stringify(good())), 'object'); // 손대지 않은 파일은 통과
});

test('백업: 화면에 그대로 들어가는 값(id, 분야)에 HTML이 섞인 파일은 거부한다', () => {
  const { state } = playWeek();
  const base = JSON.parse(JSON.stringify(exportData(state, NOV(20, 12))));
  const evil = '"><img src=x onerror=alert(1)>';
  for (const change of [
    (d) => (d.habits[0].id = evil),
    (d) => (d.habits[0].category = evil),
    (d) => (d.completions[0].habitId = evil),
    (d) => d.gear.owned.push(evil),
  ]) {
    const data = structuredClone(base);
    change(data);
    assert.throws(() => importData(JSON.stringify(data)), /백업 파일을 읽을 수 없어요/);
  }
  // 이름은 화면에 그릴 때 글자 그대로 표시하므로 특수문자가 있어도 된다
  const data = structuredClone(base);
  data.habits[0].name = '<b>물</b> & "차"';
  assert.equal(Object.values(importData(JSON.stringify(data)).habits)[0].name, '<b>물</b> & "차"');
});

test('백업을 오래 뒤에 가져오면 그 사이 기간은 3일치만 벌칙을 받는다', () => {
  const { state } = playWeek();
  const restored = importData(JSON.stringify(exportData(state, NOV(20, 12))));
  const hp = restored.player.hp;
  const report = G.processRollover(restored, new Date(2026, 11, 20, 9).getTime()); // 한 달 뒤
  assert.equal(report.days.length, 3);
  assert.equal(report.forgiven, 27);
  // HP 34에서 20일 −10 → 24, 21일 −15 → 9, 22일 −15 → 0 이하라 쓰러지고 25로 되살아난다
  assert.deepEqual(report.days.map((d) => [d.hpLoss, d.knockedOut]), [[10, false], [15, false], [15, true]]);
  assert.equal(hp, 34);
  assert.equal(restored.player.hp, 25);
});
