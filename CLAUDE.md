# CLAUDE.md — 트렌드줌 블로그 운영 지침

## 프로젝트 개요

- **블로그명**: 트렌드줌
- **플랫폼**: GitHub Pages + Hugo (PaperMod 테마)
- **목적**: 구글 애드센스 수익화 + 제휴마케팅
- **언어**: 한국어 (기술 용어는 영어 병기)
- **자동화**: 하루 5편 (2그룹 교대), 다음날 07:10~07:50 KST 예약 발행

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
- **절대 일괄 생성 금지** — 포스팅별 이미지 혼용·중복 오류 발생
- 포스팅 1개 완료 직후, 해당 포스팅의 이미지만 즉시 생성:
  1. **썸네일 이미지** (`slug-thumb.webp`) — 커버용, 본문에는 미표시
  2. **본문 이미지 1** (`slug-01.webp`) — 도입부 직후 삽입
  3. **본문 이미지 2** (`slug-02.webp`) — 2번째 H2 직후 삽입
- 각 이미지 파일명은 **SEO 최적화**: 포스팅 슬러그 기반, 주제를 명확히 반영
- 이미지·포스팅에 문제 발생 시 해당 포스팅 1개만 수정

### 5. 5개 완료 시 텔레그램 링크 전송
- 5개 포스팅 완료 후 각 포스팅 제목 + URL을 텔레그램으로 전송:
  ```
  📝 트렌드줌 오늘의 포스팅 5개 완료!
  1. 제목 — https://dmazone.github.io/blogauto/posts/섹션/slug/
  2. 제목 — ...
  ```
- TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
- CHAT_ID: `7724357585`

### 6. 구글 애드센스 승인 기준 콘텐츠
- **독창적 내용 필수**: 다른 사이트 문장 복붙 절대 금지, 반드시 재해석
- **읽을 가치**: 독자가 실제로 유용한 정보·인사이트를 얻어야 함
- **2,500자 이상**: 너무 짧은 글은 애드센스 저품질 판정 (최소 2,000자 유지)
- **출처 없는 수치·통계 사용 금지**
- **광고성·스팸 느낌 금지**: 제품 강요, 과장 표현 지양
- 문체는 구어체+문어체 중간 톤, 독자에게 직접 말하기 (~해보세요, ~할 수 있어요)
- **금지 표현**: "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다", 영어 직역체

### 7. 헤딩 계층 + 단락 여백 최적화
- 헤딩 계층 엄수:
  - `# H1` — **본문에 절대 사용 금지** (front matter title이 H1 역할)
  - `## H2` — 주요 섹션 **5~6개**
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
![도입부 이미지](slug-01.webp)

## H2 첫 번째 섹션
### H3 소주제
### H3 소주제

## H2 두 번째 섹션
![섹션 이미지](slug-02.webp)
### H3 소주제
### H3 소주제

## H2 세 번째 섹션
### H3 소주제

## H2 네 번째 섹션
### H3 소주제

## H2 다섯 번째 섹션
[내부 링크 1개 이상]

#해시태그1 #해시태그2 ... (7개 이상, 맨 마지막 줄)
```

**이미지 규칙 (Hugo Page Bundle — 상대 경로)**:
- 본문 이미지: `![alt](slug-01.webp)` — 번들 디렉토리 내 상대 경로
- 저장 위치: `content/posts/섹션/slug/slug-01.webp` (static/images/ 아님)
- alt 태그: 한국어로 작성
- AI 생성 이미지만 사용 (저작권 없음)

**SEO front matter 규칙**:
- `description`: 160자 이내, 핵심 키워드 + 독자 혜택 중심, 빈값 금지
- `tags`: 키워드 기반 3~6개, 중복 없이
- `cover.image`: `"slug-thumb.webp"` (상대 경로, Hugo Page Bundle이 자동 해석)
- `cover.hiddenInSingle: true` — 본문에 썸네일 미표시 (커버 전용)
- `cover.alt`: 한국어 alt 텍스트

---

## Gemini Pro 브라우저 모드 ★ (Claude가 직접 조작)

> **절대 원칙: 포스팅 요청 시 항상 Chrome 브라우저(claude-in-chrome) 사용. Gemini API 모드 금지.**
> Gemini Pro 구독으로 2.5 Pro + 구글 실시간 검색 활용 — API(Flash)보다 품질이 훨씬 높음.

### 개요
- **Claude Code가 `claude-in-chrome` MCP로 사용자 Chrome을 직접 조작**하여 Gemini Pro와 대화
- 사용자의 실제 Chrome에서 paydma 계정이 이미 로그인된 상태 사용 (Playwright 불필요)
- API 호출 없이 Gemini 2.5 Pro의 구글 실시간 검색 기능 그대로 활용
- **Gemini가 쓴 본문은 반드시 Claude Code가 이 대화에서 직접 검수·수정**

### 계정 및 Gem 정보
| 항목 | 값 |
|---|---|
| Google 계정 | `paydma` (DmA 01 · Gemini Pro 구독) |
| Gem URL | `https://gemini.google.com/u/2/gem/cca9fca55f60` (블로그포스팅 Gem) |
| `.env` 키 | `GEMINI_GEM_URL=https://gemini.google.com/u/2/gem/cca9fca55f60` |

### Claude의 포스팅 실행 절차 (claude-in-chrome 사용)

Claude가 포스팅 5개를 직접 실행할 때 **섹션마다 아래 흐름 반복**:

1. **`mcp__claude-in-chrome__tabs_context_mcp`** 로 Chrome 탭 확인
2. **Gem URL로 새로 이동** (`navigate` → `https://gemini.google.com/u/2/gem/cca9fca55f60`)
   - 반드시 매 섹션마다 새로 이동 (버튼 상태 초기화)
   - Gem 로드 후 버튼 레이블이 "메시지 보내기"인지 확인
3. **단일 종합 메시지 전송** (트렌드 조사 + 주제 + 본문 + 이미지 프롬프트를 한 번에 요청)
   - 입력창 `rich-textarea .ql-editor`에 `document.execCommand('insertText', false, text)` 삽입
   - `gem-icon-button.send-button button` (label="메시지 보내기") 클릭으로 전송
   - ⚠️ 전송 후 버튼이 "대답 생성 중지"로 바뀌면 정상 — 절대 다시 클릭하지 않음
4. **응답 대기** (30초 간격으로 폴링, 최대 10분)
   - 버튼이 "메시지 보내기"로 돌아오고 `message-content` 길이가 안정되면 완료
5. **응답 추출** (`document.querySelectorAll('message-content')[0]?.innerText`)
6. **Claude Code가 직접 본문 검수·수정** (이 대화 내에서, 별도 API 호출 없음)
   - AI 상투어 제거, 제목·키워드 일치, 2500자+, H1 금지, H2 5~6개 헤딩 구조 확인
7. **`scripts/save_post.js`** stdin JSON으로 전달 → 이미지 생성 + git push

### 단일 종합 메시지 포맷 (섹션별 적용)
```
[섹션: {섹션명}] 날짜: {UTC 날짜}
기존 슬러그(중복금지): {slug1, slug2, ...}

구글 검색으로 지금 이 섹션에서 가장 화제인 최신 이슈를 조사하고,
아래 형식으로 블로그 포스팅을 **한 번에** 완성해줘.

출력 형식 (순서 엄수):
===TOPIC===
{"title":"...","slug":"...","keyword":"...","description":"..."}
===BODY===
(마크다운 본문, front matter 없이, 2500자+)
(이미지1: ![alt]({slug}-01.webp))  ← 상대 경로, Hugo Page Bundle
(H2 5~6개, H3 각 2~3개, 마지막 H2에 내부링크, 두번째 H2 직후 이미지2)
(이미지2: ![alt]({slug}-02.webp))  ← 상대 경로
(마지막 줄 해시태그 7개+)
===PROMPTS===
{"imgPrompts":["본문이미지1 프롬프트","본문이미지2 프롬프트","썸네일 프롬프트"]}
```

### Gemini 응답 추출 방법 (claude-in-chrome)
```javascript
document.querySelectorAll('message-content')[0]?.innerText ?? ''
```

### 로그인 이슈 발생 시
- `https://accounts.google.com` 감지 시 → `/u/2/` URL로 재이동하면 paydma 자동 선택
- Claude가 로그인 과정 전체를 브라우저 자동화로 처리 (사용자 개입 불필요)

---

## 자동화 파이프라인 (9단계)

### 역할 분담 원칙
- **Gemini 2.5 Pro (Chrome 브라우저)**: 트렌드 수집·검증·집필·SEO 루프 담당 (API 사용 금지)
- **Claude Code (이 대화)**: Gemini 본문 완전 검수 & 직접 수정 — 별도 API 호출 없이 대화 내에서 처리
- **Claude Haiku**: 생성된 이미지 3장 비전 검수 (save_post.js 내부, API 크레딧 필요 시)
- **Claude에 본문 초안 집필 맡기는 코드 절대 작성 금지** (집필은 Gemini 전담)

### 파이프라인 순서 (1개 포스팅 기준)

| 단계 | 담당 | 내용 |
|---|---|---|
| STEP 1 | Gemini | UTC 시간 기반 최신 트렌드 주제·슬러그 선정 + SEO 제목 |
| STEP 2 | Gemini + Google Search | 최신 웹 데이터 수집 |
| STEP 3 | Gemini | 신뢰성·최신성·중복 여부 교차 검증 |
| STEP 4 | Gemini | H2/H3 SEO 아웃라인 + 메타 디스크립션 설계 |
| STEP 5 | Gemini | 본문 전체 집필 (2,500자 이상) |
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
- 분량 부족 시 직접 보강 (최소 2,500자)
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
│       └── 섹션/                  ← 예: economy/
│           └── slug/              ← Hugo Page Bundle
│               ├── index.md       ← 포스팅 본문
│               ├── slug-01.webp   ← 본문 이미지 1
│               ├── slug-02.webp   ← 본문 이미지 2
│               └── slug-thumb.webp ← 썸네일
├── scripts/
│   ├── sections.js                ← 10개 섹션 정의 (2그룹 교대)
│   ├── agent_core.js              ← 9단계 파이프라인
│   ├── daily_runner.js            ← 5개 섹션 순차 실행 (그룹별)
│   ├── migrate_page_bundles.mjs   ← 이미지 번들 마이그레이션 (1회 실행)
│   └── sns_promoter.js            ← SNS 자동 홍보
├── static/
│   └── images/                    ← 고아 이미지만 남음 (신규는 번들에 저장)
├── layouts/
│   └── partials/
│       └── extend_head.html       ← JSON-LD Article 스키마 자동 삽입
└── .github/workflows/
    └── auto-post.yml              ← GitHub Actions (매일 UTC 0:00)
```

---

## 일일 자동화 워크플로우 (매일 반복)

### 타임라인 (KST 기준)

| 시각 | 담당 | 내용 |
|------|------|------|
| 22:00 | Windows 작업 스케줄러 | `BlogAuto-Generate` 실행 → daily_runner.js 시작 |
| 22:00 | 텔레그램 | **알림 1: 작업 시작** — 날짜·섹션 수·발행 예정 시각 |
| 22:00~23:30 | daily_runner.js | Gemini Pro(Chrome)로 5개 섹션 순차 생성 (그룹별) |
| ~23:30 | 텔레그램 | **알림 2: 예약발행 완료** — 성공/실패 수 + 5개 링크 |
| 07:10~07:50 | GitHub Actions (scheduled-deploy.yml) | 10분 간격 Hugo 재빌드 → 포스팅 순차 공개 |
| 09:20 | Windows 작업 스케줄러 | `BlogAuto-Verify` 실행 → verify_posts.js 시작 |
| 09:20 | verify_posts.js | `gh workflow run deploy.yml` 강제 트리거 (백업 배포) |
| 09:22 | verify_posts.js | 5개 URL 각각 HTTP 200 확인 (실패 시 30초 후 재시도) |
| 09:22 | 텔레그램 | **알림 3: 발행 확인 완료** — 정상/미게재 수 + 세부 결과 |

### 텔레그램 3대 알림

```
알림1 (22:00): 🚀 트렌드줌 예약발행 작업 시작! (그룹N, 5개)
알림2 (~23:30): ✅ 트렌드줌 예약발행 완료! (5개 링크 포함)
알림3 (09:22): 📊 트렌드줌 발행 확인 완료 (✅N개 / ❌N개)
```

### 관련 스크립트

| 파일 | 역할 |
|------|------|
| `scripts/daily_runner.js` | 5개 포스팅 생성 (그룹별 교대) + 알림1·2 전송 + posts_log.json 저장 |
| `scripts/verify_posts.js` | 배포 트리거 + URL 확인 + 알림3 전송 |
| `scripts/telegram.js` | 텔레그램 전송 공통 헬퍼 |
| `data/posts_log.json` | 어제 생성된 포스팅 목록 (verify_posts가 읽음, git 제외) |

### Windows 작업 스케줄러 초기 등록 (1회)

```powershell
# 관리자 PowerShell에서 실행
powershell -ExecutionPolicy Bypass -File scripts\setup_scheduler.ps1
```

### GitHub Actions 배포 워크플로우

| 파일 | 트리거 | 역할 |
|------|--------|------|
| `deploy.yml` | push to main / workflow_dispatch | 즉시 Hugo 빌드 + Pages 배포 |
| `scheduled-deploy.yml` | UTC 22:10~22:50 + 00:10 | 5개 포스팅 순차 공개 (KST 07:10~07:50) |

> **배포 신뢰성**: scheduled-deploy.yml이 GitHub 스케줄 지연으로 누락되더라도
> verify_posts.js(09:20 KST)가 `gh workflow run deploy.yml`을 강제 트리거하여 보완.

---

## GitHub Actions 스케줄

- `scheduled-deploy.yml`: UTC 22:10~22:50 + 00:10, 10분 간격 Hugo 재빌드 (KST 07:10~07:50)
- `deploy.yml`: push 시 즉시 빌드 / 수동 트리거 가능
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
- 포스팅 후 이미지 일괄 생성 (개별 즉시 생성 필수)
- `static/images/`에 이미지 저장 (Hugo Page Bundle 상대 경로 사용 필수)
