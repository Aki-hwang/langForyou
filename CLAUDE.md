# LangForYou — 일본어 학습 앱

JLPT 기반 일본어 단어 학습 앱 (한국어 사용자 대상). Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4.

## 명령어

- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드 (변경 후 반드시 통과 확인)
- `npm run lint` — ESLint

## 아키텍처

- 학습 진도(SRS 카드 상태, 일별 기록)는 `localStorage`가 1차 저장소 (`lib/storage.ts`).
- 계정/동기화(선택): Railway PostgreSQL(`DATABASE_URL`) + 이메일 로그인(bcryptjs, 세션 쿠키).
  서버 코드는 `lib/server/{db,auth}.ts`, API는 `app/api/{auth,progress}`. 스키마는 첫 쿼리 때 자동 생성.
  로그인 시 `lib/sync.ts`가 grade 이벤트(`lfy:graded`)를 받아 디바운스 push, 로그인/앱 시작 시 `fullSync()`로 병합(카드: reps 큰 쪽 우선, 일별: 큰 값 유지). DATABASE_URL 없으면 로그인만 비활성.
- 단어 데이터는 `data/n5.ts`~`n1.ts`의 정적 TypeScript 배열 (`lib/types.ts`의 `Word` 타입). `data/index.ts`가 집계·조회를 담당.
- SRS는 `lib/srs.ts`의 SM-2 간소화 버전. 숙련도 100% = 복습 간격 21일 이상.
- 발음은 `lib/tts.ts`에서 Web Speech API(ja-JP·ko-KR) 사용 — 외부 API 없음. `speakAsync`는 Promise 기반이라 연속듣기(`app/listen/[level]`)에서 순차 재생에 사용.
- 연속듣기는 단어마다 일본어 읽기 3회 → 한국어 뜻 1회 자동 재생. 취소는 `tokenRef` 증가로 진행 중 async 루프를 무효화. 🔀 무작위 토글로 재생 순서를 셔플 가능(시드 PRNG, 끄면 원래 순서로 복귀).
- 집중연습(`app/practice/[level]`)은 선택한 개수(10/20/30/전체)의 단어를 무작위 출제하고, 틀린 단어만 모아 다음 라운드로 반복 — 전부 맞힐 때까지. 문제 형식·채점은 퀴즈와 동일(뜻/읽기/듣기 순환, SRS grade 연동).
- 페이지는 대부분 클라이언트 컴포넌트. 동적 라우트(`[level]`)는 서버 래퍼에서 `params`를 await 후 클라이언트 컴포넌트에 전달.
- 렌더 중 `Date.now()`/`Math.random()`/ref 쓰기 금지(React Compiler lint). 시각은 `lib/now.ts`의 `sessionNow()`, 셔플은 `lib/random.ts`의 시드 PRNG, 클라 전용 값은 `useHydrated()`로 게이트.
- 모바일 우선: `max-w-lg` 중앙 정렬, 하단 탭 내비게이션(`components/BottomNav.tsx`), 오른쪽 스와이프 뒤로가기(`components/SwipeBack.tsx`), 다크 모드는 `prefers-color-scheme` 기반.

## 규칙

- UI 문구는 한국어, 단어·예문은 일본어(뜻은 한국어).
- Tailwind 클래스는 정적 문자열로 (동적 조합 금지 — `LEVEL_META` 패턴 참고).
- localStorage 키는 `lfy:` 접두사 + 버전 suffix (`lfy:cards:v1`).
