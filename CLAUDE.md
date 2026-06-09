# CLAUDE.md — 트렌드줌 블로그 운영 기준

## 프로젝트

- **블로그**: 트렌드줌 | GitHub Pages + Hugo (PaperMod) | `https://dmazone.github.io/blogauto`
- **목적**: 구글 애드센스 수익화 + 제휴마케팅
- **언어**: 한국어 (기술 용어 영어 병기)

---

## 섹션 구조 (10개)

| 섹션 ID | 이름 | 디렉토리 |
|---|---|---|
| latest-tech | 최신기술동향 | content/posts/latest-tech/ |
| economy | 경제 | content/posts/economy/ |
| society | 사회 | content/posts/society/ |
| humanities | 인문 | content/posts/humanities/ |
| entertainment | 연예이슈 | content/posts/entertainment/ |
| health | 건강 | content/posts/health/ |
| it-devices | IT기기 | content/posts/it-devices/ |
| kr-realestate | 한국부동산 | content/posts/kr-realestate/ |
| world-travel | 세계여행지 | content/posts/world-travel/ |
| sports | 스포츠 | content/posts/sports/ |

> 건강 섹션: 운동 → 식단 → 질병 3일 주기 롤링

---

## 핵심 설정

| 항목 | 값 |
|---|---|
| Gemini Gem URL | `https://gemini.google.com/u/2/gem/cca9fca55f60` |
| Google 계정 | `paydma` (DmA 01, Gemini Pro 구독) |
| 텔레그램 TOKEN | `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg` |
| 텔레그램 CHAT_ID | `7724357585` |
| Threads 계정 | `paydma.action` |

---

## 일일 자동화 타임라인

| 시각 (KST) | 스킬 | 내용 |
|---|---|---|
| 22:00 | `/post-daily` | 5개 섹션 포스팅 생성 + 예약발행 설정 |
| 07:00~09:00 | GitHub Actions | 포스팅 순차 공개 (30분 간격) |
| 08:00 | `/verify-posts` | 발행 점검 + 오류 자동 수정 |
| 10:00 | `/threads-post` | 스레드 게시 + 스하리·반하리 리포스트 |

---

## 콘텐츠 품질 규칙 (절대 준수)

1. **제목 28자 이내** — 핵심 키워드 앞쪽, 숫자·의문형·이익강조 중 1개 이상
2. **본문 2,500자 이상** — H2 5~6개, H3 각 2~3개, H1 본문 사용 금지
3. **내부 링크 필수** — 마지막 H2에 1개 이상, 저장 전 슬러그 실존 확인
4. **이미지 개별 즉시 생성** — 일괄 생성 금지, 포스팅 1개 완료 직후 3장(01/02/thumb)
5. **이미지 프롬프트 영어 전용** — `topic.keyword` 기반, 한국어 제목 직접 삽입 금지
6. **categories 한국어 필수** — 영문 섹션 ID 사용 시 Hugo 빌드 전체 실패

---

## Hugo Page Bundle 구조

```
content/posts/{섹션}/{slug}/
  ├── index.md          ← 포스팅 본문
  ├── {slug}-01.webp    ← 본문 이미지 1 (도입부 직후)
  ├── {slug}-02.webp    ← 본문 이미지 2 (2번째 H2 직후)
  └── {slug}-thumb.webp ← 썸네일 (커버, 본문 미표시)
```

- 이미지 경로: 상대 경로 `![alt](slug-01.webp)` — `static/images/` 저장 금지
- `cover.hiddenInSingle: true` 필수
- 이미지 비율: **landscape 16:9** (1280×720) — 정사각형·세로 금지

---

## 이미지 생성 규칙 (Stable Horde — 반드시 준수)

| 항목 | 값 | 이유 |
|---|---|---|
| 해상도 제출 | `width: 640, height: 384` | 익명키 640px 초과 시 403 |
| 업스케일 | sharp로 1280×720 webp 변환 | 퍼블리시 해상도 |
| 폴링 타임아웃 | **30분** | 익명 큐 대기 15~20분 |
| 재시도 | 실패 시 1회 자동 재시도 | no data, timeout 대응 |
| 동시 제출 | 600ms 간격 순차 제출 | 초당 2개 rate limit |
| 이미지 누락 복구 | `node scripts/fix_missing_images.mjs` | 전체 스캔 후 누락만 생성 |

**이미지 없이 발행된 포스팅은 반드시 fix_missing_images.mjs로 추후 보완.**

---

## 개발 원칙

- 모든 코드 수정은 Claude Code가 직접 수행 (사장님 코드 수정 안 함)
- API Key는 환경변수(`process.env`)로 처리
- `withRetry()` — 503/429 자동 재시도
- 포스팅 1개 실패가 전체에 영향 없도록 독립 처리
- **Claude에 본문 집필 맡기는 코드 작성 금지** (집필은 Gemini 전담)
- **Anthropic API(ANTHROPIC_API_KEY) 사용 금지** — 비용 발생
- 장기 작업 완료 시 **항상** 텔레그램 알림 전송
- git 커밋 시 `git add content/` (git add . 금지 — 스크린샷 등 의도치 않은 파일 커밋 방지)

---

## 금지

- 타 블로그 문장 복붙 / 출처 없는 수치·통계
- 영어 원문 직역체
- `static/images/` 에 신규 이미지 저장
- 이미지 일괄 생성
- 금지 표현: "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다"

---

## 스킬 목록

| 명령어 | 파일 | 설명 |
|---|---|---|
| `/post-daily` | `.claude/commands/post-daily.md` | 22:00 포스팅 자동화 |
| `/verify-posts` | `.claude/commands/verify-posts.md` | 08:00 발행 점검·수정 |
| `/threads-post` | `.claude/commands/threads-post.md` | 10:00 스레드 게시·리포스트 |
