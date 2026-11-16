// 게임 규칙만 모아 둔 파일. 화면(DOM)이나 저장소를 건드리지 않으므로
// 브라우저와 Node(시험)에서 똑같이 돌아간다.
// 상태를 바꾼 함수는 바뀐 레코드를 state.dirty 에 적어 두고, 저장은 db.js 가 맡는다.

import { monsterFor } from './battle.js';

export const DIFFICULTY = {
  easy: { label: '쉬움', xp: 5, gold: 2 },
  normal: { label: '보통', xp: 10, gold: 4 },
  hard: { label: '어려움', xp: 20, gold: 8 },
};

export const CATEGORY = {
  exercise: { label: '운동' },
  study: { label: '공부' },
  work: { label: '업무' },
  life: { label: '생활' },
};

export const STREAK_STEP_PCT = 10; // 연속 하루마다 +10%
export const STREAK_MAX_PCT = 50; // 최대 +50%
export const PERFECT_DAY = { xp: 20, gold: 10 };
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // 0 = 일요일
export const NAME_MAX = 30;

export const HP_MAX = 50;
export const HP_PER_HABIT = 2; // 습관 하나 완료할 때마다 회복
export const HP_MISS = 5; // 못 한 습관 하나당
export const HP_MISS_DAY_MAX = 15; // 하루에 깎이는 최대치
export const HP_REVIVE = 25; // HP가 0이 된 뒤 되살아나는 값
export const KO_XP_LOSS_PCT = 10; // HP가 0이 되면 현재 레벨에서 쌓은 경험치의 10%를 잃는다
export const MAX_PENALTY_DAYS = 3; // 오래 자리를 비워도 벌칙은 3일치까지만

// ───────── 장비 ─────────
export const SLOTS = {
  head: { label: '머리' },
  body: { label: '몸' },
  weapon: { label: '무기' },
  accessory: { label: '장신구' },
};
export const TIERS = [
  { tier: 1, price: 50, level: 1, xpPct: 2 },
  { tier: 2, price: 150, level: 5, xpPct: 4 },
  { tier: 3, price: 400, level: 10, xpPct: 6 },
  { tier: 4, price: 1000, level: 15, xpPct: 8 },
];
export const EQUIP_BONUS_MAX_PCT = 20;
const ITEM_NAMES = {
  head: ['천 두건', '깃털 모자', '강철 투구', '별빛 왕관'],
  body: ['여행자 조끼', '가죽 갑옷', '강철 갑옷', '별빛 갑옷'],
  weapon: ['나무 검', '무쇠 검', '기사의 검', '별빛 검'],
  accessory: ['행운의 목도리', '은빛 목걸이', '바람 망토', '별빛 날개'],
};
// 전투 능력치(단계 1~4). 머리: 방어력 + 스킬 쿨타임 감소, 몸: 방어력, 무기: 공격력, 장신구: 피버 발동 확률.
const ITEM_STATS = {
  head: [{ def: 1, cooldownPct: 5 }, { def: 2, cooldownPct: 10 }, { def: 4, cooldownPct: 15 }, { def: 6, cooldownPct: 20 }],
  body: [{ def: 2 }, { def: 5 }, { def: 9 }, { def: 14 }],
  weapon: [{ atk: 4 }, { atk: 10 }, { atk: 18 }, { atk: 30 }],
  accessory: [{ feverPct: 3 }, { feverPct: 6 }, { feverPct: 9 }, { feverPct: 12 }],
};
/** 장비 16종. id 는 'head1' 처럼 부위 + 단계. */
export const ITEMS = Object.fromEntries(
  Object.keys(SLOTS).flatMap((slot) =>
    TIERS.map((t, i) => [`${slot}${t.tier}`, {
      id: `${slot}${t.tier}`, slot, name: ITEM_NAMES[slot][i], ...t, stats: ITEM_STATS[slot][i],
    }])),
);

// 전투
export const BASE_FEVER_PCT = 3; // 장신구가 없어도 공격할 때마다 3% 확률로 피버
export const TICKET_PER_HABIT = 1; // 습관 하나 완료 = 전투 기회 1
export const TICKET_PER_PERFECT_DAY = 1; // 완벽한 하루 = 전투 기회 1 추가
export const START_TICKETS = 3; // 처음에 바로 해 볼 수 있도록

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

// ───────── 레벨 ─────────

/** 현재 레벨에서 다음 레벨까지 필요한 경험치 */
export const xpNeeded = (level) => 30 + 20 * level;

// ───────── 날짜 ─────────
// 하루는 'YYYY-MM-DD' 문자열(날짜 키)로 다룬다. 문자열끼리 크기 비교가 곧 날짜 비교다.

/** 실제 시각(ms)을 '하루 기준 시각'을 반영한 날짜 키로 바꾼다. 03:59는 아직 전날이다. */
export function dayKey(ms, startHour = 4) {
  const d = new Date(ms - startHour * HOUR_MS);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

const keyToUTC = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const addDays = (key, n) => new Date(keyToUTC(key) + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (key) => new Date(keyToUTC(key)).getUTCDay();
export const daysBetween = (from, to) => Math.round((keyToUTC(to) - keyToUTC(from)) / DAY_MS);

// ───────── 상태 ─────────

export const defaultPlayer = () => ({ level: 1, xp: 0, totalXp: 0, gold: 0, hp: HP_MAX });
// lastDay: 마지막으로 앱을 연 날(이날까지는 벌칙 계산이 끝나지 않은 '진행 중인 날').
// report: 아직 확인하지 않은 '자리를 비운 동안' 요약.
export const defaultProgress = () => ({ lastDay: null, report: null });
// owned: 가진 장비 id 목록, equipped: 부위별로 낀 장비 id,
// carry: 장비 보너스 경험치의 소수점 누적분(1/100 XP 단위, 0~99).
export const defaultGear = () => ({
  owned: [],
  equipped: { head: null, body: null, weapon: null, accessory: null },
  carry: 0,
});
// cleared: 깬 스테이지 수(다음에 싸울 스테이지는 cleared + 1), tickets: 남은 전투 기회
export const defaultBattle = () => ({ cleared: 0, tickets: START_TICKETS, wins: 0, losses: 0 });
export const defaultSettings = () => ({ dayStartHour: 4, debugOffsetMs: 0, lastBackupAt: null });

export function createState() {
  return {
    player: defaultPlayer(),
    settings: defaultSettings(),
    progress: defaultProgress(),
    gear: defaultGear(),
    battle: defaultBattle(),
    habits: {}, // id → 습관
    completions: {}, // '날짜|습관id' → 완료 기록
    days: {}, // 날짜 → 그날의 기록(완벽한 하루 보너스 등)
    dirty: new Map(),
  };
}

function mark(state, store, key, value) {
  state.dirty.set(`${store}:${key}`, { store, key, value }); // value 가 undefined 면 삭제
}
const markPlayer = (state) => mark(state, 'meta', 'player', { key: 'player', ...state.player });
const markProgress = (state) => mark(state, 'meta', 'progress', { key: 'progress', ...state.progress });
const markBattle = (state) => mark(state, 'meta', 'battle', { key: 'battle', ...state.battle });
const markGear = (state) => mark(state, 'meta', 'gear', { key: 'gear', ...state.gear });
const markSettings = (state) => mark(state, 'meta', 'settings', { key: 'settings', ...state.settings });

export const today = (state, nowMs) => dayKey(nowMs, state.settings.dayStartHour);
const completionId = (day, habitId) => `${day}|${habitId}`;
export const isDone = (state, habitId, day) => Boolean(state.completions[completionId(day, habitId)]);

// ───────── 습관 ─────────

/** 그날 적용되던 반복 요일. 요일을 바꿔도 지난 날의 기록 해석이 달라지지 않게 이력을 남긴다. */
function daysOn(habit, day) {
  let found = null;
  for (const entry of habit.schedule) {
    if (entry.from <= day) found = entry;
    else break;
  }
  return found ? found.days : [];
}
export const currentDays = (habit) => habit.schedule[habit.schedule.length - 1].days;

export function isScheduled(habit, day) {
  return day >= habit.createdDay && daysOn(habit, day).includes(weekdayOf(day));
}

function cleanInput(input) {
  const name = String(input.name ?? '').trim().slice(0, NAME_MAX);
  if (!name) throw new Error('습관 이름을 입력해 주세요.');
  if (!DIFFICULTY[input.difficulty]) throw new Error('난이도를 골라 주세요.');
  if (!CATEGORY[input.category]) throw new Error('분야를 골라 주세요.');
  const days = [...new Set(input.days ?? ALL_DAYS)].filter((d) => ALL_DAYS.includes(d)).sort();
  if (!days.length) throw new Error('반복 요일을 하루 이상 골라 주세요.');
  return { name, difficulty: input.difficulty, category: input.category, days };
}

export function addHabit(state, input, nowMs) {
  const c = cleanInput(input);
  const day = today(state, nowMs);
  const habit = {
    id: `h${nowMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: c.name,
    difficulty: c.difficulty,
    category: c.category,
    schedule: [{ from: day, days: c.days }],
    createdDay: day,
    order: nowMs,
  };
  state.habits[habit.id] = habit;
  mark(state, 'habits', habit.id, habit);
  return habit;
}

export function updateHabit(state, id, input, nowMs) {
  const habit = state.habits[id];
  if (!habit) throw new Error('습관을 찾을 수 없습니다.');
  const c = cleanInput(input);
  const day = today(state, nowMs);
  habit.name = c.name;
  habit.difficulty = c.difficulty;
  habit.category = c.category;
  if (c.days.join() !== currentDays(habit).join()) {
    const last = habit.schedule[habit.schedule.length - 1];
    if (last.from === day) last.days = c.days;
    else habit.schedule.push({ from: day, days: c.days });
  }
  mark(state, 'habits', id, habit);
  const perfect = awardPerfectIfDue(state, day);
  return { habit, perfect };
}

/** 습관을 지운다. 이미 받은 보상과 완료 기록은 그대로 둔다. */
export function deleteHabit(state, id, nowMs) {
  if (!state.habits[id]) return { ok: false };
  delete state.habits[id];
  mark(state, 'habits', id, undefined);
  const perfect = awardPerfectIfDue(state, today(state, nowMs));
  return { ok: true, perfect };
}

export const habitList = (state) => Object.values(state.habits).sort((a, b) => a.order - b.order);

/** 그날 해야 하는 습관 목록과 진행 상황 */
export function daySummary(state, day) {
  const habits = habitList(state).filter((h) => isScheduled(h, day));
  const done = habits.filter((h) => isDone(state, h.id, day)).length;
  return { habits, done, total: habits.length };
}

// ───────── 연속 기록과 보상 ─────────

/** day 바로 전까지 이 습관을 연속으로 지킨 날 수. 반복 요일이 아닌 날과 휴식일은 건너뛴다. */
export function streakBefore(state, habit, day) {
  let n = 0;
  for (let d = addDays(day, -1); d >= habit.createdDay; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    if (isDone(state, habit.id, d)) n++;
    else if (!state.days[d]?.rest) break; // 휴식일에 못 한 것은 연속 기록을 끊지 않는다
  }
  return n;
}

/** 오늘 완료했으면 오늘까지 포함한 연속 일수 */
export function currentStreak(state, habit, day) {
  return streakBefore(state, habit, day) + (isDone(state, habit.id, day) ? 1 : 0);
}

export const streakBonusPct = (streak) => Math.min(STREAK_MAX_PCT, STREAK_STEP_PCT * streak);

/** 낀 장비의 경험치 보너스 합계(%). 단계별 +2/4/6/8%, 합쳐서 최대 +20%. */
export function equipBonusPct(state) {
  const sum = Object.values(state.gear.equipped).reduce((n, id) => n + (id ? ITEMS[id].xpPct : 0), 0);
  return Math.min(EQUIP_BONUS_MAX_PCT, sum);
}

/**
 * 지금 이 습관을 완료하면 받을 보상.
 * 경험치 = 반올림(기본 × (1 + 연속 보너스)) + 장비 보너스.
 * 장비 보너스는 기본 경험치의 n%인데, +2% 같은 작은 값이 반올림에 묻혀 사라지지 않도록
 * 소수점을 gear.carry 에 모아 두었다가 1 XP가 찰 때마다 지급한다.
 */
export function rewardFor(state, habit, day) {
  const base = DIFFICULTY[habit.difficulty];
  const streak = streakBefore(state, habit, day);
  const bonusPct = streakBonusPct(streak);
  const equipPct = equipBonusPct(state);
  const equipCarry = base.xp * equipPct; // 1/100 XP 단위
  const equipXp = Math.floor((state.gear.carry + equipCarry) / 100);
  return {
    xp: Math.round((base.xp * (100 + bonusPct)) / 100) + equipXp,
    gold: base.gold,
    streak,
    bonusPct,
    equipPct,
    equipXp,
    equipCarry,
  };
}

function gainXp(state, amount) {
  const p = state.player;
  p.xp += amount;
  p.totalXp += amount;
  while (p.xp >= xpNeeded(p.level)) {
    p.xp -= xpNeeded(p.level);
    p.level++;
    p.hp = HP_MAX; // 레벨 업하면 HP를 가득 채운다
  }
}

/** 체크 취소용: 받았던 경험치를 그대로 되돌린다. 그 체크로 오른 레벨도 함께 되돌아간다. */
function takeBackXp(state, amount) {
  const p = state.player;
  p.xp -= amount;
  p.totalXp = Math.max(0, p.totalXp - amount);
  while (p.xp < 0 && p.level > 1) {
    p.level--;
    p.xp += xpNeeded(p.level);
  }
  if (p.xp < 0) p.xp = 0;
}

function dayRecord(state, day) {
  return (state.days[day] ??= { day, perfect: null });
}

/** 오늘 습관을 전부 끝냈고 아직 보너스를 안 받았으면 '완벽한 하루' 보너스를 준다. */
function awardPerfectIfDue(state, day) {
  const { done, total } = daySummary(state, day);
  if (!total || done < total || state.days[day]?.perfect) return null;
  const rec = dayRecord(state, day);
  rec.perfect = { ...PERFECT_DAY };
  mark(state, 'days', day, rec);
  gainXp(state, PERFECT_DAY.xp);
  state.player.gold += PERFECT_DAY.gold;
  markPlayer(state);
  state.battle.tickets += TICKET_PER_PERFECT_DAY;
  markBattle(state);
  return rec.perfect;
}

export function checkHabit(state, habitId, nowMs) {
  const day = today(state, nowMs);
  const habit = state.habits[habitId];
  if (!habit || !isScheduled(habit, day)) return { ok: false, reason: 'not-scheduled' };
  const id = completionId(day, habitId);
  if (state.completions[id]) return { ok: false, reason: 'already-done' };

  const reward = rewardFor(state, habit, day);
  const levelBefore = state.player.level;
  const rec = { id, day, habitId, at: nowMs, xp: reward.xp, gold: reward.gold };
  state.completions[id] = rec;
  mark(state, 'completions', id, rec);
  if (reward.equipCarry) {
    rec.equipCarry = reward.equipCarry;
    rec.equipXp = reward.equipXp;
    state.gear.carry = (state.gear.carry + reward.equipCarry) % 100;
    markGear(state);
  }

  const hpBefore = state.player.hp;
  state.player.hp = Math.min(HP_MAX, hpBefore + HP_PER_HABIT);
  gainXp(state, reward.xp);
  state.player.gold += reward.gold;
  markPlayer(state);
  const perfect = awardPerfectIfDue(state, day);
  rec.hp = state.player.hp - hpBefore; // 취소할 때 되돌릴 HP 변화량(레벨 업으로 채워진 것 포함)
  rec.tickets = TICKET_PER_HABIT;
  state.battle.tickets += TICKET_PER_HABIT;
  markBattle(state);

  return {
    ok: true,
    xp: reward.xp,
    gold: reward.gold,
    streak: reward.streak + 1,
    bonusPct: reward.bonusPct,
    perfect,
    levelBefore,
    levelAfter: state.player.level,
  };
}

/** 오늘 한 체크를 취소하고 받았던 보상(완벽한 하루 보너스 포함)을 되돌린다. */
export function uncheckHabit(state, habitId, nowMs) {
  const day = today(state, nowMs);
  const id = completionId(day, habitId);
  const rec = state.completions[id];
  if (!rec) return { ok: false, reason: 'not-done-today' };

  delete state.completions[id];
  mark(state, 'completions', id, undefined);

  let { xp, gold } = rec;
  if (rec.equipCarry) {
    // 이 체크가 보탠 장비 보너스 누적분을 빼고, 지급된 장비 보너스 총액이
    // '누적분 ÷ 100'과 다시 맞도록 되돌릴 경험치를 계산한다.
    xp -= rec.equipXp;
    state.gear.carry -= rec.equipCarry;
    while (state.gear.carry < 0) {
      state.gear.carry += 100;
      xp += 1;
    }
    markGear(state);
  }
  const dayRec = state.days[day];
  const perfect = dayRec?.perfect ?? null;
  // 받았던 전투 기회도 되돌린다. 이미 써 버렸다면 음수가 되고, 다시 채울 때까지 전투할 수 없다.
  state.battle.tickets -= rec.tickets ?? 0;
  if (perfect) {
    xp += perfect.xp;
    gold += perfect.gold;
    dayRec.perfect = null;
    mark(state, 'days', day, dayRec);
    state.battle.tickets -= TICKET_PER_PERFECT_DAY;
  }
  markBattle(state);
  const levelBefore = state.player.level;
  takeBackXp(state, xp);
  state.player.gold -= gold;
  state.player.hp = Math.min(HP_MAX, Math.max(1, state.player.hp - (rec.hp ?? 0)));
  markPlayer(state);

  return { ok: true, xp, gold, perfect, levelBefore, levelAfter: state.player.level };
}

// ───────── 상점 ─────────

export function buyItem(state, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { ok: false, reason: 'unknown' };
  if (state.gear.owned.includes(itemId)) return { ok: false, reason: 'owned' };
  if (state.player.level < item.level) return { ok: false, reason: 'locked', level: item.level };
  if (state.player.gold < item.price) return { ok: false, reason: 'no-gold', short: item.price - state.player.gold };
  state.player.gold -= item.price;
  state.gear.owned.push(itemId);
  state.gear.equipped[item.slot] = itemId; // 사면 바로 낀다
  markPlayer(state);
  markGear(state);
  return { ok: true, item };
}

/** 가진 장비를 끼거나(itemId), 그 부위를 비운다(itemId = null). */
export function equipItem(state, slot, itemId) {
  if (!SLOTS[slot]) return { ok: false, reason: 'unknown' };
  if (itemId !== null) {
    const item = ITEMS[itemId];
    if (!item || item.slot !== slot) return { ok: false, reason: 'unknown' };
    if (!state.gear.owned.includes(itemId)) return { ok: false, reason: 'not-owned' };
  }
  state.gear.equipped[slot] = itemId;
  markGear(state);
  return { ok: true };
}

/** 레벨이 오르면서 상점에 새로 열린 장비 단계들 */
export const tiersUnlockedBetween = (levelBefore, levelAfter) =>
  TIERS.filter((t) => t.level > levelBefore && t.level <= levelAfter);

// ───────── 전투 ─────────

/** 캐릭터의 전투 능력치: 레벨 기본값 + 낀 장비 */
export function battleStats(state) {
  const { level } = state.player;
  const s = { maxHp: 80 + 10 * level, atk: 6 + 2 * level, def: 0, cooldownPct: 0, feverPct: BASE_FEVER_PCT };
  for (const id of Object.values(state.gear.equipped)) {
    if (!id) continue;
    for (const [key, value] of Object.entries(ITEMS[id].stats)) s[key] += value;
  }
  return s;
}

export const nextStage = (state) => state.battle.cleared + 1;

/** 전투 기회 하나를 쓰고 전투를 시작한다. 중간에 나가도 기회는 돌아오지 않는다. */
export function beginBattle(state) {
  if (state.battle.tickets < 1) return { ok: false, reason: 'no-ticket' };
  state.battle.tickets -= 1;
  markBattle(state);
  return { ok: true, stage: nextStage(state), player: battleStats(state), monster: monsterFor(nextStage(state)) };
}

/** 전투 결과를 반영한다. 이기면 골드를 받고 다음 스테이지가 열린다. 져도 잃는 것은 없다. */
export function finishBattle(state, stage, won) {
  if (stage !== nextStage(state)) return { ok: false, reason: 'stale' };
  let gold = 0;
  if (won) {
    gold = monsterFor(stage).gold;
    state.battle.cleared = stage;
    state.battle.wins += 1;
    state.player.gold += gold;
    markPlayer(state);
  } else {
    state.battle.losses += 1;
  }
  markBattle(state);
  return { ok: true, won, gold };
}

// ───────── 휴식일 ─────────

/** 그 주(월~일)의 월요일 */
export const weekStart = (day) => addDays(day, -((weekdayOf(day) + 6) % 7));

/** 이번 주에 쓴 휴식일의 날짜. 안 썼으면 null. */
export function restDayOfWeek(state, day) {
  const start = weekStart(day);
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (state.days[d]?.rest) return d;
  }
  return null;
}

/** 오늘을 휴식일로 정하거나(일주일에 한 번) 오늘 정한 휴식일을 취소한다. */
export function setRestDay(state, on, nowMs) {
  const day = today(state, nowMs);
  if (on) {
    const used = restDayOfWeek(state, day);
    if (used) return { ok: false, reason: used === day ? 'already-on' : 'used-this-week', day: used };
  } else if (!state.days[day]?.rest) {
    return { ok: false, reason: 'not-rest-day' };
  }
  const rec = dayRecord(state, day);
  rec.rest = on;
  mark(state, 'days', day, rec);
  return { ok: true, day };
}

// ───────── 하루가 넘어갈 때의 벌칙 ─────────

/** 못 한 습관 수에 따른 HP 감소량 */
export const missPenalty = (missed) => Math.min(HP_MISS_DAY_MAX, HP_MISS * missed);

/** 지금 상태로 오늘이 끝나면 깎일 HP (화면 안내용) */
export function penaltyPreview(state, day) {
  const { done, total } = daySummary(state, day);
  const missed = total - done;
  return { missed, hpLoss: state.days[day]?.rest ? 0 : missPenalty(missed) };
}

/**
 * 앱을 열 때(또는 켜 둔 채 날짜가 바뀔 때) 부른다. 마지막으로 연 날부터 어제까지
 * 끝난 날들을 하루씩 정산한다. 벌칙은 앞에서부터 3일치까지만 적용하고 나머지는 그냥 넘긴다.
 * 알려 줄 내용이 있으면 '자리를 비운 동안' 요약을 state.progress.report 에 남긴다.
 */
export function processRollover(state, nowMs) {
  const day = today(state, nowMs);
  const prog = state.progress;
  if (!prog.lastDay) {
    prog.lastDay = day;
    markProgress(state);
    return null;
  }
  if (day <= prog.lastDay) return null; // 같은 날 다시 열었거나 시계가 뒤로 간 경우

  const p = state.player;
  const gap = daysBetween(prog.lastDay, day);
  const report = {
    days: [],
    forgiven: Math.max(0, gap - MAX_PENALTY_DAYS),
    hpBefore: p.hp,
    hpAfter: p.hp,
    xpLost: 0,
  };

  for (let i = 0; i < gap; i++) {
    const d = addDays(prog.lastDay, i);
    const { done, total } = daySummary(state, d);
    const rec = dayRecord(state, d);
    const applies = i < MAX_PENALTY_DAYS;
    const entry = { day: d, done, total, rest: Boolean(rec.rest), hpLoss: 0, knockedOut: false, xpLost: 0 };

    if (applies && !rec.rest && total > done) {
      entry.hpLoss = missPenalty(total - done);
      p.hp -= entry.hpLoss;
      if (p.hp <= 0) {
        // 레벨은 내려가지 않는다. 현재 레벨에서 쌓은 경험치의 10%만 잃고 다시 일어난다.
        entry.knockedOut = true;
        entry.xpLost = Math.floor((p.xp * KO_XP_LOSS_PCT) / 100);
        p.xp -= entry.xpLost;
        p.hp = HP_REVIVE;
        report.xpLost += entry.xpLost;
      }
    }
    // 그날의 결과를 굳혀 둔다. 나중에 습관을 지워도 기록 화면의 달력이 달라지지 않는다.
    Object.assign(rec, { total, done, hpLoss: entry.hpLoss });
    mark(state, 'days', d, rec);
    if (applies) report.days.push(entry);
  }

  report.hpAfter = p.hp;
  prog.lastDay = day;
  const notable = report.forgiven > 0 || report.days.some((e) => e.total > e.done);
  if (notable) prog.report = report;
  markPlayer(state);
  markProgress(state);
  return notable ? report : null;
}

export function dismissReport(state) {
  state.progress.report = null;
  markProgress(state);
}

// ───────── 기록 화면용 통계 ─────────

/**
 * 그날의 완료 현황. 정산이 끝난 날은 그때 굳혀 둔 숫자를 쓰고,
 * 오늘처럼 아직 진행 중인 날은 현재 습관 목록으로 계산한다.
 */
export function dayResult(state, day, todayKey) {
  const rec = state.days[day];
  const frozen = day < todayKey && rec?.total !== undefined;
  const { done, total } = frozen ? rec : daySummary(state, day);
  return {
    day,
    done,
    total,
    ratio: total ? done / total : null, // 예정된 습관이 없던 날은 null
    rest: Boolean(rec?.rest),
    perfect: Boolean(rec?.perfect),
    hpLoss: rec?.hpLoss ?? 0,
  };
}

/** 오늘을 포함한 최근 count 일 (오래된 날부터) */
export function recentDays(state, todayKey, count = 30) {
  return Array.from({ length: count }, (_, i) => dayResult(state, addDays(todayKey, i - count + 1), todayKey));
}

/** 이 습관의 역대 최고 연속 일수 */
export function bestStreak(state, habit, todayKey) {
  let best = 0;
  let run = 0;
  for (let d = habit.createdDay; d <= todayKey; d = addDays(d, 1)) {
    if (!isScheduled(habit, d)) continue;
    if (isDone(state, habit.id, d)) best = Math.max(best, ++run);
    else if (d < todayKey && !state.days[d]?.rest) run = 0;
  }
  return best;
}

export function totals(state) {
  return {
    totalXp: state.player.totalXp,
    completions: Object.keys(state.completions).length,
    perfectDays: Object.values(state.days).filter((d) => d.perfect).length,
  };
}

// ───────── 설정 ─────────

export function setDayStartHour(state, hour) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error('0시부터 23시 사이로 골라 주세요.');
  state.settings.dayStartHour = h;
  markSettings(state);
}

export function markBackedUp(state, nowMs) {
  state.settings.lastBackupAt = nowMs;
  markSettings(state);
}

export function setDebugOffset(state, offsetMs) {
  state.settings.debugOffsetMs = offsetMs;
  markSettings(state);
}
