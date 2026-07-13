# LangForYou 🇯🇵 — 일본어 학습 앱

JLPT 기반 일본어 단어 학습 앱. 모바일 우선 디자인으로, 플래시카드·퀴즈·간격 반복(SRS) 복습을 지원합니다.

## 주요 기능

- **JLPT 레벨별 단어장** — N5(180) · N4(160) · N3(150) · N2(130) · N1(110), 총 730단어
  - 각 단어: 한자 · 히라가나 읽기 · 한국어 뜻 · 품사 · 일본어 예문 + 번역
- **플래시카드 학습** — 카드를 뒤집어 읽기/뜻/예문 확인, 자동 발음 재생
- **음성 재생 (TTS)** — 브라우저 내장 Web Speech API(ja-JP·ko-KR) 사용, 서버·API 키 불필요
- **퀴즈 3종** — 뜻 고르기 / 읽기(한자→가나) 고르기 / 듣고 고르기
- **연속듣기** — 손대지 않고 흘려듣는 모드. 단어마다 일본어(읽기) 3회 → 한국어(뜻) 1회
  반복 재생 후 자동으로 다음 단어로 넘어감 (재생 속도 3단계 조절)
- **스와이프 뒤로가기** — 화면을 오른쪽으로 스와이프하면 이전 화면으로 이동
- **간격 반복 복습 (SRS)** — SM-2 간소화 알고리즘. "다시/어려움/알맞음/쉬움" 평가에 따라
  다음 복습 시점이 자동 조절되어 장기 기억을 극대화
- **학습 통계** — 연속 학습일, 정답률, 최근 7일 활동, 레벨별 진행률
- **모바일 최적화** — 하단 탭 내비게이션, 다크 모드, PWA(홈 화면에 추가 가능)

학습 진도는 브라우저 `localStorage`에 저장되므로 별도의 데이터베이스 없이 동작합니다.

## 기술 스택

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Web Speech API (일본어 TTS)

## 개발

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # 프로덕션 빌드
npm run start      # 프로덕션 서버
npm run lint       # ESLint
```

## Railway 배포

이 저장소에는 `railway.json`이 포함되어 있어 바로 배포할 수 있습니다.

1. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → 이 저장소 선택
2. Railway가 Next.js를 자동 감지해 `npm run build` → `npm run start`로 실행합니다
3. **Settings → Networking → Generate Domain**으로 공개 URL 생성

`PORT` 환경 변수는 Railway가 자동 주입하며, 시작 스크립트가 이를 사용합니다.

## 프로젝트 구조

```
app/
  page.tsx              # 홈 — 레벨 선택, 진도 요약, 복습 CTA
  level/[level]/        # 레벨 상세 — 단어 목록, 학습/퀴즈 진입
  learn/[level]/        # 플래시카드 학습 세션
  quiz/[level]/         # 퀴즈 (뜻/읽기/듣기)
  listen/[level]/       # 연속듣기 (일본어 3회 + 한국어 1회 자동 재생)
  review/               # 전체 레벨 SRS 복습
  stats/                # 학습 통계
components/             # 공용 UI (StudySession, BottomNav, AudioButton, SwipeBack...)
data/                   # JLPT 레벨별 단어 데이터 (n5~n1)
lib/
  srs.ts                # SM-2 간소화 간격 반복 알고리즘
  storage.ts            # localStorage 진도 저장 + React 훅
  tts.ts                # Web Speech API 일본어 발음
```

## 단어 추가하기

`data/n5.ts` 등의 배열에 같은 형식으로 항목을 추가하면 됩니다:

```ts
{
  id: "n5-101",
  kanji: "天気",
  kana: "てんき",
  meaning: "날씨",
  pos: "명사",
  example: { ja: "今日はいい天気ですね。", ko: "오늘은 날씨가 좋네요." },
}
```
