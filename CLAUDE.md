# CLAUDE.md — 트렌드줌 블로그 운영 지침

## 프로젝트 개요

- **블로그명**: 트렌드줌
- **플랫폼**: GitHub Pages + Hugo (PaperMod 테마)
- **목적**: 구글 애드센스 수익화 + 제휴마케팅
- **언어**: 한국어 (기술 용어는 영어 병기)
- **자동화**: 하루 10편, 섹션별 1편, 다음날 07:10~08:40 KST 예약 발행

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

> 건강 섹션: 날짜 기반으로 운동 → 식단 → 질병 순서로 3일 주기 롤링

---

## 핵심 포스팅 7대 원칙 ★ (반드시 준수)

### 1. 최신 트렌드 기반 서칭
- 포스팅 시작 전 **현재 그리니치 표준시(UTC)를 파악**하고 명시
- 그 시점 기준 **가장 최근 24~48시간 내 화제가 된 이슈**만 서칭하여 주제 선정
- STEP 1 프롬프트에 UTC 시간 포함 필수

### 2. SEO 제목 먼저 → 그에 맞는 상세 내용
- **SEO 최적화 제목을 먼저 확정**하고, 그 제목에 100% 부합하는 내용을 작성
- 제목 규칙:
  - 핵심 키워드를 제목 앞쪽에 배치
  - 숫자(년도·순위·개수), 의문형(~인가, ~할까), 이익 강조(완전 정리, 핵심만) 중 1개 이상
  - 클릭 유도 감성 단어 활용 (진짜, 숨은, 바뀌는, 충분한, 결국 등)
  - **28자 이내** (구글 검색결과 타이틀 잘림 방지)
- 제목과 내용이 불일치하면 독자가 이탈 → 애드센스 수익 감소

### 3. 마크다운 렌더링 검증 후 저장
- 포스팅 저장 전 **마크다운 렌더링 오류 자동 검증** 필수:
  - `~~텍스트~~` 의도치 않은 가운데 줄(취소선) 여부
  - 짝이 맞지 않는 `"` `'` `{` `}` `[` `]` `(` `)` 확인
  - YAML front matter 내 콜론(`:`) 뒤 따옴표 누락 여부
  - `---` 수평선이 의도치 않게 삽입된 경우
- 검증 실패 시 Gemini에게 수정 요청 후 재검증

### 4. 포스팅 1개 완료 후 이미지 즉시 생성 (개별 처리)
- **절대 10개 포스팅 후 이미지 일괄 생성 금지** → 이미지 혼용·중복 오류 발생
- 포스팅 1개 완료 직후, 해당 포스팅의 이미지만 즉시 생성:
  1. **썸네일 이미지** (`slug-thumb.webp`) — 커버용, 본문에는 미표시
  2. **본문 이미지 1** (`slug-01.webp`) — 도입부 직후 삽입
  3. **본문 이미지 2** (`slug-02.webp`) — 2번째 H2 직후 삽입
- 각 이미지 파일명은 **SEO 최적화**: 포스팅 슬러그 기반, 주제를 명확히 반영
- 이미지·포스팅에 문제 발생 시 해당 포스팅 1개만 수정

### 5. 10개 완료 시 텔레그램 링크 전송
- 10개 포스팅 완료 후 각 포스팅 제목 + URL을 텔레그램으로 전송:
  ```
  📝 트렌드줌 오늘의 포스팅 10개 완료!
  1. 제목 — https://dmazone.github.io/blogauto/posts/섹션/slug/
  2. 제목 — ...
  ```
- TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
- CHAT_ID: `7724357585`

### 6. 구글 애드센스 승인 기준 콘텐츠
- **독창적 내용 필수**: 다른 사이트 문장 복붙 절대 금지, 반드시 재해석
- **읽을 가치**: 독자가 실제로 유용한 정보·인사이트를 얻어야 함
- **1,500자 이상**: 너무 짧은 글은 애드센스 저품질 판정
- **출처 없는 수치·통계 사용 금지**
- **광고성·스팸 느낌 금지**: 제품 강요, 과장 표현 지양
- 문체는 구어체+문어체 중간 톤, 독자에게 직접 말하기 (~해보세요, ~할 수 있어요)
- **금지 표현**: "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다", 영어 직역체

### 7. 헤딩 계층 + 단락 여백 최적화
- 헤딩 계층 엄수:
  - `# H1` — **본문에 절대 사용 금지** (front matter title이 H1 역할)
  - `## H2` — 주요 섹션 4개
  - `### H3` — 각 H2 아래 2~3개 소주제
  - `"1. 제목"` 숫자 번호 방식 절대 금지 — 마크다운 `##` `###`만 사용
- 단락 여백: 각 문단 사이 빈 줄 1개로 분리 (2개 이상 연속 빈 줄 금지 — 모바일 가독성)
- 가독성 향상: **볼드**, > 인용구, - 불릿 적극 활용
- 코드·명령어: 반드시 ` ```bash ` 블록 사용

---

## 포스팅 구조 (Technical SEO)

```
front matter (YAML)
  title, date, slug, tags, categories, description, cover
---

[도입부 2~3문장] ← 핵심 키워드 자연 포함
![도입부 이미지](BASE_URL/images/slug-01.webp)

## H2 첫 번째 섹션
### H3 소주제
### H3 소주제

## H2 두 번째 섹션
![섹션 이미지](BASE_URL/images/slug-02.webp)
### H3 소주제
### H3 소주제

## H2 세 번째 섹션
### H3 소주제

## H2 네 번째 섹션
[내부 링크 1개 이상]

#해시태그1 #해시태그2 ... (7개 이상, 맨 마지막 줄)
```

**이미지 규칙**:
- 절대 URL: `https://dmazone.github.io/blogauto/images/slug-N.webp`
- alt 태그: 한국어로 작성
- AI 생성 이미지만 사용 (저작권 없음)

**SEO front matter 규칙**:
- `description`: 160자 이내, 핵심 키워드 + 독자 혜택 중심, 빈값 금지
- `tags`: 키워드 기반 3~6개, 중복 없이
- `cover.image`: 썸네일 URL (`slug-thumb.webp`)
- `cover.hiddenInSingle: true` — 본문에 썸네일 미표시 (커버 전용)
- `cover.alt`: 한국어 alt 텍스트

---

## 자동화 파이프라인 (9단계)

### 역할 분담 원칙
- **Gemini 2.5 Flash**: 트렌드 수집·검증·집필·SEO 루프 담당
- **Claude Sonnet**: 이미지 생성 완료 후 본문 완전 검수 & 직접 수정 (토큰 제한 없음)
- **Claude Haiku**: 생성된 이미지 3장 비전 검수 (주제 적합성·품질·왜곡 판단)
- **Claude에 본문 초안 집필 맡기는 코드 절대 작성 금지** (집필은 Gemini 전담)

### 파이프라인 순서 (1개 포스팅 기준)

| 단계 | 담당 | 내용 |
|---|---|---|
| STEP 1 | Gemini | UTC 시간 기반 최신 트렌드 주제·슬러그 선정 + SEO 제목 |
| STEP 2 | Gemini + Google Search | 최신 웹 데이터 수집 |
| STEP 3 | Gemini | 신뢰성·최신성·중복 여부 교차 검증 |
| STEP 4 | Gemini | H2/H3 SEO 아웃라인 + 메타 디스크립션 설계 |
| STEP 5 | Gemini | 본문 전체 집필 (1,500~2,500자) |
| STEP 6 | Gemini (최대 2회) | SEO 자체 검토 & 수정 루프 |
| STEP 7.5 | Claude Code | **마크다운 렌더링 검증** (취소선·따옴표·괄호·H1 오류 자동 수정) |
| STEP 8 | Pollinations / Flow | **본문 이미지 2장 + 썸네일 1장** 즉시 생성 |
| STEP 8c | Claude Haiku (비전) | **이미지 3장 각각 검수** — 주제 불일치·왜곡·혐오·저화질 발견 시 재생성 |
| STEP 7 | Claude Sonnet (토큰 무제한) | **본문 완전 검수 & 직접 수정** — 맥락·오타·AI상투어·분량·헤딩·여백 전면 교정 |
| STEP 9 | GitHub | 커밋 & 푸시 |

> 다음 포스팅은 반드시 STEP 9 완료 후 시작

### Claude 검수 기준 (STEP 7 — 이미지 완료 후 실행)
- 토큰 제한 없이 **Claude Sonnet이 직접 전체 본문 수정** (Gemini 재요청 없음)
- 제목·키워드와 내용 일치 여부
- 오타·문법·맞춤법 전면 교정
- AI 상투어·영어 직역체 완전 제거
- 출처 없는 수치 삭제 후 정성적 설명으로 대체
- 분량 부족 시 직접 보강 (최소 1,500자)
- 이미지 마크다운·내부링크·해시태그는 절대 유지

### Claude 이미지 검수 기준 (STEP 8c)
불합격 → 즉시 재생성:
- 포스팅 주제와 전혀 다른 내용 (예: 경제 글에 운동 사진)
- 강제로 늘어졌거나 심하게 왜곡된 비율
- 극도로 흐릿하거나 15KB 미만 손상 파일
- 혐오스럽거나 불쾌한 내용
- 아무 의미 없는 단색·노이즈 이미지

### 실행 방법

```bash
# 특정 섹션 1개
node scripts/agent_core.js --section economy

# 건강 섹션 서브토픽 지정
node scripts/agent_core.js --section health --subtopic 운동

# 전체 10개 섹션 (다음날 07:10 KST 예약 발행)
node scripts/daily_runner.js

# 특정 섹션만
node scripts/daily_runner.js --only economy,health,sports

# N번째부터 재개
node scripts/daily_runner.js --from 4
```

---

## 디렉토리 구조

```
BlogAuto/
├── CLAUDE.md
├── config.toml                    ← Hugo 설정 (10개 메뉴)
├── content/
│   └── posts/
│       ├── latest-tech/
│       ├── economy/
│       ├── society/
│       ├── humanities/
│       ├── entertainment/
│       ├── health/
│       ├── it-devices/
│       ├── kr-realestate/
│       ├── world-travel/
│       └── sports/
├── scripts/
│   ├── sections.js                ← 10개 섹션 정의
│   ├── agent_core.js              ← 9단계 파이프라인
│   ├── daily_runner.js            ← 10개 섹션 순차 실행
│   └── sns_promoter.js            ← SNS 자동 홍보
├── static/
│   └── images/                    ← AI 생성 이미지
│       ├── slug-01.webp           ← 본문 이미지 1
│       ├── slug-02.webp           ← 본문 이미지 2
│       └── slug-thumb.webp        ← 썸네일 (커버 전용)
├── layouts/
│   └── partials/
│       └── extend_head.html       ← JSON-LD Article 스키마 자동 삽입
└── .github/workflows/
    └── auto-post.yml              ← GitHub Actions (매일 UTC 0:00)
```

---

## GitHub Actions 스케줄

- 매일 UTC 00:00 (KST 09:00) 자동 실행
- 예약 발행: 다음날 07:10~08:40 KST (10분 간격, 10개)
- GitHub Secrets 필요: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `BLOG_BASE_URL`

---

## 수익화 설정

- **애드센스**: `layouts/partials/ads.html`에 코드 삽입
- **쿠팡파트너스**: 섹션 관련 상품 추천 링크 삽입
- **제휴마케팅**: AI 도구, IT 기기, 건강 제품 등

---

## 텔레그램 알림 (필수)

장기 작업(이미지 생성, 배포, 파이프라인 등) 완료 시 **항상** 텔레그램으로 전송.

```js
node -e "
const https = require('https');
const msg = encodeURIComponent('작업명 완료!\n결과: 성공 N개\n블로그: https://dmazone.github.io/blogauto/');
https.get('https://api.telegram.org/bot8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg/sendMessage?chat_id=7724357585&text=' + msg, r => {});
"
```

- TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
- CHAT_ID: `7724357585`

---

## 개발 원칙

- 사장님은 코드를 직접 수정하지 않는다 — 모든 변경은 Claude Code가 직접 수행
- API Key는 반드시 환경변수(`process.env`)로 처리
- 에러 핸들링(try-catch) 완벽 적용
- withRetry()로 503/429 에러 자동 재시도
- 각 포스팅은 독립적으로 생성·수정 가능해야 함 (1개 실패가 전체에 영향 없도록)

## 금지 사항

- 타 블로그 문장 그대로 복붙
- 출처 없는 수치·통계 사용
- 영어 원문 직역체 (자연스러운 한국어 재작성)
- 이미지 저작권 있는 스크린샷 무단 사용
- Claude에 본문 집필 맡기는 코드 작성
- 10개 포스팅 후 이미지 일괄 생성 (개별 즉시 생성 필수)
