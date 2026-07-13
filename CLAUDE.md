# LangForYou — 일본어 학습 앱

JLPT 기반 일본어 단어 학습 앱 (한국어 사용자 대상). Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4.

## 명령어

- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드 (변경 후 반드시 통과 확인)
- `npm run lint` — ESLint

## 아키텍처

- 서버/DB 없음. 학습 진도(SRS 카드 상태, 일별 기록)는 `localStorage`에 저장 (`lib/storage.ts`).
- 단어 데이터는 `data/n5.ts`~`n1.ts`의 정적 TypeScript 배열 (`lib/types.ts`의 `Word` 타입). `data/index.ts`가 집계·조회를 담당.
- SRS는 `lib/srs.ts`의 SM-2 간소화 버전. 숙련도 100% = 복습 간격 21일 이상.
- 발음은 `lib/tts.ts`에서 Web Speech API(ja-JP) 사용 — 외부 API 없음.
- 페이지는 대부분 클라이언트 컴포넌트. 동적 라우트(`[level]`)는 서버 래퍼에서 `params`를 await 후 클라이언트 컴포넌트에 전달.
- 모바일 우선: `max-w-lg` 중앙 정렬, 하단 탭 내비게이션(`components/BottomNav.tsx`), 다크 모드는 `prefers-color-scheme` 기반.

## 규칙

- UI 문구는 한국어, 단어·예문은 일본어(뜻은 한국어).
- Tailwind 클래스는 정적 문자열로 (동적 조합 금지 — `LEVEL_META` 패턴 참고).
- localStorage 키는 `lfy:` 접두사 + 버전 suffix (`lfy:cards:v1`).
