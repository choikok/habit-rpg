# 습관 모험

습관을 체크하면 캐릭터가 경험치·골드를 얻어 성장하는 RPG 습관 체크리스트(PWA)입니다.
순수 HTML/CSS/JavaScript이고 빌드 과정이 없습니다. 데이터는 기기 안 IndexedDB에만 저장됩니다.

## 실행

폴더를 정적 웹 서버로 열면 됩니다. (`index.html`을 파일로 직접 열면 동작하지 않습니다.)

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 을 엽니다.
주소 끝에 `?debug` 를 붙이면 설정 화면에 시험용 시계(+1시간, +1일)가 나옵니다.

## 배포된 주소

https://choikok.github.io/habit-rpg/

GitHub Pages가 `gh-pages` 브랜치를 그대로 내보냅니다. 고친 내용을 사이트에 반영하려면
`main`에 올린 뒤 같은 커밋을 `gh-pages`에도 올려야 합니다.

```bash
git push origin main
```

```bash
git push origin main:gh-pages
```

## 휴대폰에 설치

홈 화면 설치와 오프라인 동작은 HTTPS 주소에서만 됩니다.
이 폴더를 통째로 HTTPS 정적 호스팅(GitHub Pages, Netlify, Cloudflare Pages 등)에 올린 뒤,
휴대폰 브라우저로 열어 '홈 화면에 추가'를 누릅니다. `tests/`, `tools/` 폴더는 올리지 않아도 됩니다.

파일을 고쳐서 다시 올릴 때는 `sw.js` 맨 위의 `VERSION` 값을 바꿔 주세요.
그래야 이미 설치한 기기가 새 파일을 받습니다.

## 시험

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` 는 규칙 계산(Node만 있으면 됨), `test:e2e` 는 실제 브라우저 시험(Playwright 필요)입니다.

## 파일

| 파일 | 내용 |
|---|---|
| `js/game.js` | 규칙 전부: 보상, 연속 보너스, 레벨, HP 벌칙, 휴식일, 상점, 통계 |
| `js/db.js` | IndexedDB 저장 |
| `js/backup.js` | JSON 백업 내보내기·가져오기와 형식 검사 |
| `js/character.js` | 캐릭터와 장비 16종 그림(SVG) |
| `js/app.js` | 화면과 입력 처리 |
| `sw.js`, `manifest.webmanifest`, `icons/` | 오프라인 동작과 홈 화면 설치 |
| `tools/make-icons.mjs` | 아이콘 다시 만들기 (`npm run icons`) |
