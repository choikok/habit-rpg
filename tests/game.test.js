// 1단계 규칙 시험: 날짜를 바꿔 가며 보상 계산이 기획서 숫자대로 나오는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';

const at = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOV = (d, h = 9, min = 0) => at(2026, 11, d, h, min); // 2026-11-16 은 월요일

function setup(...habits) {
  const state = G.createState();
  const ids = habits.map(([name, difficulty, days], i) =>
    G.addHabit(state, { name, difficulty, category: 'life', days }, NOV(16, 8, i)).id);
  return { state, ids };
}

test('필요 경험치: 30 + 20 × 레벨', () => {
  assert.equal(G.xpNeeded(1), 50);
  assert.equal(G.xpNeeded(9), 210);
  const total = (to) => Array.from({ length: to - 1 }, (_, i) => G.xpNeeded(i + 1)).reduce((a, b) => a + b, 0);
  assert.equal(total(10), 1170); // 하루 50 기준 23.4일
  assert.equal(total(20), 4370); // 하루 50 기준 87.4일
});

test('하루 기준 시각: 새벽 3:59는 전날, 4:00부터 새 날', () => {
  assert.equal(G.dayKey(NOV(17, 3, 59), 4), '2026-11-16');
  assert.equal(G.dayKey(NOV(17, 4, 0), 4), '2026-11-17');
  assert.equal(G.dayKey(NOV(17, 0, 0), 0), '2026-11-17');
  assert.equal(G.dayKey(NOV(16, 23, 59), 0), '2026-11-16');
  assert.equal(G.dayKey(at(2027, 1, 1, 2, 0), 4), '2026-12-31'); // 해가 바뀌는 날
});

test('기본 보상: 쉬움 5/2, 보통 10/4, 어려움 20/8', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard'], ['일기 쓰기', 'easy']);
  const rewards = ids.slice(0, 3).map((id) => G.checkHabit(state, id, NOV(16)));
  assert.deepEqual(rewards.map((r) => [r.xp, r.gold]), [[5, 2], [10, 4], [20, 8]]);
  assert.deepEqual(state.player, { level: 1, xp: 35, totalXp: 35, gold: 14, hp: 50 });
  assert.equal(rewards[2].perfect, null); // 아직 하나 남았으므로 완벽한 하루가 아니다
});

test('같은 날 두 번 체크할 수 없다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal']);
  assert.equal(G.checkHabit(state, ids[0], NOV(16)).ok, true);
  assert.equal(G.checkHabit(state, ids[0], NOV(16, 22)).ok, false);
  assert.equal(G.checkHabit(state, ids[0], NOV(17, 3, 59)).ok, false); // 새벽 3:59는 아직 같은 날
  assert.equal(state.player.totalXp, 5);
});

test('연속 보너스: 하루마다 +10%, 최대 +50%', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard'], ['안 하는 습관', 'easy']);
  const got = { easy: [], normal: [], hard: [] };
  for (let d = 16; d <= 23; d++) {
    got.easy.push(G.checkHabit(state, ids[0], NOV(d)).xp);
    got.normal.push(G.checkHabit(state, ids[1], NOV(d)).xp);
    got.hard.push(G.checkHabit(state, ids[2], NOV(d)).xp);
  }
  // 1일째 +0%, 2일째 +10% … 6일째부터 +50%. 소수점은 반올림.
  assert.deepEqual(got.normal, [10, 11, 12, 13, 14, 15, 15, 15]);
  assert.deepEqual(got.hard, [20, 22, 24, 26, 28, 30, 30, 30]);
  assert.deepEqual(got.easy, [5, 6, 6, 7, 7, 8, 8, 8]);
  assert.equal(state.player.gold, 8 * (2 + 4 + 8)); // 골드에는 연속 보너스가 붙지 않는다
});

test('하루를 빼먹으면 연속 기록이 처음으로 돌아간다', () => {
  const { state, ids } = setup(['산책', 'normal'], ['다른 습관', 'easy']);
  assert.equal(G.checkHabit(state, ids[0], NOV(16)).xp, 10);
  assert.equal(G.checkHabit(state, ids[0], NOV(17)).xp, 11);
  assert.equal(G.checkHabit(state, ids[0], NOV(18)).xp, 12);
  // 19일은 건너뜀
  const r = G.checkHabit(state, ids[0], NOV(20));
  assert.equal(r.xp, 10);
  assert.equal(r.streak, 1);
  assert.equal(G.checkHabit(state, ids[0], NOV(21)).xp, 11);
});

test('반복 요일이 아닌 날은 연속 기록을 끊지 않는다', () => {
  const { state, ids } = setup(['산책', 'normal', [1, 3, 5]], ['다른 습관', 'easy']); // 월·수·금
  assert.equal(G.checkHabit(state, ids[0], NOV(16)).xp, 10); // 월
  assert.equal(G.checkHabit(state, ids[0], NOV(17)).ok, false); // 화요일에는 목록에 없다
  assert.equal(G.checkHabit(state, ids[0], NOV(18)).xp, 11); // 수
  assert.equal(G.checkHabit(state, ids[0], NOV(20)).xp, 12); // 금
  assert.equal(G.checkHabit(state, ids[0], NOV(23)).xp, 13); // 다음 주 월
  // 수요일을 빼먹고 금요일에 하면 끊긴다
  assert.equal(G.checkHabit(state, ids[0], NOV(27)).xp, 10);
});

test('반복 요일을 바꿔도 지난 연속 기록은 그대로다', () => {
  const { state, ids } = setup(['산책', 'normal', [1, 3, 5]], ['다른 습관', 'easy']);
  G.checkHabit(state, ids[0], NOV(16)); // 월
  G.checkHabit(state, ids[0], NOV(18)); // 수
  // 수요일에 '매일'로 바꾼다. 어제(화요일)는 예정일이 아니었으므로 빼먹은 날이 아니다.
  G.updateHabit(state, ids[0], { name: '산책', difficulty: 'normal', category: 'life', days: G.ALL_DAYS }, NOV(18, 10));
  const r = G.checkHabit(state, ids[0], NOV(19)); // 목요일: 이제 예정일
  assert.equal(r.streak, 3);
  assert.equal(r.xp, 12);
});

test('완벽한 하루: 그날 습관을 전부 끝내면 +20 XP, +10 G', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard']);
  assert.equal(G.checkHabit(state, ids[0], NOV(16)).perfect, null);
  assert.equal(G.checkHabit(state, ids[1], NOV(16)).perfect, null);
  const last = G.checkHabit(state, ids[2], NOV(16));
  assert.deepEqual(last.perfect, { xp: 20, gold: 10 });
  // 5 + 10 + 20 + 20 = 55 → Lv2(50 필요)에 남은 5
  assert.deepEqual(state.player, { level: 2, xp: 5, totalXp: 55, gold: 24, hp: 50 });
  assert.equal(last.levelBefore, 1);
  assert.equal(last.levelAfter, 2);
});

test('완벽한 하루는 오늘 예정된 습관만 센다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['주말 등산', 'hard', [0, 6]]);
  const r = G.checkHabit(state, ids[0], NOV(16)); // 월요일: 등산은 예정에 없다
  assert.deepEqual(r.perfect, { xp: 20, gold: 10 });
  assert.equal(G.daySummary(state, '2026-11-16').total, 1);
  assert.equal(G.daySummary(state, '2026-11-21').total, 2); // 토요일
});

test('체크 취소: 보상을 정확히 되돌린다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal']);
  G.checkHabit(state, ids[0], NOV(16));
  const before = structuredClone(state.player);
  G.checkHabit(state, ids[1], NOV(16)); // +10, 완벽한 하루 +20 → 합계 35
  assert.deepEqual(state.player, { level: 1, xp: 35, totalXp: 35, gold: 16, hp: 50 });

  const undo = G.uncheckHabit(state, ids[1], NOV(16, 21));
  assert.equal(undo.xp, 30); // 10 + 완벽한 하루 20
  assert.equal(undo.gold, 14); // 4 + 완벽한 하루 10
  assert.deepEqual(state.player, before);
  assert.equal(state.days['2026-11-16'].perfect, null);

  // 다시 체크하면 같은 보상을 다시 받는다
  const again = G.checkHabit(state, ids[1], NOV(16, 22));
  assert.equal(again.xp, 10);
  assert.deepEqual(again.perfect, { xp: 20, gold: 10 });
  assert.deepEqual(state.player, { level: 1, xp: 35, totalXp: 35, gold: 16, hp: 50 });
});

test('체크 취소: 그 체크로 오른 레벨도 되돌아간다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard']);
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[1], NOV(16));
  const before = structuredClone(state.player); // Lv1, 15 XP
  G.checkHabit(state, ids[2], NOV(16)); // +20 +20 → Lv2
  assert.equal(state.player.level, 2);
  const undo = G.uncheckHabit(state, ids[2], NOV(16));
  assert.equal(undo.levelBefore, 2);
  assert.equal(undo.levelAfter, 1);
  assert.deepEqual(state.player, before);
});

test('체크 취소는 그날 안에만 된다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal']);
  G.checkHabit(state, ids[0], NOV(16));
  assert.equal(G.uncheckHabit(state, ids[0], NOV(17, 3, 59)).ok, true); // 새벽 3:59까지는 같은 날
  G.checkHabit(state, ids[0], NOV(16));
  assert.equal(G.uncheckHabit(state, ids[0], NOV(17, 4, 0)).ok, false); // 4시가 지나면 못 한다
  assert.equal(state.player.totalXp, 5);
});

test('하루 기준 시각을 바꾸면 날짜 경계가 따라 바뀐다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal']);
  G.setDayStartHour(state, 6);
  assert.equal(G.checkHabit(state, ids[0], NOV(17, 5, 30)).ok, true); // 아직 16일
  assert.equal(G.isDone(state, ids[0], '2026-11-16'), true);
  assert.equal(G.checkHabit(state, ids[0], NOV(17, 6, 0)).xp, 6); // 17일: 연속 2일째 +10%
  assert.throws(() => G.setDayStartHour(state, 24));
});

test('여러 레벨을 한 번에 넘겨도 남는 경험치가 이월된다', () => {
  const { state, ids } = setup(['책 읽기', 'hard'], ['안 하는 습관', 'easy']);
  state.player = { level: 1, xp: 45, totalXp: 45, gold: 0, hp: 50 };
  const r = G.checkHabit(state, ids[0], NOV(16)); // 45 + 20 = 65 → Lv2, 15
  assert.equal(r.levelAfter, 2);
  assert.equal(state.player.xp, 15);
});

test('습관 입력 검사', () => {
  const state = G.createState();
  const base = { name: '물 마시기', difficulty: 'easy', category: 'life' };
  assert.throws(() => G.addHabit(state, { ...base, name: '   ' }, NOV(16)));
  assert.throws(() => G.addHabit(state, { ...base, difficulty: 'x' }, NOV(16)));
  assert.throws(() => G.addHabit(state, { ...base, category: 'x' }, NOV(16)));
  assert.throws(() => G.addHabit(state, { ...base, days: [] }, NOV(16)));
  const h = G.addHabit(state, base, NOV(16));
  assert.deepEqual(G.currentDays(h), G.ALL_DAYS); // 기본은 매일
});

test('습관을 지워도 이미 받은 보상은 남는다', () => {
  const { state, ids } = setup(['물 마시기', 'easy'], ['산책', 'normal']);
  G.checkHabit(state, ids[0], NOV(16));
  G.deleteHabit(state, ids[0], NOV(16));
  assert.equal(state.player.totalXp, 5);
  assert.equal(G.daySummary(state, '2026-11-16').total, 1);
});

test('성장 속도: 보통 습관 5개를 매일 전부 지킬 때', () => {
  const { state, ids } = setup(...['물 마시기', '산책', '책 읽기', '스트레칭', '정리'].map((n) => [n, 'normal']));
  const reached = {};
  for (let i = 0; i < 80; i++) {
    for (const id of ids) G.checkHabit(state, id, NOV(16) + i * 86400000);
    reached[state.player.level] ??= i + 1;
    for (let lv = state.player.level; lv > 1 && !reached[lv]; lv--) reached[lv] = i + 1;
  }
  // 1일째 50+20=70, 6일째부터 75+20=95. 보너스 덕에 기본 계산(23일/87일)보다 빠르다.
  console.log(`    Lv10 도달: ${reached[10]}일째, Lv20 도달: ${reached[20]}일째`);
  assert.equal(reached[10], 14); // 400(첫 5일) + 95 × 9일 = 1255 ≥ 1170
  assert.equal(reached[20], 47);
});
