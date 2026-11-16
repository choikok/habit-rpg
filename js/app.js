// 화면과 사용자 입력. 규칙 계산은 game.js, 저장은 db.js 에 맡긴다.
import * as G from './game.js';
import * as DB from './db.js';
import { characterSVG, iconViewBox } from './character.js';
import { describeBackup, exportData, importData } from './backup.js';
import * as B from './battle.js';
import { monsterSVG } from './monsters.js';
import { SUGGESTIONS, suggestionList } from './suggestions.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const BATTLE_SPEED = DEBUG ? Number(PARAMS.get('speed')) || 1 : 1; // 시험할 때 전투를 빨리 돌린다 (?debug&speed=5)
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월요일부터 보여 준다
const WEEK_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

let state;
let currentDay;
let logSelected; // 기록 화면 달력에서 고른 날짜
let installPrompt = null; // 브라우저가 건네준 '홈 화면에 설치' 요청
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');

const now = () => Date.now() + state.settings.debugOffsetMs;
const today = () => G.today(state, now());

// ───────── 표시용 문구 ─────────

function levelTitle(level) {
  if (level >= 20) return '전설의 모험가';
  if (level >= 15) return '베테랑 모험가';
  if (level >= 10) return '숙련 모험가';
  if (level >= 5) return '견습 모험가';
  return '새내기 모험가';
}

function formatDay(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK_LABEL[G.weekdayOf(key)]})`;
}

function daysLabel(days) {
  const s = [...days].sort().join('');
  if (s === '0123456') return '매일';
  if (s === '12345') return '평일';
  if (s === '06') return '주말';
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => WEEK_LABEL[d]).join('·');
}

function hourLabel(h) {
  if (h === 0) return '자정 (0시)';
  if (h === 12) return '정오 (12시)';
  if (h < 6) return `새벽 ${h}시`;
  if (h < 12) return `오전 ${h}시`;
  return `오후 ${h - 12}시`;
}

/** 받침이 있으면 '을', 없으면 '를' */
const eul = (word) => ((word.charCodeAt(word.length - 1) - 0xac00) % 28 ? '을' : '를');

/** 장비의 전투 능력치를 한 줄로 */
function statText(stats) {
  const parts = [];
  if (stats.atk) parts.push(`공격 +${stats.atk}`);
  if (stats.def) parts.push(`방어 +${stats.def}`);
  if (stats.cooldownPct) parts.push(`쿨타임 −${stats.cooldownPct}%`);
  if (stats.feverPct) parts.push(`피버 +${stats.feverPct}%`);
  return parts.join(' · ');
}

const rewardText = (xp, gold) => `+${xp} XP · +${gold} G`;

// ───────── 저장 ─────────

function save() {
  return DB.flush(state).catch((err) => {
    console.error(err);
    toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
  });
}

// ───────── 오늘 화면 ─────────

function updateHero({ leveledUp = false } = {}) {
  const p = state.player;
  $('#hero-level').textContent = p.level;
  $('#hero-title').textContent = levelTitle(p.level);
  $('#hero-gold').textContent = p.gold.toLocaleString('ko-KR');
  $('#hero-gold').parentElement.classList.toggle('is-neg', p.gold < 0);
  $('#xp-num').textContent = `${p.xp} / ${G.xpNeeded(p.level)}`;

  $('#hp-num').textContent = `${p.hp} / ${G.HP_MAX}`;
  $('#hp-fill').style.width = `${(p.hp / G.HP_MAX) * 100}%`;
  $('.bar.hp').classList.toggle('is-low', p.hp <= G.HP_MISS_DAY_MAX);

  const fill = $('#xp-fill');
  const xpPct = () => `${(state.player.xp / G.xpNeeded(state.player.level)) * 100}%`;
  if (leveledUp) {
    // 막대를 끝까지 채운 뒤 비우고, 새 레벨의 경험치만큼 다시 채운다.
    fill.style.width = '100%';
    setTimeout(() => {
      fill.classList.add('no-anim');
      fill.style.width = '0%';
      void fill.offsetWidth;
      fill.classList.remove('no-anim');
      fill.style.width = xpPct();
    }, 560);
  } else {
    fill.style.width = xpPct();
  }

  const { done, total } = G.daySummary(state, currentDay);
  $('#progress-num').textContent = `${done} / ${total}`;
  $('#progress-fill').style.width = total ? `${(done / total) * 100}%` : '0%';

  // 화면 낭독기용 수치
  const say = (sel, value, max) => {
    const bar = $(sel);
    bar.setAttribute('aria-valuemin', 0);
    bar.setAttribute('aria-valuemax', max);
    bar.setAttribute('aria-valuenow', value);
  };
  say('.bar.hp', p.hp, G.HP_MAX);
  say('.bar.xp', p.xp, G.xpNeeded(p.level));
  say('.bar.progress', done, total);
}

function habitRow(habit) {
  const done = G.isDone(state, habit.id, currentDay);
  const streak = G.currentStreak(state, habit, currentDay);
  let reward;
  let streakText = '';
  if (done) {
    const rec = state.completions[`${currentDay}|${habit.id}`];
    reward = `획득 ${rewardText(rec.xp, rec.gold)}`;
    if (streak >= 2) streakText = `🔥 ${streak}일 연속`;
  } else {
    const r = G.rewardFor(state, habit, currentDay);
    reward = rewardText(r.xp, r.gold);
    if (streak >= 1) streakText = `🔥 ${streak}일 연속 · 보너스 +${r.bonusPct}%`;
  }
  return `
    <li>
      <button type="button" class="habit cat-${habit.category}${done ? ' is-done' : ''}"
        data-action="toggle" data-id="${habit.id}" aria-pressed="${done}">
        <span class="habit-main">
          <span class="habit-name">${esc(habit.name)}</span>
          <span class="habit-meta">
            <span class="chip">${G.DIFFICULTY[habit.difficulty].label}</span>
            ${streakText ? `<span class="streak">${streakText}</span>` : ''}
            <span class="reward">${reward}</span>
          </span>
        </span>
        <span class="check">${CHECK_ICON}</span>
      </button>
    </li>`;
}

function renderToday({ justDoneId } = {}) {
  $('#today-date').textContent = formatDay(currentDay);
  const { habits, done } = G.daySummary(state, currentDay);
  const list = $('#habit-list');

  if (habits.length) {
    list.innerHTML = habits.map(habitRow).join('');
  } else if (Object.keys(state.habits).length) {
    list.innerHTML = '<li class="empty-today">오늘은 예정된 습관이 없어요.<br>푹 쉬고 내일 만나요!</li>';
  } else {
    list.innerHTML = `
      <li class="empty-today">아직 습관이 없어요.<br>추천에서 고르면 입력 없이 바로 시작할 수 있어요.
        <br><button type="button" class="btn primary" data-action="suggest">✨ 추천 습관 고르기</button>
        <br><button type="button" class="link-btn" data-action="add-habit">직접 만들기</button></li>`;
  }
  if (justDoneId) $(`[data-id="${justDoneId}"]`, list)?.classList.add('just-done');

  const perfect = state.days[currentDay]?.perfect;
  const banner = $('#perfect-banner');
  banner.hidden = !perfect;
  if (perfect) banner.textContent = `✨ 완벽한 하루! ${rewardText(perfect.xp, perfect.gold)}`;

  // 휴식일
  const rest = Boolean(state.days[currentDay]?.rest);
  const usedOn = G.restDayOfWeek(state, currentDay);
  $('#rest-banner').hidden = !rest;
  const restBox = $('#rest-box');
  if (rest || !habits.length) restBox.innerHTML = '';
  else if (usedOn) restBox.innerHTML = `<p class="muted">이번 주 휴식일은 ${formatDay(usedOn)}에 썼어요. 월요일에 다시 생겨요.</p>`;
  else restBox.innerHTML = '<button type="button" class="btn small" data-action="rest-on">🛌 오늘을 휴식일로 (이번 주 1번 남음)</button>';

  // 안내: 이대로 하루가 끝나면 깎일 HP, 그리고 취소 방법
  const { missed, hpLoss } = G.penaltyPreview(state, currentDay);
  const lines = [];
  if (hpLoss) lines.push(`남은 습관 ${missed}개 · 이대로 하루가 넘어가면 <b>HP −${hpLoss}</b>`);
  if (done) lines.push('완료한 습관을 다시 누르면 오늘 안에는 취소할 수 있어요.');
  $('#today-hint').innerHTML = lines.join('<br>');
  $('#today-hint').hidden = !lines.length;
}

function setRest(on) {
  if (syncDay()) return;
  const res = G.setRestDay(state, on, now());
  if (!res.ok) return;
  save();
  renderToday();
  toast(on ? '오늘은 휴식일! 푹 쉬어도 HP가 깎이지 않아요.' : '휴식일을 취소했어요.');
}

// ───────── 자리를 비운 동안 ─────────

function showAwayReport() {
  const report = state.progress.report;
  if (!report) return;
  $('.report')?.closest('.backdrop').remove(); // 이미 떠 있으면 새 내용으로 바꾼다

  const rows = report.days.map((e) => {
    let result;
    let sub = `${e.done}/${e.total} 완료`;
    if (!e.total) { result = '<span class="safe">벌칙 없음</span>'; sub = '예정된 습관 없음'; }
    else if (e.rest) { result = '<span class="safe">벌칙 없음</span>'; sub = `휴식일 · ${sub}`; }
    else if (e.hpLoss) result = `<span class="loss">HP −${e.hpLoss}</span>`;
    else result = '<span class="safe">모두 완료</span>';
    const ko = e.knockedOut
      ? `<span class="report-ko">HP가 0이 되어 경험치를 ${e.xpLost} 잃고, HP ${G.HP_REVIVE}로 다시 일어났어요. 레벨은 그대로예요.</span>`
      : '';
    return `<li><span class="report-day"><b>${formatDay(e.day)}</b>${result}</span><span class="report-sub">${sub}</span>${ko}</li>`;
  }).join('');

  const forgiven = report.forgiven
    ? `<p class="report-note">그 뒤 ${report.forgiven}일은 벌칙 없이 넘어갔어요. (벌칙은 최대 ${G.MAX_PENALTY_DAYS}일치까지만)</p>`
    : '';

  const { el, close } = openOverlay(
    `<div class="dialog report" role="alertdialog" aria-modal="true" aria-label="자리를 비운 동안">
      <h2>자리를 비운 동안</h2>
      <ul class="report-days">${rows}</ul>
      ${forgiven}
      <div class="report-total"><span>HP</span><span>${report.hpBefore} → ${report.hpAfter}</span></div>
      <p class="report-note">오늘 습관을 하나 완료할 때마다 HP가 ${G.HP_PER_HABIT}씩 회복돼요.</p>
      <button type="button" class="btn primary block" data-report-ok>확인</button>
    </div>`,
    { center: true, onDismiss: confirmReport },
  );
  $('[data-report-ok]', el).addEventListener('click', () => {
    close();
    confirmReport();
  });
  $('[data-report-ok]', el).focus();
}

function confirmReport() {
  G.dismissReport(state);
  save();
}

function toggleHabit(button) {
  if (syncDay()) {
    toast('하루가 넘어가서 목록을 새로 불러왔어요.');
    return;
  }
  const id = button.dataset.id;
  const rect = $('.check', button).getBoundingClientRect();
  const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const wasDone = G.isDone(state, id, currentDay);
  const res = wasDone ? G.uncheckHabit(state, id, now()) : G.checkHabit(state, id, now());
  if (!res.ok) return;
  save();

  const leveledUp = res.levelAfter > res.levelBefore;
  renderToday({ justDoneId: wasDone ? null : id });
  updateHero({ leveledUp });

  if (wasDone) {
    updateBattleBadge();
    spawnFloat(at, `<span class="xp">−${res.xp} XP</span><span class="g">−${res.gold} G</span>`, 'minus');
    toast(res.perfect ? '체크를 취소했어요. 완벽한 하루 보너스도 되돌렸습니다.' : '체크를 취소하고 보상을 되돌렸어요.');
    return;
  }

  spawnFloat(at, `<span class="xp">+${res.xp} XP</span><span class="g">+${res.gold} G</span>`);
  updateBattleBadge(true);
  burst(at, getComputedStyle(button).getPropertyValue('--cat'));
  navigator.vibrate?.(leveledUp ? [30, 40, 60] : res.perfect ? [18, 40, 30] : 18);
  cheer();
  replay($('#hero-gold'), 'bump');
  replay($('#xp-num'), 'bump');
  replay($('.bar.xp'), 'gain');
  if (res.perfect) {
    replay($('#perfect-banner'), 'pop');
    setTimeout(() => {
      spawnFloat({ x: innerWidth / 2, y: innerHeight * 0.42 },
        `<span class="g">✨ 완벽한 하루!</span> <span class="xp">+${res.perfect.xp} XP</span><span class="g">+${res.perfect.gold} G</span>`);
      if (!leveledUp) confetti($('#fx-layer'), 28);
    }, 350);
  }
  if (leveledUp) setTimeout(() => showLevelUp(res.levelBefore, res.levelAfter), 650);
}

/** 애니메이션 클래스를 떼었다 붙여서 다시 재생한다 */
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** 체크한 자리에서 작은 불꽃이 퍼진다 */
function burst({ x, y }, color) {
  if (calmMotion.matches) return;
  for (let i = 0; i < 9; i++) {
    const el = document.createElement('i');
    const angle = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
    const dist = 30 + Math.random() * 20;
    el.className = 'spark';
    el.style.cssText = `left:${x}px;top:${y}px;background:${i % 3 ? color : '#ffcf5c'};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px`;
    el.addEventListener('animationend', () => el.remove());
    $('#fx-layer').append(el);
  }
}

/** 색종이가 위에서 떨어진다 */
function confetti(container, count) {
  if (calmMotion.matches) return;
  const colors = ['#ffcf5c', '#8b7bff', '#5ad1ff', '#ff7a6b', '#5fd68a', '#ffffff'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    const r = Math.random;
    el.className = 'confetti';
    el.style.cssText = `left:${r() * 100}%;width:${6 + r() * 6}px;height:${9 + r() * 8}px;background:${colors[i % colors.length]};`
      + `animation-delay:${r() * 0.7}s;animation-duration:${1.8 + r() * 1.6}s;--drift:${(r() - 0.5) * 140}px;--spin:${r() * 900 - 450}deg`;
    el.addEventListener('animationend', () => el.remove());
    container.append(el);
  }
}

function cheer(el = $('#hero-char')) {
  el.classList.remove('cheer');
  void el.offsetWidth;
  el.classList.add('cheer');
}

// ───────── 연출 ─────────

function spawnFloat({ x, y }, html, cls = '') {
  const el = document.createElement('div');
  el.className = `float ${cls}`;
  el.innerHTML = html;
  el.style.left = `${Math.min(Math.max(x, 90), innerWidth - 90)}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  $('#fx-layer').append(el);
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = true;
  void el.offsetWidth; // 같은 문구가 연달아 떠도 애니메이션이 다시 돌게 한다
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

function showLevelUp(levelBefore, level) {
  const unlocked = G.tiersUnlockedBetween(levelBefore, level).map((t) => {
    const names = Object.values(G.ITEMS).filter((i) => i.tier === t.tier).map((i) => i.name).join(' · ');
    return `<div class="unlock"><b>🛒 상점에 ${t.tier}단계 장비가 열렸어요</b><span>${names}</span></div>`;
  }).join('');
  const el = document.createElement('div');
  el.className = 'levelup';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `레벨 ${level} 달성`);
  el.innerHTML = `
    <div class="levelup-rays"></div>
    <div class="levelup-confetti"></div>
    <div class="levelup-inner">
      <div class="tag">레벨 업!</div>
      <div class="char">${characterSVG(state.gear.equipped)}</div>
      <div class="lv">Lv.${level}</div>
      <p>${levelTitle(level)} · HP 가득 회복<br>다음 레벨까지 ${G.xpNeeded(level)} XP</p>
      ${unlocked}
      <button type="button" class="btn primary">계속하기</button>
    </div>`;
  el.addEventListener('click', () => el.remove());
  $('#overlay-root').append(el);
  confetti($('.levelup-confetti', el), 60);
  $('button', el).focus();
}

function alertDialog({ title, body }) {
  const { el, close } = openOverlay(
    `<div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <button type="button" class="btn primary block">확인</button>
    </div>`,
    { center: true },
  );
  $('button', el).addEventListener('click', close);
}

// ───────── 시트와 대화 상자 ─────────

function openOverlay(html, { center = false, onDismiss } = {}) {
  const el = document.createElement('div');
  el.className = `backdrop${center ? ' center' : ''}`;
  el.innerHTML = html;
  const close = () => el.remove();
  $('#toast').hidden = true; // 시트 위에 앞선 알림이 겹치지 않게
  el.addEventListener('click', (e) => {
    if (e.target !== el) return;
    close();
    onDismiss?.();
  });
  $('#overlay-root').append(el);
  return { el, close };
}

function confirmDialog({ title, body, okLabel, danger = false }) {
  return new Promise((resolve) => {
    const { el, close } = openOverlay(
      `<div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        <p>${esc(body)}</p>
        <div class="dialog-actions">
          <button type="button" class="btn" data-answer="no">취소</button>
          <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-answer="yes">${esc(okLabel)}</button>
        </div>
      </div>`,
      { center: true, onDismiss: () => resolve(false) },
    );
    el.addEventListener('click', (e) => {
      const answer = e.target.closest('[data-answer]')?.dataset.answer;
      if (!answer) return;
      close();
      resolve(answer === 'yes');
    });
    $('[data-answer="no"]', el).focus();
  });
}

function openHabitForm(habit) {
  const v = habit
    ? { name: habit.name, difficulty: habit.difficulty, category: habit.category, days: G.currentDays(habit) }
    : { name: '', difficulty: 'normal', category: 'life', days: G.ALL_DAYS };

  const radios = (name, options, current) =>
    options.map(([value, label, sub, color]) => `
      <label${color ? ` style="--pick: var(--cat-${value})"` : ''}>
        <input type="radio" name="${name}" value="${value}"${value === current ? ' checked' : ''}>
        <span>${label}${sub ? `<small>${sub}</small>` : ''}</span>
      </label>`).join('');

  // 추천: 새 습관을 만들 때만 고를 수 있다. 수정할 때는 연결만 유지한다.
  let tpl = habit?.templateId ?? null;
  const used = G.usedTemplateIds(state);
  const chips = (category) => suggestionList().filter((s) => s.category === category).map((s) => `
    <button type="button" class="sug-chip" data-tpl="${s.id}"${used.has(s.id) ? ' disabled' : ''}>
      ${s.emoji} ${s.title}${used.has(s.id) ? ' ✓' : ''}</button>`).join('');
  const suggestBox = habit ? '' : `
      <fieldset class="field">
        <legend>추천에서 고르기</legend>
        <div class="sug-tabs">
          ${Object.entries(G.CATEGORY).map(([k, c], i) => `
            <button type="button" class="sug-tab cat-${k}${i ? '' : ' is-on'}" data-sug-cat="${k}">${c.label}</button>`).join('')}
        </div>
        <div class="sug-chips" id="sug-chips">${chips(Object.keys(G.CATEGORY)[0])}</div>
      </fieldset>`;

  const { el, close } = openOverlay(`
    <form class="sheet" role="dialog" aria-modal="true" aria-label="${habit ? '습관 수정' : '습관 추가'}" novalidate>
      <h2>${habit ? '습관 수정' : '새 습관'}</h2>${suggestBox}
      <label class="field">
        <span>이름</span>
        <input type="text" name="name" maxlength="${G.NAME_MAX}" value="${esc(v.name)}" placeholder="예: 물 마시기" autocomplete="off">
      </label>
      <fieldset class="field">
        <legend>난이도</legend>
        <div class="seg cols-3">
          ${radios('difficulty', Object.entries(G.DIFFICULTY).map(([k, d]) => [k, d.label, `+${d.xp} XP · +${d.gold} G`]), v.difficulty)}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>분야</legend>
        <div class="seg cols-4">
          ${radios('category', Object.entries(G.CATEGORY).map(([k, c]) => [k, c.label, '', true]), v.category)}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>반복 요일</legend>
        <div class="seg cols-7">
          ${WEEK_ORDER.map((d) => `
            <label><input type="checkbox" name="days" value="${d}"${v.days.includes(d) ? ' checked' : ''}><span>${WEEK_LABEL[d]}</span></label>`).join('')}
        </div>
        <div class="field-foot"><button type="button" class="link-btn" data-every-day>매일로 설정</button></div>
      </fieldset>
      <p class="form-error" role="alert" hidden></p>
      <div class="form-actions">
        <button type="button" class="btn" data-cancel>취소</button>
        <button type="submit" class="btn primary">${habit ? '저장' : '추가'}</button>
      </div>
    </form>`);

  const form = $('form', el);
  $('[data-cancel]', form).addEventListener('click', close);
  $('[data-every-day]', form).addEventListener('click', () => {
    form.querySelectorAll('[name="days"]').forEach((box) => (box.checked = true));
  });

  const nameInput = $('[name="name"]', form);
  const difficulty = () => new FormData(form).get('difficulty');
  // 난이도 버튼마다 그 난이도의 분량(예: 300ml)을 보여 주고, 고른 추천 칩을 표시한다
  const showTemplate = () => {
    for (const radio of form.querySelectorAll('[name="difficulty"]')) {
      const span = radio.nextElementSibling;
      $('.amount', span)?.remove();
      if (tpl) $('small', span).insertAdjacentHTML('beforebegin', `<small class="amount">${SUGGESTIONS[tpl].levels[radio.value].short}</small>`);
    }
    for (const chip of form.querySelectorAll('.sug-chip')) chip.classList.toggle('is-on', chip.dataset.tpl === tpl);
  };
  form.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-sug-cat]');
    if (tab) {
      for (const t of form.querySelectorAll('.sug-tab')) t.classList.toggle('is-on', t === tab);
      $('#sug-chips', form).innerHTML = chips(tab.dataset.sugCat);
      showTemplate();
      return;
    }
    const chip = e.target.closest('.sug-chip');
    if (!chip) return;
    tpl = chip.dataset.tpl;
    nameInput.value = SUGGESTIONS[tpl].levels[difficulty()].name;
    $(`[name="category"][value="${SUGGESTIONS[tpl].category}"]`, form).checked = true;
    showTemplate();
  });
  form.addEventListener('change', (e) => {
    // 추천과 연결된 습관은 난이도를 바꾸면 이름(분량)도 따라 바뀐다
    if (e.target.name === 'difficulty' && tpl) nameInput.value = SUGGESTIONS[tpl].levels[difficulty()].name;
  });
  nameInput.addEventListener('input', () => {
    // 이름을 직접 고치면 추천과의 연결을 끊는다
    if (tpl && nameInput.value.trim() !== SUGGESTIONS[tpl].levels[difficulty()].name) {
      tpl = null;
      showTemplate();
    }
  });
  showTemplate();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const input = {
      name: data.get('name'),
      difficulty: data.get('difficulty'),
      category: data.get('category'),
      days: data.getAll('days').map(Number),
      templateId: tpl,
    };
    const levelBefore = state.player.level;
    let perfect = null;
    try {
      if (habit) perfect = G.updateHabit(state, habit.id, input, now()).perfect;
      else G.addHabit(state, input, now());
    } catch (err) {
      const box = $('.form-error', form);
      box.textContent = err.message;
      box.hidden = false;
      return;
    }
    save();
    close();
    afterHabitChange(habit ? '습관을 수정했어요.' : '습관을 추가했어요.', perfect, levelBefore);
  });
}

/** 추천 습관 여러 개를 한 번에 담는 화면 */
function openSuggestionSheet() {
  const used = G.usedTemplateIds(state);
  const groups = Object.entries(G.CATEGORY).map(([category, c]) => `
      <fieldset class="field">
        <legend>${c.label}</legend>
        <div class="sug-list cat-${category}">
          ${suggestionList().filter((s) => s.category === category).map((s) => `
            <label class="sug-row${used.has(s.id) ? ' is-used' : ''}">
              <input type="checkbox" name="tpl" value="${s.id}"${used.has(s.id) ? ' disabled' : ''}>
              <span class="sug-emoji">${s.emoji}</span>
              <span class="sug-name" data-name="${s.id}"></span>
              <span class="sug-mark">${used.has(s.id) ? '추가됨' : '✓'}</span>
            </label>`).join('')}
        </div>
      </fieldset>`).join('');

  const { el, close } = openOverlay(`
    <form class="sheet" role="dialog" aria-modal="true" aria-label="추천 습관 담기" novalidate>
      <h2>추천 습관 담기</h2>
      <p class="muted">하고 싶은 것을 고르면 한 번에 추가돼요. 매일 반복으로 들어가고, 이름·난이도·요일은 나중에 설정에서 바꿀 수 있어요.</p>
      <fieldset class="field">
        <legend>난이도</legend>
        <div class="seg cols-3">
          ${Object.entries(G.DIFFICULTY).map(([k, d]) => `
            <label><input type="radio" name="difficulty" value="${k}"${k === 'easy' ? ' checked' : ''}>
              <span>${d.label}<small>+${d.xp} XP · +${d.gold} G</small></span></label>`).join('')}
        </div>
        <p class="muted note">처음에는 쉬움으로 시작하고, 익숙해지면 올리는 걸 권해요.</p>
      </fieldset>
      ${groups}
      <div class="form-actions is-sticky">
        <button type="button" class="btn" data-cancel>취소</button>
        <button type="submit" class="btn primary" disabled>습관을 골라 주세요</button>
      </div>
    </form>`);

  const form = $('form', el);
  const submit = $('[type="submit"]', form);
  const refresh = () => {
    const data = new FormData(form);
    for (const node of form.querySelectorAll('[data-name]')) {
      node.textContent = SUGGESTIONS[node.dataset.name].levels[data.get('difficulty')].name;
    }
    const count = data.getAll('tpl').length;
    submit.disabled = count === 0;
    submit.textContent = count ? `${count}개 추가` : '습관을 골라 주세요';
  };
  form.addEventListener('change', refresh);
  $('[data-cancel]', form).addEventListener('click', close);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const added = G.addSuggested(state, data.getAll('tpl'), data.get('difficulty'), now());
    if (!added.length) return;
    save();
    close();
    switchTab('today');
    afterHabitChange(`습관 ${added.length}개를 추가했어요.`, null, state.player.level);
  });
  refresh();
}

/** 습관을 추가·수정·삭제한 뒤 화면을 다시 그린다. 그 결과로 오늘이 '완벽한 하루'가 됐으면 알려 준다. */
function afterHabitChange(message, perfect, levelBefore) {
  const leveledUp = state.player.level > levelBefore;
  renderAll({ leveledUp });
  toast(perfect ? `완벽한 하루! ${rewardText(perfect.xp, perfect.gold)}` : message);
  if (leveledUp) setTimeout(() => showLevelUp(levelBefore, state.player.level), 650);
}

async function removeHabit(id) {
  const habit = state.habits[id];
  if (!habit) return;
  const ok = await confirmDialog({
    title: '습관을 삭제할까요?',
    body: `"${habit.name}" 습관을 지웁니다. 지금까지 받은 경험치와 골드는 그대로 남아요.`,
    okLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  const levelBefore = state.player.level;
  const { perfect } = G.deleteHabit(state, id, now());
  save();
  afterHabitChange('습관을 삭제했어요.', perfect, levelBefore);
}

// ───────── 전투 화면 ─────────

const stageLabel = (m) => `스테이지 ${m.stage}${m.boss ? ' · 보스' : ''}`;

function updateBattleBadge(pop = false) {
  const badge = $('#battle-badge');
  const tickets = Math.max(0, state.battle.tickets);
  badge.hidden = tickets === 0;
  badge.textContent = tickets > 99 ? '99+' : tickets;
  if (pop && tickets) replay(badge, 'bump');
}

function renderBattle() {
  updateBattleBadge();
  const m = B.monsterFor(G.nextStage(state));
  const p = G.battleStats(state);
  const { tickets, wins, losses } = state.battle;
  const stat = (label, value, id) => `<div><dt>${label}</dt><dd id="bs-${id}">${value}</dd></div>`;
  $('#view-battle').innerHTML = `
    <h1 class="page-title">전투</h1>
    <div class="stage-card${m.boss ? ' is-boss' : ''}">
      <div class="stage-label" id="stage-label">${stageLabel(m)}</div>
      <div class="stage-art">${monsterSVG(m)}</div>
      <div class="stage-name" id="stage-name">${m.name}</div>
      <div class="stage-stats">체력 ${m.hp} · 공격 ${m.atk} · 방어 ${m.def}</div>
      <div class="stage-reward">승리 보상 <i class="coin"></i><b>${m.gold}</b></div>
    </div>
    <button type="button" class="btn primary block big" data-action="battle-start"${tickets < 1 ? ' disabled' : ''}>⚔ 전투 시작</button>
    <p class="ticket-line">전투 기회 <b id="battle-tickets">${Math.max(0, tickets)}</b>번
      <span>${tickets < 0 ? `취소한 체크만큼 ${-tickets}번을 먼저 채워야 해요.` : '습관을 하나 완료할 때마다 1번, 완벽한 하루에 1번 더 생겨요.'}</span></p>
    <div class="card">
      <h2>내 능력치</h2>
      <dl class="battle-stats">
        ${stat('공격력', p.atk, 'atk')}${stat('방어력', p.def, 'def')}${stat('체력', p.maxHp, 'hp')}
        ${stat('스킬 쿨타임', `${(B.skillCooldownMs(p) / 1000).toFixed(1)}초`, 'cd')}${stat('피버 확률', `${p.feverPct}%`, 'fever')}
      </dl>
      <p class="muted note">레벨이 오르면 공격력과 체력이 오르고, 무기는 공격력, 머리·몸은 방어력, 머리는 쿨타임, 장신구는 피버 확률을 올려요.</p>
    </div>
    <p class="hint" id="battle-record">${wins + losses ? `${wins}승 ${losses}패 · ` : ''}져도 잃는 것은 없어요. 공격은 자동이고, 스킬은 직접 누릅니다.</p>`;
}

function startBattle() {
  const start = G.beginBattle(state);
  if (!start.ok) {
    toast('전투 기회가 없어요. 습관을 완료하면 생겨요.');
    return;
  }
  save();
  renderBattle();

  const b = B.createBattle(start.player, start.monster);
  const { monster } = start;
  const el = document.createElement('div');
  el.className = `arena${monster.boss ? ' is-boss' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `${stageLabel(monster)} 전투`);
  el.innerHTML = `
    <div class="arena-top">
      <span class="arena-stage">${stageLabel(monster)}</span>
      <span class="arena-time" id="arena-time"></span>
    </div>
    <div class="fever-flag" id="fever-flag" hidden>🔥 피버 타임!</div>
    <div class="arena-field">
      <div class="fighter me" id="f-me">
        <div class="fighter-art">${characterSVG(state.gear.equipped)}</div>
        <div class="hpbar"><i></i></div>
        <span class="hpnum"></span>
      </div>
      <div class="fighter foe" id="f-foe">
        <div class="fighter-art">${monsterSVG(monster)}</div>
        <div class="hpbar"><i></i></div>
        <span class="hpnum"></span>
        <b class="foe-name">${monster.name}</b>
      </div>
    </div>
    <button type="button" class="skill-btn" id="skill-btn" disabled>
      <span class="skill-fill"></span><b>강타</b><small></small>
    </button>
    <div class="arena-result" id="arena-result" hidden></div>`;
  $('#overlay-root').append(el);

  const me = $('#f-me', el);
  const foe = $('#f-foe', el);
  const skillBtn = $('#skill-btn', el);
  let pressed = false;
  skillBtn.addEventListener('click', () => (pressed = true));

  const number = (target, text, cls) => {
    const n = document.createElement('span');
    n.className = `dmg ${cls}`;
    n.textContent = text;
    n.style.left = `${30 + Math.random() * 40}%`;
    n.addEventListener('animationend', () => n.remove());
    target.append(n);
  };
  const draw = () => {
    for (const [node, unit] of [[me, b.player], [foe, b.monster]]) {
      $('.hpbar i', node).style.width = `${(Math.max(0, unit.hp) / unit.maxHp) * 100}%`;
      $('.hpnum', node).textContent = `${Math.max(0, unit.hp)} / ${unit.maxHp}`;
    }
    $('#arena-time', el).textContent = `${Math.ceil((B.TIME_LIMIT_MS - b.t) / 1000)}초`;
    const fever = B.inFever(b);
    $('#fever-flag', el).hidden = !fever;
    el.classList.toggle('is-fever', fever);
    const ready = B.skillReady(b);
    const cooldown = B.skillCooldownMs(b.player);
    skillBtn.disabled = !ready;
    skillBtn.classList.toggle('is-ready', ready);
    $('.skill-fill', skillBtn).style.height = `${Math.min(100, 100 - (Math.max(0, b.skillAt - b.t) / cooldown) * 100)}%`;
    $('small', skillBtn).textContent = ready ? '준비 완료' : `${((b.skillAt - b.t) / 1000).toFixed(1)}초`;
  };
  const play = (e) => {
    if (e.type === 'hit') {
      replay(me, 'is-attacking');
      replay(foe, 'is-hurt');
      number(foe, e.dmg, e.fever ? 'fever' : '');
    } else if (e.type === 'skill') {
      replay(me, 'is-attacking');
      replay(foe, 'is-hurt');
      replay(el, 'is-shaking');
      number(foe, `강타! ${e.dmg}`, 'skill');
      navigator.vibrate?.(30);
    } else if (e.type === 'hurt') {
      replay(foe, 'is-attacking');
      replay(me, 'is-hurt');
      number(me, e.dmg, 'hurt');
    } else if (e.type === 'fever') {
      navigator.vibrate?.([15, 30, 15]);
    }
  };

  draw();
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    const events = B.step(b, Math.random, pressed);
    pressed = false;
    events.forEach(play);
    draw();
    if (b.result) {
      clearInterval(timer);
      setTimeout(() => showBattleResult(el, b, start), 500 / BATTLE_SPEED);
    }
  }, B.TICK_MS / BATTLE_SPEED);
}

function showBattleResult(el, b, start) {
  const won = b.result === 'win';
  const res = G.finishBattle(state, start.stage, won);
  save();
  renderAll();
  (won ? $('#f-foe', el) : $('#f-me', el)).classList.add('is-down');
  $('#skill-btn', el).hidden = true;

  const tickets = Math.max(0, state.battle.tickets);
  const next = B.monsterFor(G.nextStage(state));
  const again = tickets
    ? `<button type="button" class="btn primary" data-again>${won ? '다음 스테이지' : '다시 도전'} (기회 ${tickets})</button>`
    : '';
  const box = $('#arena-result', el);
  box.dataset.result = b.result;
  box.innerHTML = won
    ? `<div class="result-title win">승리!</div>
       <div class="result-reward"><i class="coin"></i>+${res.gold} G</div>
       <p>다음은 ${stageLabel(next)} · ${next.name}</p>`
    : `<div class="result-title lose">${b.result === 'timeout' ? '시간 초과' : '패배'}</div>
       <p>잃은 것은 없어요.<br>장비를 사거나 레벨을 올려 다시 도전해 보세요.</p>`;
  box.innerHTML += `<div class="result-actions">${again}<button type="button" class="btn" data-close>돌아가기</button></div>`;
  box.hidden = false;
  if (won) {
    confetti(el, 30);
    navigator.vibrate?.([30, 40, 60]);
  }
  $('[data-close]', box).addEventListener('click', () => el.remove());
  $('[data-again]', box)?.addEventListener('click', () => {
    el.remove();
    startBattle();
  });
}

// ───────── 상점 · 장비 화면 ─────────

function itemCard(item) {
  const { owned, equipped } = state.gear;
  const has = owned.includes(item.id);
  const on = equipped[item.slot] === item.id;
  const locked = !has && state.player.level < item.level;
  let action;
  if (on) action = `<button type="button" class="btn small is-on" data-action="unequip" data-slot="${item.slot}">착용 중 ✓</button>`;
  else if (has) action = `<button type="button" class="btn small primary" data-action="equip" data-id="${item.id}">착용</button>`;
  else if (locked) action = `<span class="lock">🔒 Lv.${item.level}에 열림</span>`;
  else {
    const cant = state.player.gold < item.price ? ' cant' : '';
    action = `<button type="button" class="btn small buy${cant}" data-action="buy" data-id="${item.id}"><i class="coin"></i>${item.price.toLocaleString('ko-KR')}</button>`;
  }
  return `
    <div class="item${on ? ' is-equipped' : ''}${locked ? ' is-locked' : ''}" data-item="${item.id}">
      <div class="item-icon">${characterSVG({ [item.slot]: item.id }, { viewBox: iconViewBox(item), label: item.name })}</div>
      <div class="item-text">
        <div class="item-name">${item.name}</div>
        <div class="item-effect">경험치 +${item.xpPct}%</div>
        <div class="item-stats">${statText(item.stats)}</div>
      </div>
      ${action}
    </div>`;
}

function renderShop() {
  const slots = Object.entries(G.SLOTS).map(([slot, s]) => `
    <section class="shop-slot">
      <h2>${s.label}</h2>
      <div class="item-grid">${G.TIERS.map((t) => itemCard(G.ITEMS[`${slot}${t.tier}`])).join('')}</div>
    </section>`).join('');
  const gold = state.player.gold;
  $('#view-shop').innerHTML = `
    <h1 class="page-title">상점 · 장비</h1>
    <div class="shop-top">
      <div class="shop-char" id="shop-char">${characterSVG(state.gear.equipped)}</div>
      <div class="shop-stats">
        <div class="gold big${gold < 0 ? ' is-neg' : ''}" aria-label="골드"><i class="coin"></i><b id="shop-gold">${gold.toLocaleString('ko-KR')}</b></div>
        <div class="shop-bonus">장비 효과 <b id="shop-bonus">경험치 +${G.equipBonusPct(state)}%</b></div>
        <p class="muted">경험치 효과는 합쳐서 최대 +${G.EQUIP_BONUS_MAX_PCT}%. 전투 능력치는 전투 탭에서 볼 수 있어요.</p>
      </div>
    </div>
    ${slots}`;
}

async function buy(id) {
  const item = G.ITEMS[id];
  if (state.player.gold < item.price) {
    toast(`골드가 ${(item.price - state.player.gold).toLocaleString('ko-KR')} 부족해요.`);
    return;
  }
  const ok = await confirmDialog({
    title: `${item.name}${eul(item.name)} 살까요?`,
    body: `${item.price.toLocaleString('ko-KR')} G를 쓰고 바로 착용합니다. 효과: 경험치 +${item.xpPct}% · ${statText(item.stats)}`,
    okLabel: '구매',
  });
  if (!ok) return;
  const res = G.buyItem(state, id);
  if (!res.ok) return;
  save();
  afterGearChange(`${item.name} 획득! 바로 착용했어요.`);
  navigator.vibrate?.([20, 30, 40]);
}

function setEquip(slot, itemId) {
  if (!G.equipItem(state, slot, itemId).ok) return;
  save();
  afterGearChange(itemId ? `${G.ITEMS[itemId].name}${eul(G.ITEMS[itemId].name)} 착용했어요.` : '장비를 벗었어요.');
}

function afterGearChange(message) {
  const scroll = scrollY;
  renderAll();
  scrollTo(0, scroll);
  cheer($('#shop-char'));
  toast(message);
}

// ───────── 기록 화면 ─────────

const heatLevel = (ratio) => (ratio === null ? 'none' : ratio >= 1 ? 4 : ratio === 0 ? 0 : Math.min(3, 1 + Math.floor(ratio * 3)));

function dayDetail(d) {
  let line;
  if (d.ratio === null) line = '예정된 습관이 없었어요.';
  else line = `${d.total}개 중 ${d.done}개 완료 (${Math.round(d.ratio * 100)}%)`;
  const extras = [];
  if (d.perfect) extras.push('★ 완벽한 하루');
  if (d.rest) extras.push('휴식일');
  if (d.hpLoss) extras.push(`HP −${d.hpLoss}`);
  if (d.day === currentDay && d.ratio !== null) extras.push('진행 중');
  return `<b>${formatDay(d.day)}</b><span>${[line, ...extras].join(' · ')}</span>`;
}

function renderLog() {
  const days = G.recentDays(state, currentDay, 30);
  if (!days.some((d) => d.day === logSelected)) logSelected = currentDay;
  const t = G.totals(state);
  const tracked = days.filter((d) => d.ratio !== null);
  const sum = (key) => tracked.reduce((n, d) => n + d[key], 0);
  const rate = tracked.length ? Math.round((sum('done') / sum('total')) * 100) : null;

  const lead = (G.weekdayOf(days[0].day) + 6) % 7; // 첫 칸을 요일 열에 맞춘다
  const cells = days.map((d) => {
    const [, m, dd] = d.day.split('-').map(Number);
    const label = dd === 1 || d === days[0] ? `${m}/${dd}` : dd;
    const cls = [`lv-${heatLevel(d.ratio)}`, d.day === currentDay ? 'is-today' : '', d.day === logSelected ? 'is-selected' : ''].join(' ');
    const said = d.ratio === null ? '기록 없음' : `${d.total}개 중 ${d.done}개 완료`;
    return `<button type="button" class="cal-cell ${cls}" data-action="pick-day" data-day="${d.day}"
      aria-label="${formatDay(d.day)} ${said}${d.perfect ? ', 완벽한 하루' : ''}${d.rest ? ', 휴식일' : ''}">
      ${label}${d.perfect ? '<span class="mark">★</span>' : ''}${d.rest ? '<span class="mark rest">쉼</span>' : ''}</button>`;
  }).join('');

  const habits = G.habitList(state);
  const streaks = habits.map((h) => `
    <li class="cat-${h.category}">
      <span class="dot"></span>
      <span class="streak-name">${esc(h.name)}</span>
      <span class="streak-now">🔥 ${G.currentStreak(state, h, currentDay)}일</span>
      <span class="streak-best">최고 ${G.bestStreak(state, h, currentDay)}일</span>
    </li>`).join('');

  $('#view-log').innerHTML = `
    <h1 class="page-title">기록</h1>
    <div class="stat-grid">
      <div class="stat wide">
        <div class="stat-label">총 획득 경험치</div>
        <div class="stat-value" id="stat-total-xp">${t.totalXp.toLocaleString('ko-KR')}<small>XP</small></div>
      </div>
      <div class="stat"><div class="stat-label">완료한 습관</div><div class="stat-value" id="stat-completions">${t.completions.toLocaleString('ko-KR')}<small>번</small></div></div>
      <div class="stat"><div class="stat-label">완벽한 하루</div><div class="stat-value" id="stat-perfect">${t.perfectDays}<small>일</small></div></div>
    </div>
    <div class="card">
      <h2>최근 30일</h2>
      <p class="muted" id="stat-rate" style="margin:0">${rate === null ? '아직 기록이 없어요.' : `달성률 ${rate}% · 진할수록 그날 습관을 많이 지킨 날이에요.`}</p>
      <div class="cal-head" aria-hidden="true">${WEEK_ORDER.map((d) => `<span>${WEEK_LABEL[d]}</span>`).join('')}</div>
      <div class="cal">${'<span></span>'.repeat(lead)}${cells}</div>
      <div class="cal-legend">
        <span class="cal-scale">0% ${[0, 1, 2, 3, 4].map((n) => `<i class="lv-${n} cal-swatch"></i>`).join('')} 100%</span>
        <span>★ 완벽한 하루</span><span>쉼 휴식일</span>
      </div>
      <div class="cal-detail" id="cal-detail" aria-live="polite">${dayDetail(days.find((d) => d.day === logSelected))}</div>
    </div>
    <div class="card">
      <h2>습관별 연속 일수</h2>
      ${habits.length ? `<ul class="streak-list">${streaks}</ul>` : '<p class="muted" style="margin:0">아직 만든 습관이 없어요.</p>'}
    </div>`;
}

function pickDay(day) {
  logSelected = day;
  const scroll = scrollY;
  renderLog();
  scrollTo(0, scroll);
}

// ───────── 백업 ─────────

function exportBackup() {
  const json = JSON.stringify(exportData(state, now()), null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = `habit-rpg-backup-${currentDay}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  G.markBackedUp(state, now());
  save();
  renderSettings();
  toast('백업 파일을 내보냈어요.');
}

async function importBackup(file) {
  let next;
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('파일이 너무 커요. 이 앱의 백업 파일이 맞는지 확인해 주세요.');
    next = importData(await file.text());
  } catch (err) {
    alertDialog({ title: '가져올 수 없어요', body: err.message });
    return;
  }
  const info = describeBackup(next);
  const ok = await confirmDialog({
    title: '백업을 가져올까요?',
    body: `Lv.${info.level} · 습관 ${info.habits}개 · 완료 기록 ${info.completions}건이 들어 있어요. 지금 이 기기의 데이터는 모두 이 백업으로 바뀝니다.`,
    okLabel: '가져오기',
    danger: true,
  });
  if (!ok) return;
  try {
    await DB.replaceAll(next);
  } catch (err) {
    console.error(err);
    alertDialog({ title: '가져오지 못했어요', body: '저장하는 중에 문제가 생겼어요. 기존 데이터는 그대로입니다.' });
    return;
  }
  state = await DB.loadState();
  switchTab('today');
  enterDay();
  toast('백업을 가져왔어요.');
}

// ───────── 앱 설치 ─────────

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function installCard() {
  let body;
  if (isInstalled()) body = '<p class="muted" style="margin:0">홈 화면에 설치된 앱으로 실행 중이에요.</p>';
  else if (installPrompt) body = '<button type="button" class="btn primary block" data-action="install">홈 화면에 설치</button>';
  else {
    body = `<p class="muted" style="margin:0">브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 누르면 앱처럼 쓸 수 있어요.
      iPhone은 Safari의 공유 버튼 → ‘홈 화면에 추가’예요.</p>`;
  }
  const offline = navigator.serviceWorker?.controller
    ? '오프라인 준비 완료 · 인터넷이 없어도 열려요.'
    : '한 번 더 열면 인터넷 없이도 동작해요.';
  return `<div class="card"><h2>앱 설치</h2>${body}<p class="muted note" id="offline-status">${offline}</p></div>`;
}

async function install() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  renderSettings();
}

function backupDateText() {
  const at = state.settings.lastBackupAt;
  if (!at) return '아직 백업한 적이 없어요.';
  const d = new Date(at);
  return `마지막 백업: ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ───────── 설정 화면 ─────────

function renderSettings() {
  const habits = G.habitList(state);
  const rows = habits.map((h) => `
    <li class="cat-${h.category}">
      <span class="dot"></span>
      <span class="manage-info">
        <b>${esc(h.name)}</b>
        <small>${G.CATEGORY[h.category].label} · ${G.DIFFICULTY[h.difficulty].label} · ${daysLabel(G.currentDays(h))}</small>
      </span>
      <button type="button" class="link-btn" data-action="edit-habit" data-id="${h.id}">수정</button>
      <button type="button" class="link-btn danger" data-action="delete-habit" data-id="${h.id}">삭제</button>
    </li>`).join('');

  const hours = Array.from({ length: 24 }, (_, h) =>
    `<option value="${h}"${h === state.settings.dayStartHour ? ' selected' : ''}>${hourLabel(h)}${h === 4 ? ' · 기본' : ''}</option>`).join('');

  $('#view-settings').innerHTML = `
    <h1 class="page-title">설정</h1>
    <div class="card">
      <h2>습관 관리</h2>
      ${habits.length ? `<ul class="manage-list">${rows}</ul>` : '<p class="muted">아직 만든 습관이 없어요.</p>'}
      <div class="btn-row">
        <button type="button" class="btn primary" data-action="add-habit">+ 습관 추가</button>
        <button type="button" class="btn" data-action="suggest">✨ 추천에서 담기</button>
      </div>
    </div>
    <div class="card">
      <h2>하루 기준 시각</h2>
      <p class="muted">이 시각에 하루가 넘어갑니다. 그 전까지 한 체크는 전날 기록으로 남아요.</p>
      <select id="day-start" aria-label="하루 기준 시각">${hours}</select>
    </div>
    <div class="card">
      <h2>백업</h2>
      <p class="muted">모든 데이터는 이 기기 안에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지니, 가끔 파일로 내보내 두세요.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="export">내보내기</button>
        <button type="button" class="btn" data-action="import">가져오기</button>
      </div>
      <p class="muted note" id="backup-last">${backupDateText()}</p>
    </div>
    ${installCard()}
    <div class="card">
      <h2>초기화</h2>
      <p class="muted">습관, 기록, 레벨, HP, 골드, 장비를 모두 지우고 처음 상태로 되돌립니다.</p>
      <button type="button" class="btn danger block" data-action="reset">모든 데이터 지우기</button>
    </div>
    ${DEBUG ? `
    <div class="card">
      <h2>시험용 시계</h2>
      <p class="muted">앱이 보는 현재 시각을 앞으로 옮겨 날짜 넘어가는 동작을 확인합니다.<br>지금: <b id="debug-now">${debugNowText()}</b></p>
      <div class="debug-row">
        <button type="button" class="btn small" data-action="debug-shift" data-ms="3600000">+1시간</button>
        <button type="button" class="btn small" data-action="debug-shift" data-ms="86400000">+1일</button>
        <button type="button" class="btn small" data-action="debug-reset">실제 시각으로</button>
      </div>
    </div>` : ''}`;
}

function debugNowText() {
  const d = new Date(now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderDebugBanner() {
  const banner = $('#debug-banner');
  banner.hidden = !state.settings.debugOffsetMs;
  if (!banner.hidden) banner.textContent = `시험용 시계 사용 중 (${debugNowText()}) · 누르면 실제 시각으로 돌아갑니다`;
}

function setDebugOffset(offsetMs) {
  G.setDebugOffset(state, offsetMs);
  enterDay();
}

async function resetAll() {
  const first = await confirmDialog({
    title: '모든 데이터를 지울까요?',
    body: '습관, 체크 기록, 레벨, 골드, 장비가 모두 사라집니다.',
    okLabel: '계속',
    danger: true,
  });
  if (!first) return;
  const second = await confirmDialog({
    title: '정말 지울까요?',
    body: '되돌릴 수 없습니다. 마지막 확인이에요.',
    okLabel: '전부 지우기',
    danger: true,
  });
  if (!second) return;
  await DB.clearAll();
  state = await DB.loadState();
  switchTab('today');
  enterDay();
  toast('처음 상태로 되돌렸어요.');
}

// ───────── 공통 ─────────

function renderAll(heroOptions) {
  renderDebugBanner();
  $('#hero-char').innerHTML = characterSVG(state.gear.equipped);
  updateHero(heroOptions);
  renderToday();
  renderBattle();
  renderShop();
  renderLog();
  renderSettings();
}

function switchTab(tab) {
  // 오늘 화면에서 체크한 결과(골드, 레벨, 기록)를 반영한다
  if (tab === 'battle') renderBattle();
  if (tab === 'shop') renderShop();
  if (tab === 'log') renderLog();
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== `view-${tab}`;
  for (const btn of document.querySelectorAll('.tabbar button')) {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  }
  scrollTo(0, 0);
}

/** 오늘 날짜를 정하고, 지난 날이 있으면 벌칙을 정산한 뒤 화면을 그린다. 앱을 열 때와 날짜가 바뀔 때 부른다. */
function enterDay() {
  currentDay = today();
  logSelected = currentDay;
  G.processRollover(state, now());
  save();
  renderAll();
  showAwayReport();
}

/** 앱을 켜 둔 채로 하루 기준 시각을 지나면 새 날로 넘어간다. 날짜가 바뀌었으면 true. */
function syncDay() {
  if (today() === currentDay) return false;
  enterDay();
  return true;
}

const ACTIONS = {
  'toggle': (el) => toggleHabit(el),
  'add-habit': () => openHabitForm(null),
  'suggest': () => openSuggestionSheet(),
  'edit-habit': (el) => openHabitForm(state.habits[el.dataset.id]),
  'delete-habit': (el) => removeHabit(el.dataset.id),
  'reset': () => resetAll(),
  'buy': (el) => buy(el.dataset.id),
  'equip': (el) => setEquip(G.ITEMS[el.dataset.id].slot, el.dataset.id),
  'unequip': (el) => setEquip(el.dataset.slot, null),
  'battle-start': () => startBattle(),
  'pick-day': (el) => pickDay(el.dataset.day),
  'export': () => exportBackup(),
  'import': () => $('#import-file').click(),
  'install': () => install(),
  'rest-on': () => setRest(true),
  'rest-off': () => setRest(false),
  'debug-shift': (el) => setDebugOffset(state.settings.debugOffsetMs + Number(el.dataset.ms)),
  'debug-reset': () => setDebugOffset(0),
};

function bindEvents() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tabbar [data-tab]');
    if (tab) return switchTab(tab.dataset.tab);
    const el = e.target.closest('[data-action]');
    if (el) ACTIONS[el.dataset.action]?.(el);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'day-start') return;
    G.setDayStartHour(state, e.target.value);
    enterDay();
    toast(`하루 기준 시각을 ${hourLabel(state.settings.dayStartHour)}로 바꿨어요.`);
  });
  $('#debug-banner').addEventListener('click', () => setDebugOffset(0));
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 반응하도록 비운다
    if (file) importBackup(file);
  });
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    renderSettings();
  });
  addEventListener('appinstalled', () => {
    installPrompt = null;
    renderSettings();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncDay();
  });
  setInterval(syncDay, 30000);
}

/** 오프라인에서도 열리도록 앱 파일을 기기에 저장해 두는 서비스 워커를 등록한다. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller); // 이미 설치된 적이 있는 기기인지
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('서비스 워커 등록 실패', err));
  navigator.serviceWorker.ready.then(() => renderSettings());
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    renderSettings();
    // 새 버전의 파일을 다 받았다. 지금 화면은 아직 예전 파일이므로 다시 열도록 안내한다.
    if (hadController) $('#update-banner').hidden = false;
  });
  $('#update-banner').addEventListener('click', () => location.reload());
}

async function init() {
  try {
    state = await DB.loadState();
  } catch (err) {
    console.error(err);
    document.body.innerHTML =
      '<p style="padding:32px 20px;text-align:center">이 브라우저에서는 기기 저장소(IndexedDB)를 열 수 없어요.<br>사생활 보호 모드를 끄고 다시 열어 주세요.</p>';
    return;
  }
  bindEvents();
  enterDay();
  navigator.storage?.persist?.().catch(() => {}); // 브라우저가 데이터를 함부로 비우지 않도록 요청
  registerServiceWorker();
}

init();
