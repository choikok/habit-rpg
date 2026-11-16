// IndexedDB 저장소. 모든 데이터는 이 기기 안에만 저장된다.
import { createState, defaultGear, defaultPlayer, defaultProgress, defaultSettings } from './game.js';

const DB_NAME = 'habit-rpg';
const DB_VERSION = 1;
const STORES = { meta: 'key', habits: 'id', completions: 'id', days: 'day' };

let dbPromise = null;
let db = null; // 한 번 열린 뒤에는 기다림 없이 바로 쓴다

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve((db = req.result));
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const getAll = (tx, store) =>
  new Promise((resolve, reject) => {
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function loadState() {
  await open();
  const tx = db.transaction(Object.keys(STORES), 'readonly');
  const [meta, habits, completions, days] = await Promise.all(Object.keys(STORES).map((s) => getAll(tx, s)));
  const state = createState();
  for (const { key, ...value } of meta) {
    // 나중 단계에서 항목이 늘어도 예전 데이터가 그대로 열리도록 기본값 위에 덮어쓴다.
    if (key === 'player') state.player = { ...defaultPlayer(), ...value };
    if (key === 'settings') state.settings = { ...defaultSettings(), ...value };
    if (key === 'progress') state.progress = { ...defaultProgress(), ...value };
    if (key === 'gear') state.gear = { ...defaultGear(), ...value };
  }
  for (const h of habits) state.habits[h.id] = h;
  for (const c of completions) state.completions[c.id] = c;
  for (const d of days) state.days[d.day] = d;
  return state;
}

/**
 * 바뀐 레코드를 한 번의 트랜잭션으로 저장한다. 중간에 실패하면 전부 취소된다.
 * 체크하자마자 앱을 닫아도 남도록, 기다림 없이 그 자리에서 쓰기를 넣고 곧바로 확정(commit)한다.
 */
export function flush(state) {
  if (!state.dirty.size) return Promise.resolve();
  const changes = [...state.dirty.values()];
  state.dirty.clear();
  const tx = db.transaction([...new Set(changes.map((c) => c.store))], 'readwrite');
  for (const { store, key, value } of changes) {
    if (value === undefined) tx.objectStore(store).delete(key);
    else tx.objectStore(store).put(structuredClone(value));
  }
  const finished = done(tx);
  tx.commit?.();
  return finished;
}

/** 저장된 내용을 전부 지우고 주어진 상태로 바꾼다 (백업 가져오기). 실패하면 원래 데이터가 그대로 남는다. */
export async function replaceAll(state) {
  await open();
  const tx = db.transaction(Object.keys(STORES), 'readwrite');
  for (const store of Object.keys(STORES)) tx.objectStore(store).clear();
  for (const key of ['player', 'settings', 'progress', 'gear']) tx.objectStore('meta').put({ key, ...structuredClone(state[key]) });
  for (const store of ['habits', 'completions', 'days']) {
    for (const rec of Object.values(state[store])) tx.objectStore(store).put(structuredClone(rec));
  }
  state.dirty.clear();
  await done(tx);
}

export async function clearAll() {
  await open();
  const tx = db.transaction(Object.keys(STORES), 'readwrite');
  for (const store of Object.keys(STORES)) tx.objectStore(store).clear();
  await done(tx);
}
