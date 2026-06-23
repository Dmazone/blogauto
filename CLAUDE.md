# CLAUDE.md — 트렌드줌 블로그 운영 기준

## 프로젝트

- **블로그**: 트렌드줌 | GitHub Pages + Hugo (PaperMod) | `https://dmazone.github.io/blogauto`
- **목적**: 구글 애드센스 수익화 + 제휴마케팅
- **언어**: 한국어 기본 / 글로벌 섹션은 일본어·영어 원문

---

## 섹션 구조 (12개)

| 섹션 ID | 이름 | 디렉토리 | 언어 | 그룹 |
|---|---|---|---|---|
| latest-tech | 최신기술동향 | content/posts/latest-tech/ | 한국어 | 1(홀수) |
| economy | 경제 | content/posts/economy/ | 한국어 | 1(홀수) |
| society | 사회 | content/posts/society/ | 한국어 | 1(홀수) |
| humanities | 인문 | content/posts/humanities/ | 한국어 | 1(홀수) |
| entertainment | 연예이슈 | content/posts/entertainment/ | 한국어 | 1(홀수) |
| japan-trends | 日本トレンド | content/posts/japan-trends/ | **일본어** | 1(홀수) |
| health | 건강 | content/posts/health/ | 한국어 | 2(짝수) |
| it-devices | IT기기 | content/posts/it-devices/ | 한국어 | 2(짝수) |
| kr-realestate | 한국부동산 | content/posts/kr-realestate/ | 한국어 | 2(짝수) |
| world-travel | 세계여행지 | content/posts/world-travel/ | 한국어 | 2(짝수) |
| sports | 스포츠 | content/posts/sports/ | 한국어 | 2(짝수) |
| us-trends | Global Trends | content/posts/us-trends/ | **영어** | 2(짝수) |

> 건강 섹션: 운동 → 식단 → 질병 3일 주기 롤링
> 글로벌 섹션(japan-trends, us-trends): 해당 문화권 중심 + 한국 연관성 포함. 제목·본문·해시태그 모두 해당 언어로만 작성.

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
| 22:00 | `/post-daily` | 6개 섹션 포스팅 생성 + 예약발행 설정 (한국어 5+글로벌 1) |
| 07:00~09:30 | GitHub Actions | 포스팅 순차 공개 (30분 간격) |
| 08:00 | `/verify-posts` | 발행 점검 + 오류 자동 수정 |
| 10:00 | `/threads-post` | 스레드 게시 + 스하리·반하리 리포스트 |

---

## 콘텐츠 품질 기준 ★★★ (절대 준수 — 타협 없음)

> 이 블로그의 모든 포스팅은 **전문 기자가 쓴 것처럼 구체적이고, 독자가 끝까지 읽을 이유가 있어야** 한다.
> AI가 쓴 티가 나는 글은 애드센스 수익과 독자 신뢰 모두를 잃는다.

### 글 품질

| 항목 | 기준 |
|---|---|
| 분량 | **2,500자 이상** (공백 제외) — 부족하면 재작성 |
| 구조 | H2 5~6개, H2마다 H3 2~3개, H1 본문 금지 |
| 제목 | 핵심 키워드 앞쪽, 숫자·의문형·이익강조 중 1개 이상, **28자 이내** |
| 정보 밀도 | H2 하나당 최소 300자 + 구체적 사례·수치·인용 1개 이상 |
| 도입부 | 첫 문단에서 독자가 얻을 핵심 가치를 즉시 제시 (호기심 훅 필수) |
| 내부 링크 | 본문 안 1개 이상, 슬러그 실존 확인 후 삽입 |

**글쓰기 5대 원칙**
1. **AI 냄새 0%** — "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다" 절대 금지
2. **구체성** — 추상적 설명 대신 실제 사례·날짜·이름·수치로 뒷받침. 출처 없는 수치 사용 금지
3. **독창성** — 타 블로그 문장 복붙 금지. 정보를 재조합해 새로운 관점·해석을 제시
4. **가독성** — **볼드**, > 인용구, - 불릿을 적극 활용. 연속 빈 줄 2개 이상 금지
5. **완결성** — 독자가 다른 글을 찾을 필요가 없도록 주제를 충분히 소화

**글로벌 섹션 추가 원칙**
- japan-trends: 전문 100% 일본어. 일본 독자 관점 중심, 한일 연관성 자연스럽게 녹임
- us-trends: 전문 100% 영어. 글로벌 독자 관점 중심, 한국·K-컬처 시각 자연스럽게 녹임
- 어느 언어든 해당 문화권 원어민이 읽어도 어색하지 않은 자연스러운 문체 필수

---

### 이미지 품질

> 이미지는 단순 삽화가 아니라 **독자의 클릭과 체류를 이끄는 시각적 훅**이다.
> 섹션 스타일과 본문 내용이 정확히 일치해야 하며, 뭉개지거나 텍스트가 들어간 이미지는 실패다.

**이미지 3장 역할 정의**

| 파일 | 위치 | 역할 | 요건 |
|---|---|---|---|
| `{slug}-01.webp` | 도입부 직후 | 글의 핵심 개념을 시각화 | 본문 첫 주제와 직접 연관된 구체적 장면 |
| `{slug}-02.webp` | 2번째 H2 직후 | 비교·분석·데이터 시각화 | 이미지 1과 색감·구도·소재 완전히 다르게 |
| `{slug}-thumb.webp` | 커버 (목록·SNS) | 클릭을 유발하는 커버 | 사람 얼굴 중심 지양, 개념·사물·장면·아이콘 중심 |

**이미지 프롬프트 5대 원칙**
1. **영어 전용** — 한국어·일본어 제목 직접 삽입 금지. `topic.keyword` 기반 영어 묘사
2. **섹션 스타일 앵커로 시작** — `section.imageStyle`의 첫 구절을 프롬프트 맨 앞에 고정
3. **구체적 장면 묘사** — "a futuristic concept" 금지. "a developer typing code with holographic UI overlay" 수준으로
4. **텍스트·워터마크 완전 배제** — 프롬프트에 `no text, no watermark, no logo` 반드시 포함
5. **16:9 landscape 고정** — 세로·정사각형 절대 금지. `landscape 16:9, 1280x720` 명시

**이미지 품질 게이트 (생성 후 반드시 확인)**
- 파일 크기 15KB 미만 → 실패, 자동 재생성
- 섹션 스타일과 전혀 다른 분위기 → 프롬프트 수정 후 재생성
- 이미지 1과 이미지 2가 너무 유사 → 한쪽 구도·색감 변경 후 재생성
- 이미지 없이 발행된 포스팅 → `node scripts/fix_missing_images.mjs` 즉시 실행

---

## 구조 규칙

1. **이미지 개별 즉시 생성** — 일괄 생성 금지, 포스팅 1개 완료 직후 3장(01/02/thumb)
2. **categories 한국어 필수** — 글로벌 섹션은 해당 섹션명(日本トレンド / Global Trends) 사용
3. **Hugo 빌드 전 검증** — 영문 섹션 ID를 categories에 사용하면 빌드 전체 실패

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

## 이미지 생성 기술 규칙 (Pollinations.ai → sharp 업스케일)

| 항목 | 값 | 이유 |
|---|---|---|
| 생성 해상도 | `1280×720` (Pollinations 직접 지원) | landscape 16:9 퍼블리시 해상도 |
| 모델 | `flux` | 고품질 photorealistic 출력 |
| 옵션 | `nologo=true`, `enhance=false` | 로고 제거, 섹션 스타일 유지 |
| 재시도 | 실패 시 1회 자동 재시도 | HTTP 오류·timeout 대응 |
| 최종 포맷 | sharp로 webp 변환, quality 90 | 용량·품질 균형 |
| 이미지 누락 복구 | `node scripts/fix_missing_images.mjs` | 전체 스캔 후 누락만 생성 |
| 우선순위 | Flow → NanoBanana → Pollinations 순 | 고품질 소스 우선 시도 |

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
