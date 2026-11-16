// JSON 백업 내보내기·가져오기. 화면이나 저장소를 건드리지 않는 순수 함수만 둔다.
// 가져올 때는 파일 내용을 믿지 않고 항목마다 형식을 검사한다.
import { CATEGORY, DIFFICULTY, HP_MAX, ITEMS, NAME_MAX, SLOTS, createState } from './game.js';

export const BACKUP_APP = 'habit-rpg';
export const BACKUP_VERSION = 1;

/** 현재 상태를 백업용 객체로 만든다. */
export function exportData(state, nowMs) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(nowMs).toISOString(),
    player: { ...state.player },
    settings: { dayStartHour: state.settings.dayStartHour },
    progress: { lastDay: state.progress.lastDay },
    gear: { owned: [...state.gear.owned], equipped: { ...state.gear.equipped }, carry: state.gear.carry },
    habits: Object.values(state.habits),
    completions: Object.values(state.completions),
    days: Object.values(state.days),
  };
}

class BackupError extends Error {}
const fail = (what) => {
  throw new BackupError(`백업 파일을 읽을 수 없어요. (${what})`);
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isHabitId = (v) => typeof v === 'string' && /^h[0-9a-z]{1,40}$/.test(v);
const optInt = (v, min, max) => v === undefined || isInt(v, min, max);
const BIG = 1e9;

function readHabit(h, i) {
  const where = `습관 ${i + 1}번`;
  if (!isObj(h) || !isHabitId(h.id)) fail(where);
  if (typeof h.name !== 'string' || !h.name.trim() || h.name.length > NAME_MAX) fail(`${where} 이름`);
  if (!Object.hasOwn(DIFFICULTY, h.difficulty) || !Object.hasOwn(CATEGORY, h.category)) fail(`${where} 난이도·분야`);
  if (!isDay(h.createdDay) || typeof h.order !== 'number' || !Number.isFinite(h.order)) fail(where);
  if (!Array.isArray(h.schedule) || !h.schedule.length || h.schedule.length > 1000) fail(`${where} 반복 요일`);
  const schedule = h.schedule.map((entry) => {
    if (!isObj(entry) || !isDay(entry.from) || !Array.isArray(entry.days) || !entry.days.length) fail(`${where} 반복 요일`);
    if (!entry.days.every((d) => isInt(d, 0, 6))) fail(`${where} 반복 요일`);
    return { from: entry.from, days: [...new Set(entry.days)].sort() };
  });
  schedule.sort((a, b) => (a.from < b.from ? -1 : 1));
  return { id: h.id, name: h.name.trim(), difficulty: h.difficulty, category: h.category, schedule, createdDay: h.createdDay, order: h.order };
}

function readCompletion(c, i) {
  const where = `완료 기록 ${i + 1}번`;
  if (!isObj(c) || !isDay(c.day) || !isHabitId(c.habitId) || c.id !== `${c.day}|${c.habitId}`) fail(where);
  if (!isInt(c.xp, 0, BIG) || !isInt(c.gold, 0, BIG)) fail(where);
  if (!optInt(c.hp, -HP_MAX, HP_MAX) || !optInt(c.equipCarry, 0, BIG) || !optInt(c.equipXp, 0, BIG)) fail(where);
  const rec = { id: c.id, day: c.day, habitId: c.habitId, at: Number.isFinite(c.at) ? c.at : 0, xp: c.xp, gold: c.gold };
  for (const key of ['hp', 'equipCarry', 'equipXp']) if (c[key] !== undefined) rec[key] = c[key];
  return rec;
}

function readDay(d, i) {
  const where = `날짜 기록 ${i + 1}번`;
  if (!isObj(d) || !isDay(d.day)) fail(where);
  let perfect = null;
  if (d.perfect != null) {
    if (!isObj(d.perfect) || !isInt(d.perfect.xp, 0, BIG) || !isInt(d.perfect.gold, 0, BIG)) fail(where);
    perfect = { xp: d.perfect.xp, gold: d.perfect.gold };
  }
  if (!optInt(d.total, 0, BIG) || !optInt(d.done, 0, BIG) || !optInt(d.hpLoss, 0, HP_MAX)) fail(where);
  const rec = { day: d.day, perfect };
  if (d.rest) rec.rest = true;
  for (const key of ['total', 'done', 'hpLoss']) if (d[key] !== undefined) rec[key] = d[key];
  return rec;
}

/**
 * 백업 파일 내용(문자열)을 검사해서 앱 상태로 바꾼다. 문제가 있으면 한국어 안내와 함께 오류를 던진다.
 * 돌려준 상태는 아직 저장되지 않은 것이므로 db.replaceAll 로 저장해야 한다.
 */
export function importData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('백업 파일이 아니에요. JSON 형식을 읽을 수 없습니다.');
  }
  if (!isObj(data) || data.app !== BACKUP_APP) throw new BackupError('이 앱에서 내보낸 백업 파일이 아니에요.');
  if (!isInt(data.version, 1)) fail('버전');
  if (data.version > BACKUP_VERSION) throw new BackupError('더 새로운 버전의 앱에서 만든 백업이에요. 앱을 업데이트한 뒤 다시 시도해 주세요.');

  const state = createState();

  const p = data.player;
  if (!isObj(p) || !isInt(p.level, 1, 100000) || !isInt(p.xp, 0, BIG) || !isInt(p.totalXp, 0, BIG)) fail('캐릭터');
  if (!isInt(p.gold, -BIG, BIG) || !isInt(p.hp, 1, HP_MAX)) fail('캐릭터');
  state.player = { level: p.level, xp: p.xp, totalXp: p.totalXp, gold: p.gold, hp: p.hp };

  if (!isObj(data.settings) || !isInt(data.settings.dayStartHour, 0, 23)) fail('설정');
  state.settings.dayStartHour = data.settings.dayStartHour;

  const lastDay = data.progress?.lastDay ?? null;
  if (lastDay !== null && !isDay(lastDay)) fail('진행 상황');
  state.progress.lastDay = lastDay;

  const g = data.gear;
  if (!isObj(g) || !Array.isArray(g.owned) || !isObj(g.equipped) || !isInt(g.carry, 0, 99)) fail('장비');
  if (!g.owned.every((id) => typeof id === 'string' && Object.hasOwn(ITEMS, id))) fail('장비');
  state.gear.owned = [...new Set(g.owned)];
  for (const slot of Object.keys(SLOTS)) {
    const id = g.equipped[slot] ?? null;
    if (id !== null && (!state.gear.owned.includes(id) || ITEMS[id].slot !== slot)) fail('낀 장비');
    state.gear.equipped[slot] = id;
  }
  state.gear.carry = g.carry;

  for (const [key, max] of [['habits', 1000], ['completions', 1000000], ['days', 100000]]) {
    if (!Array.isArray(data[key]) || data[key].length > max) fail(key);
  }
  for (const h of data.habits.map(readHabit)) state.habits[h.id] = h;
  for (const c of data.completions.map(readCompletion)) state.completions[c.id] = c;
  for (const d of data.days.map(readDay)) state.days[d.day] = d;
  if (Object.keys(state.habits).length !== data.habits.length) fail('습관 id 중복');

  return state;
}

/** 가져오기 전에 보여 줄 한 줄 요약 */
export function describeBackup(data) {
  return {
    level: data.player.level,
    habits: Object.keys(data.habits).length,
    completions: Object.keys(data.completions).length,
  };
}
