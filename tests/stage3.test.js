// 3단계 규칙 시험: 상점 가격·해금 레벨, 장비 착용, 장비 경험치 보너스.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';

const NOV = (d, h = 9, min = 0) => new Date(2026, 10, d, h, min).getTime();

function setup(habits, player = {}) {
  const state = G.createState();
  G.processRollover(state, NOV(16, 8));
  Object.assign(state.player, player);
  const ids = habits.map(([name, difficulty], i) =>
    G.addHabit(state, { name, difficulty, category: 'life' }, NOV(16, 8, i)).id);
  return { state, ids };
}
const wear = (state, ...itemIds) => {
  for (const id of itemIds) {
    state.gear.owned.push(id);
    state.gear.equipped[G.ITEMS[id].slot] = id;
  }
};
const NORMAL5 = ['물 마시기', '산책', '책 읽기', '스트레칭', '정리'].map((n) => [n, 'normal']);

test('장비표: 부위 4개 × 4단계, 가격 50/150/400/1000, 해금 Lv1/5/10/15, 효과 +2/4/6/8%', () => {
  assert.equal(Object.keys(G.ITEMS).length, 16);
  for (const slot of ['head', 'body', 'weapon', 'accessory']) {
    const items = [1, 2, 3, 4].map((t) => G.ITEMS[`${slot}${t}`]);
    assert.deepEqual(items.map((i) => i.price), [50, 150, 400, 1000]);
    assert.deepEqual(items.map((i) => i.level), [1, 5, 10, 15]);
    assert.deepEqual(items.map((i) => i.xpPct), [2, 4, 6, 8]);
    assert.ok(items.every((i) => i.slot === slot && i.name));
  }
  assert.equal(new Set(Object.values(G.ITEMS).map((i) => i.name)).size, 16); // 이름이 겹치지 않는다
});

test('구매: 골드가 빠지고 바로 착용된다', () => {
  const { state } = setup([], { gold: 60 });
  const res = G.buyItem(state, 'head1');
  assert.equal(res.ok, true);
  assert.equal(state.player.gold, 10);
  assert.deepEqual(state.gear.owned, ['head1']);
  assert.equal(state.gear.equipped.head, 'head1');
});

test('구매 실패: 골드 부족, 레벨 부족, 이미 가진 장비', () => {
  const { state } = setup([], { gold: 49 });
  assert.deepEqual(G.buyItem(state, 'head1'), { ok: false, reason: 'no-gold', short: 1 });
  state.player.gold = 5000;
  assert.deepEqual(G.buyItem(state, 'head2'), { ok: false, reason: 'locked', level: 5 });
  assert.equal(G.buyItem(state, 'head1').ok, true);
  assert.deepEqual(G.buyItem(state, 'head1'), { ok: false, reason: 'owned' });
  assert.equal(state.player.gold, 4950); // 실패한 구매는 골드를 건드리지 않는다
  assert.equal(G.buyItem(state, 'nothing').ok, false);
});

test('해금 레벨: 2단계 Lv5, 3단계 Lv10, 4단계 Lv15', () => {
  for (const [level, buyable] of [[1, 1], [4, 1], [5, 2], [9, 2], [10, 3], [14, 3], [15, 4], [30, 4]]) {
    const { state } = setup([], { gold: 99999, level });
    const ok = [1, 2, 3, 4].filter((t) => G.buyItem(state, `weapon${t}`).ok);
    assert.equal(ok.length, buyable, `Lv${level}`);
  }
  assert.deepEqual(G.tiersUnlockedBetween(4, 5).map((t) => t.tier), [2]);
  assert.deepEqual(G.tiersUnlockedBetween(5, 9), []);
  assert.deepEqual(G.tiersUnlockedBetween(9, 15).map((t) => t.tier), [3, 4]);
});

test('착용과 해제: 가진 장비만, 부위에 맞는 것만', () => {
  const { state } = setup([], { gold: 500, level: 5 });
  G.buyItem(state, 'body1');
  G.buyItem(state, 'body2');
  assert.equal(state.gear.equipped.body, 'body2');
  assert.equal(G.equipItem(state, 'body', 'body1').ok, true);
  assert.equal(state.gear.equipped.body, 'body1');
  assert.equal(G.equipItem(state, 'body', null).ok, true);
  assert.equal(state.gear.equipped.body, null);
  assert.equal(G.equipItem(state, 'body', 'body3').ok, false); // 안 가진 장비
  assert.equal(G.equipItem(state, 'head', 'body1').ok, false); // 부위가 다름
  assert.equal(state.player.gold, 300); // 끼고 벗는 데는 골드가 들지 않는다
});

test('장비 효과 합계: 낀 장비만 더하고 최대 +20%', () => {
  const { state } = setup([]);
  assert.equal(G.equipBonusPct(state), 0);
  wear(state, 'head1');
  assert.equal(G.equipBonusPct(state), 2);
  wear(state, 'body2', 'weapon3');
  assert.equal(G.equipBonusPct(state), 12);
  wear(state, 'accessory4');
  assert.equal(G.equipBonusPct(state), 20); // 2+4+6+8 = 20
  wear(state, 'head4', 'body4', 'weapon4');
  assert.equal(G.equipBonusPct(state), 20); // 8×4 = 32 → 20에서 멈춤
  G.equipItem(state, 'head', null);
  G.equipItem(state, 'body', null);
  assert.equal(G.equipBonusPct(state), 16); // 가지고만 있는 장비는 효과가 없다
});

test('장비 +20%: 쉬움 6, 보통 12, 어려움 24 (골드는 그대로)', () => {
  const { state, ids } = setup([['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard'], ['안 함', 'easy']]);
  wear(state, 'head4', 'body4', 'weapon4', 'accessory4');
  const r = ids.slice(0, 3).map((id) => G.checkHabit(state, id, NOV(16)));
  assert.deepEqual(r.map((x) => [x.xp, x.gold]), [[6, 2], [12, 4], [24, 8]]);
});

test('연속 보너스와 장비 보너스는 더해진다: 어려움 +50% +20% = 34', () => {
  const { state, ids } = setup([['책 읽기', 'hard'], ['안 함', 'easy']]);
  wear(state, 'head4', 'body4', 'weapon4', 'accessory4');
  const got = [];
  for (let d = 16; d <= 22; d++) got.push(G.checkHabit(state, ids[0], NOV(d)).xp);
  assert.deepEqual(got, [24, 26, 28, 30, 32, 34, 34]); // 연속분 20·22·…·30 에 장비분 +4
});

test('작은 보너스도 사라지지 않는다: +2%면 보통 습관 5번에 +1 XP', () => {
  const { state, ids } = setup([...NORMAL5, ['안 함', 'easy']]);
  wear(state, 'head1'); // +2% → 보통(10 XP) 한 번에 0.2 XP씩 쌓인다
  const got = ids.slice(0, 5).map((id) => G.checkHabit(state, id, NOV(16)).xp);
  assert.deepEqual(got, [10, 10, 10, 10, 11]);
  assert.equal(state.player.totalXp, 51); // 50의 2% = 1
  assert.equal(state.gear.carry, 0);
});

test('한 달 합계: 장비 +6%면 기본 경험치의 정확히 6%를 더 받는다', () => {
  const { state, ids } = setup([['물 마시기', 'easy'], ['산책', 'normal'], ['책 읽기', 'hard'], ['안 함', 'easy']]);
  wear(state, 'weapon3'); // +6%
  let equipTotal = 0;
  for (let i = 0; i < 30; i++) {
    for (const id of ids.slice(0, 3)) {
      const before = G.rewardFor(state, state.habits[id], G.today(state, NOV(16 + i)));
      G.checkHabit(state, id, NOV(16 + i));
      equipTotal += before.equipXp;
    }
  }
  assert.equal(equipTotal, 63); // (5 + 10 + 20) × 30일 × 6% = 63
});

test('체크 취소: 장비 보너스까지 정확히 되돌린다 (순서를 섞어도)', () => {
  const { state, ids } = setup([...NORMAL5, ['안 함', 'easy']]);
  wear(state, 'head1', 'body1'); // +4% → 보통 한 번에 0.4 XP
  const snapshot = () => [state.player.xp, state.player.totalXp, state.player.gold, state.gear.carry];
  const start = snapshot();
  for (const id of ids.slice(0, 5)) G.checkHabit(state, id, NOV(16)); // 50 + 2
  assert.equal(state.player.totalXp, 52);

  // 가운데 것부터 뒤섞어 전부 취소
  for (const i of [2, 0, 4, 1, 3]) G.uncheckHabit(state, ids[i], NOV(16));
  assert.deepEqual(snapshot(), start);

  // 일부만 취소한 경우: 남은 체크 수에 맞는 합계가 된다
  for (const id of ids.slice(0, 5)) G.checkHabit(state, id, NOV(16));
  G.uncheckHabit(state, ids[1], NOV(16));
  G.uncheckHabit(state, ids[3], NOV(16));
  assert.equal(state.player.totalXp, 31); // 3번 × 10 + 버림(3 × 0.4) = 31
  assert.equal(state.gear.carry, 20);
});

test('체크 직후 취소하면 받은 만큼만 되돌린다', () => {
  const { state, ids } = setup([['책 읽기', 'hard'], ['안 함', 'easy']]);
  wear(state, 'weapon3'); // +6% → 어려움 1.2 XP
  state.gear.carry = 90;
  const r = G.checkHabit(state, ids[0], NOV(16)); // 20 + 버림(0.9 + 1.2) = 22
  assert.equal(r.xp, 22);
  assert.equal(state.gear.carry, 10);
  const undo = G.uncheckHabit(state, ids[0], NOV(16));
  assert.equal(undo.xp, 22);
  assert.equal(state.gear.carry, 90);
  assert.equal(state.player.totalXp, 0);
});

test('골드를 쓴 뒤 체크를 취소하면 골드가 음수가 될 수 있다', () => {
  const { state, ids } = setup([['책 읽기', 'hard'], ['안 함', 'easy']], { gold: 45 });
  G.checkHabit(state, ids[0], NOV(16)); // +8 → 53
  G.buyItem(state, 'head1'); // −50 → 3
  G.uncheckHabit(state, ids[0], NOV(16)); // −8 → −5
  assert.equal(state.player.gold, -5);
  assert.equal(G.buyItem(state, 'body1').ok, false);
  assert.deepEqual(state.gear.owned, ['head1']); // 산 장비는 그대로 남는다
});

test('완벽한 하루 보너스에는 장비 효과가 붙지 않는다', () => {
  const { state, ids } = setup([['산책', 'normal']]);
  wear(state, 'head4', 'body4', 'weapon4', 'accessory4');
  const r = G.checkHabit(state, ids[0], NOV(16));
  assert.equal(r.xp, 12);
  assert.deepEqual(r.perfect, { xp: 20, gold: 10 });
});

test('골드 벌이: 보통 습관 5개를 매일 전부 지키면 하루 30 G', () => {
  const { state, ids } = setup(NORMAL5);
  const firstBuy = {};
  for (let i = 0; i < 40; i++) {
    for (const id of ids) G.checkHabit(state, id, NOV(16 + i));
    for (const t of [1, 2, 3, 4]) {
      // 4부위를 한 단계씩 모두 살 수 있게 되는 날
      const cost = [50, 150, 400, 1000].slice(0, t).reduce((a, b) => a + b, 0) * 4;
      if (!firstBuy[t] && state.player.gold >= cost && state.player.level >= G.TIERS[t - 1].level) firstBuy[t] = i + 1;
    }
  }
  assert.equal(state.player.gold, 30 * 40);
  console.log(`    (장비를 사지 않고 모으기만 할 때) 1단계 4부위 전부: ${firstBuy[1]}일째, 2단계까지: ${firstBuy[2]}일째`);
  assert.equal(firstBuy[1], 7); // 200 G
  assert.equal(firstBuy[2], 27); // 800 G
});
