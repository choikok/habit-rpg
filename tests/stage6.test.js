// 6단계 규칙 시험: 추천 습관.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';
import { SUGGESTIONS, suggestionList } from '../js/suggestions.js';
import { exportData, importData } from '../js/backup.js';

const NOV = (d, h = 9, min = 0) => new Date(2026, 10, d, h, min).getTime();
const fresh = () => {
  const state = G.createState();
  G.processRollover(state, NOV(16, 8));
  return state;
};
const names = (state) => G.habitList(state).map((h) => h.name);

test('추천 목록: 분야마다 6개씩 24개, 난이도 3단계, 이름이 겹치지 않고 30자 이내', () => {
  const list = suggestionList();
  assert.equal(list.length, 24);
  for (const category of Object.keys(G.CATEGORY)) {
    assert.equal(list.filter((s) => s.category === category).length, 6, category);
  }
  const all = [];
  for (const s of list) {
    assert.match(s.id, /^[a-z]+$/);
    assert.ok(s.title && s.emoji);
    assert.deepEqual(Object.keys(s.levels), ['easy', 'normal', 'hard']);
    for (const level of Object.values(s.levels)) {
      assert.ok(level.name.length <= G.NAME_MAX, level.name);
      assert.ok(level.short.length <= 6, level.short);
      all.push(level.name);
    }
  }
  assert.equal(new Set(all).size, 72);
});

test('물 마시기: 쉬움 300ml, 보통 1L, 어려움은 무리 없는 2L', () => {
  assert.deepEqual(Object.values(SUGGESTIONS.water.levels).map((l) => l.name),
    ['물 300ml 마시기', '물 1L 마시기', '물 2L 마시기']);
  assert.equal(SUGGESTIONS.water.category, 'life');
});

test('추천 여러 개를 한 번에 담기: 고른 순서대로, 같은 난이도, 매일 반복', () => {
  const state = fresh();
  const added = G.addSuggested(state, ['water', 'walk', 'read'], 'easy', NOV(16));
  assert.equal(added.length, 3);
  assert.deepEqual(names(state), ['물 300ml 마시기', '산책 10분', '책 10쪽 읽기']);
  const habits = G.habitList(state);
  assert.deepEqual(habits.map((h) => [h.category, h.difficulty, h.templateId]),
    [['life', 'easy', 'water'], ['exercise', 'easy', 'walk'], ['study', 'easy', 'read']]);
  assert.ok(habits.every((h) => G.currentDays(h).length === 7));
  assert.equal(G.daySummary(state, '2026-11-16').total, 3); // 오늘부터 바로 할 수 있다
  assert.equal(G.checkHabit(state, habits[0].id, NOV(16)).xp, 5);
});

test('이미 담은 추천과 없는 추천은 건너뛴다', () => {
  const state = fresh();
  G.addSuggested(state, ['water', 'walk'], 'normal', NOV(16));
  const again = G.addSuggested(state, ['water', 'squat', 'water', '없는것'], 'hard', NOV(16, 10));
  assert.deepEqual(again.map((h) => h.name), ['스쿼트 60개']);
  assert.deepEqual(names(state), ['물 1L 마시기', '산책 30분', '스쿼트 60개']);
  assert.deepEqual([...G.usedTemplateIds(state)].sort(), ['squat', 'walk', 'water']);
  assert.throws(() => G.addSuggested(state, ['read'], 'impossible', NOV(16)));
});

test('추천에서 온 습관은 난이도에 맞는 이름일 때만 추천과 연결된다', () => {
  const state = fresh();
  const linked = G.addHabit(state, { name: '물 1L 마시기', difficulty: 'normal', category: 'life', templateId: 'water' }, NOV(16));
  assert.equal(linked.templateId, 'water');
  // 이름을 직접 고쳤으면 연결하지 않는다
  const custom = G.addHabit(state, { name: '보리차 1L 마시기', difficulty: 'normal', category: 'life', templateId: 'water' }, NOV(16, 9, 1));
  assert.equal('templateId' in custom, false);
  // 난이도와 이름이 어긋나도 연결하지 않는다
  const mismatch = G.addHabit(state, { name: '물 300ml 마시기', difficulty: 'hard', category: 'life', templateId: 'water' }, NOV(16, 9, 2));
  assert.equal('templateId' in mismatch, false);
  // 추천 없이 만든 습관
  const plain = G.addHabit(state, { name: '물 1L 마시기', difficulty: 'normal', category: 'life' }, NOV(16, 9, 3));
  assert.equal('templateId' in plain, false);
});

test('수정: 난이도와 이름을 함께 바꾸면 연결이 유지되고, 이름만 따로 고치면 끊긴다', () => {
  const state = fresh();
  const [habit] = G.addSuggested(state, ['water'], 'easy', NOV(16));
  G.updateHabit(state, habit.id, { name: '물 2L 마시기', difficulty: 'hard', category: 'life', templateId: 'water' }, NOV(16, 10));
  assert.deepEqual([habit.name, habit.difficulty, habit.templateId], ['물 2L 마시기', 'hard', 'water']);
  G.updateHabit(state, habit.id, { name: '따뜻한 물 2L', difficulty: 'hard', category: 'life', templateId: 'water' }, NOV(16, 11));
  assert.equal('templateId' in habit, false);
  assert.equal(G.usedTemplateIds(state).has('water'), false); // 다시 추천에서 고를 수 있다
});

test('백업: 추천 연결이 그대로 저장되고, 목록에 없는 추천이면 연결만 끊고 가져온다', () => {
  const state = fresh();
  G.addSuggested(state, ['water', 'walk'], 'normal', NOV(16));
  const data = JSON.parse(JSON.stringify(exportData(state, NOV(16, 12))));
  assert.deepEqual(data.habits.map((h) => h.templateId), ['water', 'walk']);
  assert.deepEqual(importData(JSON.stringify(data)).habits, state.habits);

  const unknown = structuredClone(data);
  unknown.habits[0].templateId = 'retired';
  const restored = Object.values(importData(JSON.stringify(unknown)).habits);
  assert.equal(restored.length, 2);
  assert.equal('templateId' in restored.find((h) => h.name === '물 1L 마시기'), false);

  const bad = structuredClone(data);
  bad.habits[0].templateId = { evil: true };
  assert.throws(() => importData(JSON.stringify(bad)), /추천/);
});
