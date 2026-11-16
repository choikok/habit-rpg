// 전투 규칙. 화면이나 저장소를 건드리지 않는 순수 계산이라 Node에서 그대로 시험할 수 있다.
// 캐릭터는 자동으로 공격하고, 스킬만 직접 누른다. 시간은 0.1초 단위(TICK_MS)로 흐른다.

export const TICK_MS = 100;
export const PLAYER_INTERVAL_MS = 1000; // 평소 공격 간격
export const FEVER_INTERVAL_MS = 500; // 피버 중 공격 간격 (두 배 빠르다)
export const FEVER_MS = 4000; // 피버 지속 시간
export const SKILL_COOLDOWN_MS = 8000; // 스킬 기본 쿨타임
export const SKILL_MULT = 3; // 스킬 피해 = 공격력 × 3
export const TIME_LIMIT_MS = 60000; // 한 판 제한 시간

const KINDS = ['jelly', 'mushroom', 'bat', 'golem']; // 일반 몬스터 4종이 차례로 나온다
const KIND_NAME = { jelly: '말랑 젤리', mushroom: '성난 버섯', bat: '밤 박쥐', golem: '돌 거인', imp: '불꽃 도깨비' };
const RANK_PREFIX = ['', '사나운 ', '강철 ', '어둠의 ', '전설의 '];

/**
 * 스테이지 번호(1부터)에 해당하는 몬스터. 끝없이 이어지고, 5의 배수 스테이지는 보스다.
 * rank 는 5스테이지마다 오르는 단계로, 이름 앞머리와 색이 바뀐다.
 */
export function monsterFor(stage) {
  const n = stage - 1;
  const boss = stage % 5 === 0;
  const rank = Math.floor(n / 5);
  const kind = boss ? 'imp' : KINDS[n % 5];
  const prefix = RANK_PREFIX[Math.min(rank, RANK_PREFIX.length - 1)];
  const hp = 30 + 18 * n + 1.5 * n * n;
  const atk = 5 + 1.6 * n;
  return {
    stage,
    kind,
    boss,
    rank,
    name: `${prefix}${KIND_NAME[kind]}${boss ? ' 대장' : ''}`,
    hp: Math.round(hp * (boss ? 1.8 : 1)),
    atk: Math.round(atk * (boss ? 1.25 : 1)),
    def: Math.floor(n / 4),
    intervalMs: boss ? 1800 : 1500,
    gold: (3 + Math.floor(stage / 2)) * (boss ? 3 : 1),
  };
}

export const skillCooldownMs = (player) => Math.round((SKILL_COOLDOWN_MS * (100 - player.cooldownPct)) / 100);

/** 피해량: (공격력 − 방어력)에 ±10% 흔들림, 최소 1 */
const roll = (power, rng) => Math.max(1, Math.round(power * (0.9 + 0.2 * rng())));

/**
 * 전투를 시작한다.
 * @param player { maxHp, atk, def, cooldownPct, feverPct }
 * @param monster monsterFor() 의 결과
 */
export function createBattle(player, monster) {
  return {
    t: 0,
    player: { ...player, hp: player.maxHp },
    monster: { ...monster, maxHp: monster.hp },
    nextPlayerAt: 500,
    nextMonsterAt: monster.intervalMs,
    skillAt: Math.round(skillCooldownMs(player) / 2), // 첫 스킬은 절반만 기다리면 된다
    feverUntil: 0,
    result: null, // 'win' | 'lose' | 'timeout'
  };
}

export const inFever = (b) => b.t < b.feverUntil;
export const skillReady = (b) => !b.result && b.t >= b.skillAt;

/**
 * 0.1초만큼 전투를 진행하고 그동안 일어난 일을 돌려준다.
 * @param rng 0 이상 1 미만의 난수를 주는 함수
 * @param useSkill 이번 틱에 스킬 버튼을 눌렀는지
 */
export function step(b, rng, useSkill = false) {
  if (b.result) return [];
  const events = [];
  b.t += TICK_MS;
  const { player, monster } = b;

  if (useSkill && b.t >= b.skillAt) {
    const dmg = Math.max(1, Math.round(player.atk * SKILL_MULT - monster.def));
    monster.hp -= dmg;
    b.skillAt = b.t + skillCooldownMs(player);
    events.push({ type: 'skill', dmg });
  }

  if (monster.hp > 0 && b.t >= b.nextPlayerAt) {
    const fever = inFever(b);
    const dmg = roll(player.atk - monster.def, rng);
    monster.hp -= dmg;
    events.push({ type: 'hit', dmg, fever });
    if (!fever && rng() * 100 < player.feverPct) {
      b.feverUntil = b.t + FEVER_MS;
      events.push({ type: 'fever' });
    }
    b.nextPlayerAt += inFever(b) ? FEVER_INTERVAL_MS : PLAYER_INTERVAL_MS;
  }

  if (monster.hp <= 0) {
    monster.hp = 0;
    b.result = 'win';
  } else if (b.t >= b.nextMonsterAt) {
    const dmg = roll(monster.atk - player.def, rng);
    player.hp -= dmg;
    b.nextMonsterAt += monster.intervalMs;
    events.push({ type: 'hurt', dmg });
    if (player.hp <= 0) {
      player.hp = 0;
      b.result = 'lose';
    }
  }
  if (!b.result && b.t >= TIME_LIMIT_MS) b.result = 'timeout';
  if (b.result) events.push({ type: 'end', result: b.result });
  return events;
}

/** 끝까지 자동으로 돌린다(스킬은 준비되는 대로 사용). 시험과 균형 조정에 쓴다. */
export function simulate(player, monster, rng) {
  const b = createBattle(player, monster);
  while (!b.result) step(b, rng, skillReady(b));
  return b;
}

/** 같은 씨앗이면 같은 순서의 난수가 나오는 난수기 (시험용) */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
