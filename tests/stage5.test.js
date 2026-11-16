// 5단계 규칙 시험: 장비 전투 능력치, 전투 계산, 전투 기회와 보상.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';
import * as B from '../js/battle.js';
import { exportData, importData } from '../js/backup.js';

const NOV = (d, h = 9, min = 0) => new Date(2026, 10, d, h, min).getTime();

function hero(level = 1, items = []) {
  const state = G.createState();
  G.processRollover(state, NOV(16, 8));
  state.player.level = level;
  for (const id of items) {
    state.gear.owned.push(id);
    state.gear.equipped[G.ITEMS[id].slot] = id;
  }
  return state;
}
const full = (tier) => ['head', 'body', 'weapon', 'accessory'].map((s) => `${s}${tier}`);
const mid = () => 0.5; // 흔들림 없는 난수: 피해가 정확히 (공격력 − 방어력)
const never = () => 0.999; // 피버가 절대 터지지 않는 난수
const winRate = (state, stage, tries = 200) => {
  const p = G.battleStats(state);
  let wins = 0;
  for (let i = 0; i < tries; i++) if (B.simulate(p, B.monsterFor(stage), B.seededRng(i * 7919 + stage)).result === 'win') wins++;
  return wins / tries;
};

test('장비 능력치: 머리 방어+쿨타임, 몸 방어, 무기 공격, 장신구 피버 확률 (경험치 효과는 그대로)', () => {
  const stats = (slot) => [1, 2, 3, 4].map((t) => G.ITEMS[`${slot}${t}`].stats);
  assert.deepEqual(stats('head'), [{ def: 1, cooldownPct: 5 }, { def: 2, cooldownPct: 10 }, { def: 4, cooldownPct: 15 }, { def: 6, cooldownPct: 20 }]);
  assert.deepEqual(stats('body'), [{ def: 2 }, { def: 5 }, { def: 9 }, { def: 14 }]);
  assert.deepEqual(stats('weapon'), [{ atk: 4 }, { atk: 10 }, { atk: 18 }, { atk: 30 }]);
  assert.deepEqual(stats('accessory'), [{ feverPct: 3 }, { feverPct: 6 }, { feverPct: 9 }, { feverPct: 12 }]);
  assert.deepEqual([1, 2, 3, 4].map((t) => G.ITEMS[`head${t}`].xpPct), [2, 4, 6, 8]);
});

test('캐릭터 능력치 = 레벨 기본값 + 낀 장비', () => {
  assert.deepEqual(G.battleStats(hero(1)), { maxHp: 90, atk: 8, def: 0, cooldownPct: 0, feverPct: 3 });
  assert.deepEqual(G.battleStats(hero(5, full(1))), { maxHp: 130, atk: 20, def: 3, cooldownPct: 5, feverPct: 6 });
  assert.deepEqual(G.battleStats(hero(20, full(4))), { maxHp: 280, atk: 76, def: 20, cooldownPct: 20, feverPct: 15 });
  // 가지고만 있고 끼지 않은 장비는 반영되지 않는다
  const state = hero(5, full(1));
  G.equipItem(state, 'weapon', null);
  assert.equal(G.battleStats(state).atk, 16);
});

test('스테이지: 끝없이 이어지고 5의 배수는 보스', () => {
  assert.deepEqual(B.monsterFor(1), {
    stage: 1, kind: 'jelly', boss: false, rank: 0, name: '말랑 젤리', hp: 30, atk: 5, def: 0, intervalMs: 1500, gold: 3,
  });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((s) => B.monsterFor(s).name),
    ['말랑 젤리', '성난 버섯', '밤 박쥐', '돌 거인', '불꽃 도깨비 대장', '사나운 말랑 젤리']);
  assert.deepEqual([5, 10, 15, 20, 25, 100].map((s) => B.monsterFor(s).boss), [true, true, true, true, true, true]);
  assert.equal(B.monsterFor(5).gold, 15); // 보스는 보상 3배
  assert.equal(B.monsterFor(100).name, '전설의 불꽃 도깨비 대장');
  for (let s = 2; s <= 60; s++) {
    const [a, b] = [B.monsterFor(s - 1), B.monsterFor(s)];
    if (!a.boss) assert.ok(b.hp > a.hp && b.atk >= a.atk, `${s}스테이지가 더 강하다`);
  }
});

test('피해 = 공격력 − 방어력 (±10%), 최소 1', () => {
  const player = { maxHp: 100, atk: 20, def: 4, cooldownPct: 0, feverPct: 0 };
  const monster = { ...B.monsterFor(1), hp: 1000, atk: 10, def: 5 };
  const b = B.createBattle(player, monster);
  const seen = [];
  for (let i = 0; i < 30; i++) seen.push(...B.step(b, mid));
  assert.deepEqual(seen.filter((e) => e.type === 'hit').map((e) => e.dmg), [15, 15, 15]); // 0.5초, 1.5초, 2.5초
  assert.deepEqual(seen.filter((e) => e.type === 'hurt').map((e) => e.dmg), [6, 6]); // 1.5초, 3.0초
  // 흔들림 범위
  const lo = B.createBattle(player, monster);
  const hi = B.createBattle(player, monster);
  for (let i = 0; i < 5; i++) { B.step(lo, () => 0); B.step(hi, never); }
  assert.equal(1000 - lo.monster.hp, 14); // 15 × 0.9 = 13.5 → 14
  assert.equal(1000 - hi.monster.hp, 16); // 15 × 1.1 = 16.5 → 16
  // 방어력이 공격력보다 높아도 1은 들어간다
  const wall = B.createBattle(player, { ...monster, def: 99 });
  for (let i = 0; i < 5; i++) B.step(wall, mid);
  assert.equal(wall.monster.hp, 999);
});

test('스킬: 공격력 × 3, 쿨타임 8초, 첫 스킬은 절반(4초) 뒤', () => {
  const player = { maxHp: 1000, atk: 20, def: 0, cooldownPct: 0, feverPct: 0 };
  const monster = { ...B.monsterFor(1), hp: 100000, atk: 1, def: 5 };
  const b = B.createBattle(player, monster);
  const used = [];
  for (let i = 0; i < 250; i++) {
    for (const e of B.step(b, mid, true)) if (e.type === 'skill') used.push([b.t, e.dmg]); // 버튼을 계속 누르고 있어도
  }
  assert.deepEqual(used, [[4000, 55], [12000, 55], [20000, 55]]); // 준비됐을 때만 나간다: 20 × 3 − 5
  // 버튼을 누르지 않으면 나가지 않는다
  const idle = B.createBattle(player, monster);
  const events = [];
  for (let i = 0; i < 100; i++) events.push(...B.step(idle, mid, false));
  assert.equal(events.some((e) => e.type === 'skill'), false);
  assert.equal(B.skillReady(idle), true);
});

test('머리 장비의 쿨타임 감소: −20%면 8초 → 6.4초', () => {
  assert.equal(B.skillCooldownMs({ cooldownPct: 0 }), 8000);
  assert.equal(B.skillCooldownMs({ cooldownPct: 5 }), 7600);
  assert.equal(B.skillCooldownMs({ cooldownPct: 20 }), 6400);
  const b = B.createBattle({ maxHp: 1000, atk: 20, def: 0, cooldownPct: 20, feverPct: 0 }, { ...B.monsterFor(1), hp: 100000, atk: 1 });
  const times = [];
  for (let i = 0; i < 200; i++) for (const e of B.step(b, mid, true)) if (e.type === 'skill') times.push(b.t);
  assert.deepEqual(times, [3200, 9600, 16000]);
});

test('피버: 터지면 4초 동안 두 배 빠르게 공격하고, 피버 중에는 다시 터지지 않는다', () => {
  const monster = { ...B.monsterFor(1), hp: 100000, atk: 1 };
  const b = B.createBattle({ maxHp: 1000, atk: 20, def: 0, cooldownPct: 0, feverPct: 100 }, monster);
  const hits = [];
  const fevers = [];
  for (let i = 0; i < 110; i++) {
    for (const e of B.step(b, mid)) {
      if (e.type === 'hit') hits.push([b.t, e.fever]);
      if (e.type === 'fever') fevers.push(b.t);
    }
  }
  // 0.5초 첫 공격에서 발동 → 4.5초까지 0.5초 간격, 끝나고 첫 공격에서 다시 발동
  assert.deepEqual(hits.slice(0, 10), [
    [500, false], [1000, true], [1500, true], [2000, true], [2500, true], [3000, true], [3500, true], [4000, true], [4500, false], [5000, true],
  ]);
  assert.deepEqual(fevers, [500, 4500, 8500]);
  // 확률 0%면 터지지 않는다
  const calm = B.createBattle({ maxHp: 1000, atk: 20, def: 0, cooldownPct: 0, feverPct: 0 }, monster);
  const events = [];
  for (let i = 0; i < 300; i++) events.push(...B.step(calm, () => 0));
  assert.equal(events.some((e) => e.type === 'fever'), false);
});

test('피버 확률은 장신구만큼 오른다 (공격 1만 번 기준)', () => {
  for (const [items, expected] of [[[], 3], [['accessory2'], 9], [['accessory4'], 15]]) {
    const p = { ...G.battleStats(hero(1, items)), maxHp: 1e9 };
    const rng = B.seededRng(42);
    let attacks = 0;
    let fevers = 0;
    while (attacks < 10000) {
      const b = B.createBattle(p, { ...B.monsterFor(1), hp: 1e9, atk: 1 });
      for (let i = 0; i < 590; i++) {
        for (const e of B.step(b, rng)) {
          if (e.type === 'hit' && !e.fever) attacks++; // 피버 중의 공격은 발동 판정이 없다
          if (e.type === 'fever') fevers++;
        }
      }
    }
    const pct = (fevers / attacks) * 100;
    assert.ok(Math.abs(pct - expected) < 1, `장신구 ${items[0] ?? '없음'}: ${pct.toFixed(1)}% (기대 ${expected}%)`);
  }
});

test('승패: 몬스터 체력 0이면 승리, 내 체력 0이면 패배, 60초를 넘기면 시간 초과', () => {
  const win = B.simulate(G.battleStats(hero(1)), B.monsterFor(1), mid);
  assert.equal(win.result, 'win');
  assert.equal(win.monster.hp, 0);
  assert.equal(win.t, 3500); // 스킬이 준비되기 전에 끝난다: 8 × 4대 = 32 ≥ 30, 4대째는 3.5초
  const lose = B.simulate(G.battleStats(hero(1)), B.monsterFor(20), mid);
  assert.equal(lose.result, 'lose');
  assert.equal(lose.player.hp, 0);
  const slow = B.simulate({ maxHp: 10000, atk: 1, def: 999, cooldownPct: 0, feverPct: 0 }, B.monsterFor(10), mid);
  assert.equal(slow.result, 'timeout');
  assert.equal(slow.t, 60000);
  assert.deepEqual(B.step(slow, mid, true), []); // 끝난 전투는 더 진행되지 않는다
});

test('같은 난수면 전투 결과가 똑같다', () => {
  const p = G.battleStats(hero(5, full(1)));
  const a = B.simulate(p, B.monsterFor(9), B.seededRng(7));
  const b = B.simulate(p, B.monsterFor(9), B.seededRng(7));
  assert.deepEqual(a, b);
});

test('균형: 보스마다 다음 단계 장비가 필요하다', () => {
  // [캐릭터, 안정적으로 깨는 스테이지, 막히는 보스]
  for (const [state, clears, wall] of [
    [hero(1), 4, 5],
    [hero(5, full(1)), 9, 10],
    [hero(10, full(2)), 14, 15],
    [hero(15, full(3)), 19, 20],
    [hero(20, full(4)), 24, 25],
  ]) {
    for (let s = 1; s <= clears; s++) assert.ok(winRate(state, s) >= 0.9, `Lv${state.player.level}: ${s}스테이지 승률 ${winRate(state, s)}`);
    assert.ok(winRate(state, wall) <= 0.1, `Lv${state.player.level}: ${wall}스테이지 보스 승률 ${winRate(state, wall)}`);
  }
  // 첫 보스는 Lv2에 나무 검 하나만 사도 넘을 수 있다
  assert.ok(winRate(hero(2, ['weapon1']), 5) >= 0.9);
  // 한 판은 길어야 20초 안팎
  assert.ok(B.simulate(G.battleStats(hero(15, full(3))), B.monsterFor(19), B.seededRng(1)).t <= 20000);
});

/** 습관 3개(쉬움)를 만든 캐릭터 */
function withHabits(level = 3) {
  const state = hero(level);
  const ids = ['물 마시기', '산책', '책 읽기'].map((name, i) =>
    G.addHabit(state, { name, difficulty: 'easy', category: 'life' }, NOV(16, 8, i)).id);
  return { state, ids };
}
const left = (state, d = 16) => G.battleChances(state, `2026-11-${d}`).left;

test('오늘 전투 기회 = 오늘 완료한 습관 수 + 완벽한 하루 1 − 오늘 싸운 횟수', () => {
  const { state, ids } = withHabits();
  assert.deepEqual(G.battleChances(state, '2026-11-16'), { done: 0, perfect: 0, earned: 0, used: 0, left: 0 });
  assert.deepEqual(G.beginBattle(state, NOV(16)), { ok: false, reason: 'no-chance' }); // 아무것도 안 했으면 싸울 수 없다
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[1], NOV(16));
  assert.equal(left(state), 2);
  G.checkHabit(state, ids[2], NOV(16)); // 마지막: +1, 완벽한 하루 +1
  assert.deepEqual(G.battleChances(state, '2026-11-16'), { done: 3, perfect: 1, earned: 4, used: 0, left: 4 });
  for (let i = 0; i < 4; i++) assert.equal(G.beginBattle(state, NOV(16)).ok, true);
  assert.deepEqual(G.battleChances(state, '2026-11-16'), { done: 3, perfect: 1, earned: 4, used: 4, left: 0 });
  assert.equal(G.beginBattle(state, NOV(16)).ok, false);
});

test('체크 → 전투 → 해제 → 다시 체크를 반복해도 습관 1개당 전투는 1번뿐이다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  let fights = 0;
  for (let i = 0; i < 10; i++) {
    const start = G.beginBattle(state, NOV(16));
    if (start.ok) {
      fights++;
      G.finishBattle(state, start.stage, true);
    }
    G.uncheckHabit(state, ids[0], NOV(16));
    assert.equal(left(state), 0); // 싸운 뒤 해제하면 0 (음수로 보이지 않는다)
    G.checkHabit(state, ids[0], NOV(16));
    assert.equal(left(state), 0); // 다시 체크해도 이미 쓴 기회는 돌아오지 않는다
  }
  assert.equal(fights, 1);
  assert.equal(state.player.gold, 2 + 3); // 습관 골드 2 + 전투 1번 3
  // 완벽한 하루도 마찬가지: 마지막 습관을 해제·체크해도 기회가 늘지 않는다
  G.checkHabit(state, ids[1], NOV(16));
  G.checkHabit(state, ids[2], NOV(16));
  assert.equal(left(state), 3); // 완료 3 + 완벽 1 − 사용 1
  for (let i = 0; i < 3; i++) G.beginBattle(state, NOV(16));
  for (let i = 0; i < 5; i++) {
    G.uncheckHabit(state, ids[2], NOV(16));
    G.checkHabit(state, ids[2], NOV(16));
  }
  assert.equal(left(state), 0);
  assert.equal(state.days['2026-11-16'].battles, 4);
});

test('싸우기 전에 해제하면 그만큼 기회가 줄고, 다시 체크하면 원래대로 돌아온다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[1], NOV(16));
  assert.equal(left(state), 2);
  G.uncheckHabit(state, ids[1], NOV(16));
  assert.equal(left(state), 1);
  G.checkHabit(state, ids[1], NOV(16));
  assert.equal(left(state), 2);
});

test('남은 기회는 다음 날로 넘어가지 않고, 새 날은 0에서 시작한다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[1], NOV(16));
  assert.equal(left(state, 16), 2);
  G.processRollover(state, NOV(17));
  assert.equal(left(state, 17), 0);
  assert.equal(G.beginBattle(state, NOV(17)).ok, false);
  G.checkHabit(state, ids[0], NOV(17));
  assert.equal(left(state, 17), 1);
  // 새벽 3:59까지는 아직 전날 기회를 쓴다
  const s2 = withHabits().state;
  G.checkHabit(s2, Object.keys(s2.habits)[0], NOV(16, 22));
  assert.equal(G.beginBattle(s2, NOV(17, 3, 59)).ok, true);
  assert.equal(s2.days['2026-11-16'].battles, 1);
});

test('지운 습관도 그날 이미 완료했다면 그날 기회는 그대로다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  G.deleteHabit(state, ids[0], NOV(16));
  assert.equal(left(state), 1);
});

test('승리하면 골드를 받고 다음 스테이지가 열린다. 경험치와 HP는 전투로 변하지 않는다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[1], NOV(16));
  Object.assign(state.player, { xp: 40, totalXp: 190, gold: 10, hp: 33 });
  const start = G.beginBattle(state, NOV(16));
  assert.deepEqual(G.finishBattle(state, start.stage, true), { ok: true, won: true, gold: 3 });
  assert.deepEqual(state.player, { level: 3, xp: 40, totalXp: 190, gold: 13, hp: 33 });
  assert.deepEqual(state.battle, { cleared: 1, wins: 1, losses: 0 });
  assert.equal(G.nextStage(state), 2);
  assert.equal(left(state), 1);
  // 보스(5스테이지) 보상은 15 G
  state.battle.cleared = 4;
  assert.equal(G.finishBattle(state, 5, true).gold, 15);
  assert.equal(state.player.gold, 28);
});

test('패배하면 그 기회만 사라지고 아무것도 잃지 않는다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  Object.assign(state.player, { xp: 40, totalXp: 190, gold: 10, hp: 33 });
  const start = G.beginBattle(state, NOV(16));
  assert.deepEqual(G.finishBattle(state, start.stage, false), { ok: true, won: false, gold: 0 });
  assert.deepEqual(state.player, { level: 3, xp: 40, totalXp: 190, gold: 10, hp: 33 });
  assert.deepEqual(state.battle, { cleared: 0, wins: 0, losses: 1 });
  assert.equal(left(state), 0);
});

test('같은 스테이지의 보상을 두 번 받을 수 없다', () => {
  const { state, ids } = withHabits();
  G.checkHabit(state, ids[0], NOV(16));
  G.beginBattle(state, NOV(16));
  assert.equal(G.finishBattle(state, 1, true).ok, true);
  assert.deepEqual(G.finishBattle(state, 1, true), { ok: false, reason: 'stale' });
  assert.equal(state.player.gold, 2 + 3);
  assert.equal(state.battle.cleared, 1);
});

test('전투 골드는 습관 수입보다 적다: 24스테이지까지 전부 깨도 288 G', () => {
  let total = 0;
  for (let s = 1; s <= 24; s++) total += B.monsterFor(s).gold;
  assert.equal(total, 288); // 보통 습관 5개를 매일 지키면 하루 30 G
});

test('백업: 전투 기록과 그날 싸운 횟수가 포함되고, 예전 백업(전투 없음, 쌓아 둔 기회 있음)도 가져올 수 있다', () => {
  const { state, ids } = withHabits(4);
  G.checkHabit(state, ids[0], NOV(16));
  G.checkHabit(state, ids[1], NOV(16));
  const start = G.beginBattle(state, NOV(16));
  G.finishBattle(state, start.stage, true);
  const data = JSON.parse(JSON.stringify(exportData(state, NOV(16, 20))));
  assert.deepEqual(data.battle, { cleared: 1, wins: 1, losses: 0 });
  const restored = importData(JSON.stringify(data));
  assert.deepEqual(restored.battle, state.battle);
  assert.equal(G.battleChances(restored, '2026-11-16').left, 1); // 가져와도 오늘 쓴 기회는 그대로 쓴 것

  // 전투가 생기기 전(1 버전)의 백업
  const v1 = structuredClone(data);
  v1.version = 1;
  delete v1.battle;
  assert.deepEqual(importData(JSON.stringify(v1)).battle, { cleared: 0, wins: 0, losses: 0 });
  // 쌓아 두는 기회(tickets)가 있던 2 버전 백업: 기회 숫자는 버리고 나머지는 가져온다
  const v2 = structuredClone(data);
  v2.battle.tickets = 7;
  v2.completions[0].tickets = 1;
  const r2 = importData(JSON.stringify(v2));
  assert.deepEqual(r2.battle, { cleared: 1, wins: 1, losses: 0 });
  assert.equal('tickets' in Object.values(r2.completions)[0], false);

  for (const change of [(d) => (d.battle.cleared = -1), (d) => (d.battle.tickets = 'many'), (d) => (d.days[0].battles = -2)]) {
    const bad = structuredClone(data);
    change(bad);
    assert.throws(() => importData(JSON.stringify(bad)), /전투|날짜 기록/);
  }
});
