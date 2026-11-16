// 서비스 워커: 앱 파일을 기기에 저장해 두고, 인터넷이 없어도 저장해 둔 파일로 앱을 연다.
// 앱 파일을 고쳐서 다시 올릴 때는 아래 VERSION 을 바꿔야 사용자 기기에 새 파일이 내려간다.
const VERSION = 'v4';
const CACHE = `habit-rpg-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/game.js',
  'js/db.js',
  'js/character.js',
  'js/backup.js',
  'js/battle.js',
  'js/monsters.js',
  'js/suggestions.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // 하나라도 받지 못하면 설치 전체가 실패하고, 다음에 열 때 다시 시도한다.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('habit-rpg-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        // 오프라인에서 주소가 조금 달라도 앱 화면을 연다
        if (request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    }),
  );
});
