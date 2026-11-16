// 2단계 규칙 시험: HP 벌칙, 휴식일, 앱을 열 때의 지난 날짜 정산.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';

const at = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOV = (d, h = 9, min = 0) => at(2026, 11, d, h, min); // 2026-11-16 은 월요일. NOV(31) 은 12월 1일.

/** 16일(월) 아침에 처음 앱을 열고 습관을 만든 상태 */
function setup(...habits) {
  const state = G.createState();
  G.processRollover(state, NOV(16, 8));
  const ids = habits.map(([name, difficulty, days], i) =>
    G.addHabit(state, { name, difficulty, category: 'life', days }, NOV(16, 8, i)).id);
  return { state, ids };
}
const FIVE = ['물 마시기', '산책', '책 읽기', '스트레칭', '정리'].map((n) => [n, 'easy']);
const open = (state, ms) => G.processRollover(state, ms);

test('처음 열 때와 같은 날 다시 열 때는 벌칙이 없다', () => {
  const { state } = setup(...FIVE);
  assert.equal(state.progress.lastDay, '2026-11-16');
  assert.equal(open(state, NOV(16, 23)), null);
  assert.equal(open(state, NOV(17, 3, 59)), null); // 새벽 3:59는 아직 16일
  assert.equal(state.player.hp, 50);
});

test('못 한 습관 하나당 HP −5, 하루 최대 −15', () => {
  for (const [doneCount, expectedLoss] of [[5, 0], [4, 5], [3, 10], [2, 15], [1, 15], [0, 15]]) {
    const { state, ids } = setup(...FIVE);
    state.player.hp = 40; // 완료 회복(+2)이 최대치에 막히지 않게 낮춰 둔다
    for (const id of ids.slice(0, doneCount)) G.checkHabit(state, id, NOV(16));
    const hpEndOfDay = state.player.hp;
    const report = open(state, NOV(17, 4, 0));
    assert.equal(hpEndOfDay - state.player.hp, expectedLoss, `${doneCount}/5 완료`);
    if (expectedLoss) assert.equal(report.days[0].hpLoss, expectedLoss);
    else assert.equal(report, null); // 다 지킨 날은 요약 창도 뜨지 않는다
    assert.equal(open(state, NOV(17, 12)), null); // 같은 날 다시 열어도 두 번 깎이지 않는다
    assert.equal(hpEndOfDay - state.player.hp, expectedLoss);
  }
});

test('완료할 때마다 HP +2 (최대 50), 취소하면 되돌아간다', () => {
  const { state, ids } = setup(...FIVE);
  state.player.hp = 45;
  G.checkHabit(state, ids[0], NOV(16));
  assert.equal(state.player.hp, 47);
  G.checkHabit(state, ids[1], NOV(16));
  G.checkHabit(state, ids[2], NOV(16));
  assert.equal(state.player.hp, 50); // 49 + 2 는 50에서 멈춘다
  G.uncheckHabit(state, ids[2], NOV(16));
  assert.equal(state.player.hp, 49); // 실제로 올랐던 1만 되돌린다
  G.uncheckHabit(state, ids[0], NOV(16));
  assert.equal(state.player.hp, 47);
});

test('레벨 업하면 HP가 가득 차고, 그 체크를 취소하면 HP도 되돌아간다', () => {
  const { state, ids } = setup(['책 읽기', 'hard'], ['물 마시기', 'easy']);
  Object.assign(state.player, { xp: 40, totalXp: 40, hp: 12 });
  G.checkHabit(state, ids[0], NOV(16)); // 40 + 20 → Lv2
  assert.equal(state.player.level, 2);
  assert.equal(state.player.hp, 50);
  G.uncheckHabit(state, ids[0], NOV(16));
  assert.deepEqual(state.player, { level: 1, xp: 40, totalXp: 40, gold: 0, hp: 12 });
});

test('HP가 0이 되면 현재 레벨 경험치의 10%만 잃고, 레벨은 그대로, HP 25로 되살아난다', () => {
  const { state } = setup(...FIVE);
  Object.assign(state.player, { level: 3, xp: 47, totalXp: 167, hp: 10 });
  const report = open(state, NOV(17)); // 5개 모두 못 함 → −15 → HP 0 이하
  assert.equal(state.player.level, 3);
  assert.equal(state.player.xp, 43); // 47의 10% = 4.7 → 4 잃음(소수점 버림)
  assert.equal(state.player.hp, 25);
  assert.equal(state.player.totalXp, 167); // 총 획득 경험치는 줄지 않는다
  assert.deepEqual(report.days[0], {
    day: '2026-11-16', done: 0, total: 5, rest: false, hpLoss: 15, knockedOut: true, xpLost: 4,
  });
  assert.equal(report.xpLost, 4);
});

test('경험치가 0일 때 HP가 0이 되어도 레벨은 내려가지 않는다', () => {
  const { state } = setup(...FIVE);
  Object.assign(state.player, { level: 4, xp: 0, hp: 5 });
  open(state, NOV(17));
  assert.deepEqual([state.player.level, state.player.xp, state.player.hp], [4, 0, 25]);
});

test('HP가 정확히 0이 되는 경우도 쓰러진 것으로 본다', () => {
  const { state } = setup(...FIVE);
  Object.assign(state.player, { xp: 30, hp: 15 });
  open(state, NOV(17));
  assert.deepEqual([state.player.xp, state.player.hp], [27, 25]);
});

test('오래 자리를 비워도 벌칙은 3일치까지만: HP 50 → 5', () => {
  const { state } = setup(...FIVE);
  const report = open(state, NOV(26)); // 16~25일, 끝난 날 10일
  assert.equal(state.player.hp, 5);
  assert.deepEqual(report.days.map((e) => [e.day, e.hpLoss]), [
    ['2026-11-16', 15], ['2026-11-17', 15], ['2026-11-18', 15],
  ]);
  assert.equal(report.forgiven, 7);
  assert.equal(report.hpBefore, 50);
  assert.equal(report.hpAfter, 5);
  assert.equal(state.progress.lastDay, '2026-11-26');
  // 넘어간 날도 달력용 기록은 남는다
  assert.deepEqual(
    [state.days['2026-11-25'].total, state.days['2026-11-25'].done, state.days['2026-11-25'].hpLoss],
    [5, 0, 0],
  );
});

test('하루씩 매일 열면 날마다 따로 정산된다', () => {
  const { state, ids } = setup(...FIVE);
  for (const id of ids.slice(0, 4)) G.checkHabit(state, id, NOV(16)); // 1개 못 함
  assert.equal(open(state, NOV(17)).days[0].hpLoss, 5);
  assert.equal(state.player.hp, 45);
  for (const id of ids) G.checkHabit(state, id, NOV(17)); // 전부 완료: +2 × 5 → 50에서 멈춤
  assert.equal(open(state, NOV(18)), null);
  assert.equal(state.player.hp, 50);
  assert.equal(open(state, NOV(19)).days[0].hpLoss, 15); // 18일은 아무것도 안 함
  assert.equal(state.player.hp, 35);
});

test('반복 요일이 아닌 습관과 그날 이후에 만든 습관은 못 한 것으로 세지 않는다', () => {
  const { state } = setup(['물 마시기', 'easy'], ['주말 등산', 'hard', [0, 6]]);
  open(state, NOV(17)); // 월요일 정산: 물 마시기만 대상 → −5
  assert.equal(state.player.hp, 45);
  G.addHabit(state, { name: '산책', difficulty: 'normal', category: 'exercise' }, NOV(20)); // 금요일에 추가
  const report = open(state, NOV(20, 10));
  // 17·18·19일은 물 마시기 하나씩만 못 한 것으로 계산된다
  assert.deepEqual(report.days.map((e) => [e.total, e.hpLoss]), [[1, 5], [1, 5], [1, 5]]);
  assert.equal(state.player.hp, 30);
});

test('휴식일: 그날은 벌칙이 없다', () => {
  const { state, ids } = setup(...FIVE);
  assert.equal(G.penaltyPreview(state, '2026-11-16').hpLoss, 15);
  assert.equal(G.setRestDay(state, true, NOV(16)).ok, true);
  assert.equal(G.penaltyPreview(state, '2026-11-16').hpLoss, 0);
  G.checkHabit(state, ids[0], NOV(16)); // 휴식일에도 체크하면 보상은 받는다
  assert.equal(state.player.totalXp, 5);
  const report = open(state, NOV(17));
  assert.equal(state.player.hp, 50);
  assert.deepEqual(report.days[0], {
    day: '2026-11-16', done: 1, total: 5, rest: true, hpLoss: 0, knockedOut: false, xpLost: 0,
  });
});

test('휴식일은 일주일(월~일)에 한 번, 다음 주 월요일에 다시 쓸 수 있다', () => {
  const { state } = setup(...FIVE);
  assert.equal(G.setRestDay(state, true, NOV(17)).ok, true); // 화요일
  assert.deepEqual(G.setRestDay(state, true, NOV(17)), { ok: false, reason: 'already-on', day: '2026-11-17' });
  for (const d of [18, 19, 20, 21, 22]) { // 수~일
    assert.deepEqual(G.setRestDay(state, true, NOV(d)), { ok: false, reason: 'used-this-week', day: '2026-11-17' });
  }
  assert.equal(G.restDayOfWeek(state, '2026-11-22'), '2026-11-17');
  assert.equal(G.restDayOfWeek(state, '2026-11-23'), null);
  assert.equal(G.setRestDay(state, true, NOV(23)).ok, true); // 다음 주 월요일
});

test('휴식일은 그날 안에 취소할 수 있고, 취소하면 이번 주에 다시 쓸 수 있다', () => {
  const { state } = setup(...FIVE);
  G.setRestDay(state, true, NOV(16));
  assert.equal(G.setRestDay(state, false, NOV(16, 20)).ok, true);
  assert.equal(G.penaltyPreview(state, '2026-11-16').hpLoss, 15);
  assert.equal(G.setRestDay(state, false, NOV(16, 21)).ok, false);
  assert.equal(G.setRestDay(state, true, NOV(18)).ok, true);
  // 지난 날의 휴식일은 취소할 수 없다 (취소는 '오늘'에만 적용된다)
  assert.equal(G.setRestDay(state, false, NOV(19)).ok, false);
  assert.equal(state.days['2026-11-18'].rest, true);
});

test('휴식일에 못 한 습관은 연속 기록을 끊지 않는다', () => {
  const { state, ids } = setup(['산책', 'normal'], ['물 마시기', 'easy']);
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[0], NOV(17));
  G.setRestDay(state, true, NOV(18)); // 18일은 쉬고 아무것도 안 함
  const r = G.checkHabit(state, ids[0], NOV(19));
  assert.equal(r.streak, 3); // 16, 17, 19
  assert.equal(r.xp, 12);
});

test('긴 공백 중간에 낀 휴식일도 반영된다', () => {
  const { state } = setup(...FIVE);
  G.setRestDay(state, true, NOV(16));
  const report = open(state, NOV(30));
  assert.deepEqual(report.days.map((e) => e.hpLoss), [0, 15, 15]); // 16일은 휴식, 17·18일만 벌칙
  assert.equal(state.player.hp, 20);
  assert.equal(report.forgiven, 11);
});

test('예정된 습관이 없는 날은 벌칙도 요약 창도 없다', () => {
  const state = G.createState();
  open(state, NOV(16));
  assert.equal(open(state, NOV(18)), null);
  assert.equal(state.player.hp, 50);
  assert.equal(state.progress.report, null);
});

test('요약은 확인할 때까지 남아 있다', () => {
  const { state } = setup(...FIVE);
  open(state, NOV(17));
  assert.equal(state.progress.report.days.length, 1);
  G.dismissReport(state);
  assert.equal(state.progress.report, null);
});

test('시계가 뒤로 가도 같은 날을 두 번 정산하지 않는다', () => {
  const { state } = setup(...FIVE);
  open(state, NOV(18)); // 16·17일 정산 → 20
  assert.equal(state.player.hp, 20);
  assert.equal(open(state, NOV(17)), null); // 시계가 하루 뒤로
  assert.equal(open(state, NOV(18)), null);
  assert.equal(state.player.hp, 20);
});

test('한 달 흐름: 평소에는 지키고 가끔 빼먹어도 HP가 버틴다', () => {
  const { state, ids } = setup(...FIVE);
  let knockouts = 0;
  for (let i = 0; i < 30; i++) {
    const report = open(state, NOV(16 + i));
    knockouts += report?.days.filter((e) => e.knockedOut).length ?? 0;
    const doneToday = i % 3 === 2 ? 3 : 5; // 사흘에 한 번은 2개를 빼먹는다 (−10)
    for (const id of ids.slice(0, doneToday)) G.checkHabit(state, id, NOV(16 + i));
  }
  assert.equal(knockouts, 0);
  assert.ok(state.player.hp >= 40, `HP ${state.player.hp}`);
});
