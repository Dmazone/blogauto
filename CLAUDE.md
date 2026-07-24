# CLAUDE.md — 트렌드줌 블로그 운영 기준

## 프로젝트

- **블로그**: 트렌드줌 | GitHub Pages + Hugo (PaperMod) | `https://dmazone.github.io/blogauto`
- **목적**: 구글 애드센스 수익화 + 쿠팡파트너스 제휴마케팅
- **언어**: 한국어 기본 / japan-trends는 일본어 / us-trends는 영어

---

## 섹션 구조 (13개)

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
| trending-picks | 트렌드상품 | content/posts/trending-picks/ | 한국어 | **매일(group:0)** |

**그룹 운영 규칙:**
- Group 1(홀수날): latest-tech, economy, society, humanities, entertainment, japan-trends
- Group 2(짝수날): health, it-devices, kr-realestate, world-travel, sports, us-trends
- trending-picks(group:0): 매일 두 그룹 모두에 추가 → 하루 **7개** 포스팅
- 건강: 운동 → 식단 → 질병 3일 주기 롤링
- 글로벌 섹션: 제목·본문·해시태그 모두 해당 언어로만 작성
- trending-picks: 쿠팡파트너스 trackingCode **AF8691300** 링크 필수 포함

---

## 핵심 설정

| 항목 | 값 |
|---|---|
| Gemini Gem URL | `https://gemini.google.com/u/2/gem/cca9fca55f60` |
| Google 계정 | `paydma` (DmA 01, Gemini Pro 구독) |
| 텔레그램 TOKEN | `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg` |
| 텔레그램 CHAT_ID | `7724357585` |
| Threads 계정 | `paydma.action` |
| 쿠팡파트너스 trackingCode | `AF8691300` |

---

## 일일 자동화 타임라인

| 시각 (KST) | 작업 | 내용 |
|---|---|---|
| 01:00 | `node scripts/daily_runner.js` | 7개 섹션 포스팅 생성 + 예약발행 설정 |
| 05:00~08:00 | GitHub Actions (scheduled-deploy) | 포스팅 30분 간격 순차 공개 (7개) |
| 08:00 | `/verify-posts` | 발행 점검 + 오류 자동 수정 |
| 10:00~15:00 | `/threads-post` | 1시간 간격 6회 게시 |

**발행 시간표** (sectionIndex 0~6 → 05:00~08:00 KST):
`05:00 / 05:30 / 06:00 / 06:30 / 07:00 / 07:30 / 08:00`
trending-picks는 항상 마지막(index 6 = 08:00)에 발행.

---

## 실시간 트렌드 조사 의무 ★★★★★

> 트렌드줌은 트렌드 블로그다. **오래된 이슈 = 블로그 존재 이유 부정.**

**Turn 1 전 필수 수행 순서 (불변):**

1. **날짜 확인** — `new Date()`로 오늘 날짜(YYYY-MM-DD) 확인 후 Gemini 프롬프트 최상단에 명시
2. **실시간 검색** — Google 검색으로 최근 72시간 이내 핫이슈 조사
3. **신선도 검증** — "이 이슈가 지금도 진행 중인가" 판단. **2주 이상 전 이슈는 탈락**
   - 예외: 최근 새 전개(반전·속보)가 있거나 오늘 기준 재점화된 경우

**주제 자동 탈락 조건:**
- 이슈 발생 2주 이상 전, 새 전개 없음
- 구체적 날짜·인물·기업·수치 없는 추상 주제
- Gemini 학습 데이터만으로 생성 (실시간 검색 없음)
- "~는 중요합니다" 수준의 범용 정보글

---

## 콘텐츠 품질 기준 ★★★

> **전문 기자 수준의 구체성** + **독자가 끝까지 읽을 이유** 두 가지가 모든 글의 기준이다.

### 글 구조 기준

| 항목 | 기준 |
|---|---|
| 분량 | **2,500자 이상** (공백 제외) |
| 구조 | H2 4~6개, H2마다 H3 2~3개, H1 본문 사용 금지 |
| 제목 | 핵심 키워드 앞쪽 배치, 숫자·의문형·이익강조 중 1개 이상, **28자 이내** |
| 정보 밀도 | H2 하나당 최소 300자 + 구체적 사례·수치·인용 1개 이상 |
| 도입부 | 첫 문단에서 독자 핵심 가치 즉시 제시 (호기심 훅 필수) |
| 내부 링크 | 본문 안 **최소 2개, 최대 3개** — 슬러그 실존 확인 후 삽입 |
| 해시태그 | 글 마지막 줄에 7개 이상 |

### 글쓰기 5대 원칙

1. **AI 냄새 0%** — "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다" 절대 금지
2. **구체성** — 실제 사례·날짜·이름·수치로 뒷받침. 출처 없는 수치 금지
3. **독창성** — 타 블로그 복붙 금지. 정보 재조합해 새 관점·해석 제시
4. **가독성** — **볼드**, > 인용구, - 불릿 적극 활용. 연속 빈 줄 2개 이상 금지
5. **완결성** — 독자가 다른 글 찾을 필요 없도록 주제 충분히 소화

### E-E-A-T 기준 (애드센스 필수)

| 항목 | 요건 | 위반 예시 → 수정 |
|---|---|---|
| Experience | "독자에게 실제로 어떤 의미인가" 관점 서술 | 정보 나열 → 실용적 행동 조언 포함 |
| Expertise | 출처 있는 수치만 사용 (기관명+날짜) | "전문가들은 30% 상승 예측" → "한국은행(2026.07.10) 하반기 2.1% 전망" |
| Authority | 공식 발표문·보도자료·법령 1차 소스 인용 | 감정적 단정 → 수치 기반 객관 서술 |
| Trust | 불확실한 정보는 불확실하다고 명시 | "~것으로 보인다" 남발 → 사실/추정 명확히 구분 |

### 롱테일 키워드 전략

| 나쁜 예 | 좋은 예 |
|---|---|
| "삼성 갤럭시" | "갤럭시 Z플립8 배터리 업그레이드 2026 스펙" |
| "아파트 가격" | "2026 서울 청약 현금 납부 조건 강화 영향" |
| "손흥민" | "손흥민 LAFC 출전시간 관리 이유 2026 시즌" |

**키워드 배치**: 제목 앞쪽 → 도입부 첫 문단 → H2 소제목 → description

### 내부 링크 규칙

- 형식: `[갤럭시 Z폴드8 스펙 전망](/posts/it-devices/galaxy-z-fold8-unpacked-rumors-2026/)`
- "여기", "클릭" 금지 — 주제 키워드 포함 앵커텍스트 필수
- 같은 섹션 포스팅 우선 → 연관 섹션 차선
- Turn 2(아웃라인) 단계에서 슬러그 2~3개를 Gemini에 제공

### 트렌드상품(trending-picks) 추가 규칙

- 형식: 비교·추천형 ("TOP3", "vs 비교", 예산대별 추천)
- 각 추천 상품마다: 모델명·가격대·스펙·장단점·타겟 구매자 명시
- 쿠팡 링크 필수: `[상품명 쿠팡에서 보기](https://www.coupang.com/np/search?q=상품명&sourceType=affiliate&trackingCode=AF8691300)`
- 비교표(마크다운 표 형식) 1개 이상 포함

---

## 이미지 기준

### 이미지 3장 역할

| 파일 | 위치 | 역할 |
|---|---|---|
| `{slug}-01.webp` | 도입부 직후 | 첫 번째 H2 섹션 내용과 직결된 구체적 장면 |
| `{slug}-02.webp` | 두 번째 H2 직후 | 두 번째 H2 섹션 — 이미지1과 오브젝트·색감·구도 완전히 다르게 |
| `{slug}-thumb.webp` | 커버 (목록·SNS) | 글 전체를 상징하는 강렬한 커버 — 사람 얼굴 클로즈업 금지 |

### 이미지 생성 우선순위

```
① Gemini "이미지 만들기" 버튼 (Gemini Pro 구독 내, 추가 비용 없음)
    → 글 작성 대화 안에서 H2 섹션 제목을 명시해 관련 장면 요청
    → 2장 이상 추출 성공 시 사용
② Pollinations.ai (flux 모델, 무료 폴백)
    → Gemini 이미지 추출 실패 시 자동 전환
③ 누락 복구: node scripts/fix_missing_images.mjs
```

### 이미지 품질 게이트

- 파일 크기 **15KB 미만** → 즉시 재생성
- 3장 이미지가 같은 오브젝트/분위기 → 재생성
- 이미지 없이 발행 → 즉시 `node scripts/fix_missing_images.mjs` 실행

### Hugo Page Bundle 구조

```
content/posts/{섹션}/{slug}/
  ├── index.md
  ├── {slug}-01.webp
  ├── {slug}-02.webp
  └── {slug}-thumb.webp
```

- 이미지 경로: 상대 경로 `![alt](slug-01.webp)` — `static/images/` 저장 금지
- `cover.hiddenInSingle: true` 필수
- 비율: **landscape 16:9 (1280×720)** — 세로·정사각형 금지

---

## 트러블슈팅

### 이미지 누락

```powershell
node scripts/fix_missing_images.mjs
```
전체 포스팅 스캔 후 누락된 것만 생성 → git push까지 자동.

### 포스팅 중복 발행

`agent_core.js`의 `existingSlugsForSection()`이 실행 전 슬러그 목록 확인.
이미 존재하는 슬러그 감지 시 자동 스킵. 수동 확인:
```powershell
ls content/posts/{섹션}/
```

### 발행 중단 후 재개

```powershell
# N번째 섹션부터 재개
node scripts/daily_runner.js --from N

# 특정 섹션만 재실행
node scripts/daily_runner.js --only economy,health

# 예약 없이 즉시 발행 (복구용)
node scripts/daily_runner.js --only economy --now
```

### Gemini 로그인 세션 만료

텔레그램으로 알림 자동 발송 → Chrome 창에서 paydma 계정 재로그인 → 자동 재개.

### 취소선 렌더링 버그 (`~` 이스케이프)

Goldmark가 같은 단락 내 `~` 두 개를 `<del>`로 처리.
`agent_core.js`에서 자동 이스케이프 처리됨. 전체 재처리 필요 시:
```powershell
node scripts/fix_tilde_escape.mjs
```

### categories 빌드 오류

Hugo categories에 **영문 섹션 ID** 사용 시 빌드 전체 실패.
반드시 한국어 섹션명 사용: `categories: ["최신기술동향"]`
글로벌 섹션: `categories: ["日本トレンド"]` / `categories: ["Global Trends"]`

---

## 개발 원칙

- 모든 코드 수정은 Claude Code가 직접 수행 (사장님 코드 수정 안 함)
- API Key는 환경변수(`process.env`)로만 처리
- **Anthropic API(ANTHROPIC_API_KEY) 사용 금지** — 비용 발생
- **Google Gemini API 직접 호출 금지** — 비용 발생. Gemini Pro 웹 브라우저 자동화만 사용
- **Claude에 본문 집필 맡기는 코드 작성 금지** — 집필은 Gemini 전담
- 포스팅 1개 실패가 전체에 영향 없도록 독립 처리 (`try/catch` 필수)
- `withRetry()` — 503/429 자동 재시도
- 장기 작업 완료 시 **항상** 텔레그램 알림 전송
- git 커밋: `git add content/` — `git add .` 금지 (스크린샷 등 실수 방지)
- 코드 수정 후 반드시 `git commit + git push origin main`까지 완료

---

## 절대 금지

| 금지 항목 | 이유 |
|---|---|
| 타 블로그 문장 복붙 | 저작권 + 애드센스 정책 위반 |
| 출처 없는 수치·통계 | E-E-A-T 위반 |
| 영어 원문 직역체 | 품질 저하 |
| `static/images/`에 이미지 저장 | Hugo Page Bundle 구조 위반 |
| 이미지 일괄 생성 | 포스팅 1개 완료 즉시 3장 생성이 원칙 |
| 본문에 `~` 단독 사용 | 취소선 렌더링 버그 — 반드시 `\~` |
| `git add .` | 스크린샷·temp 파일 실수 커밋 |
| Anthropic/Gemini API 직접 호출 | 추가 비용 발생 |

---

## 스킬 목록

| 명령어 | 파일 | 실행 시각 |
|---|---|---|
| `/post-daily` | `.claude/commands/post-daily.md` | 01:00 KST |
| `/verify-posts` | `.claude/commands/verify-posts.md` | 08:00 KST |
| `/threads-post` | `.claude/commands/threads-post.md` | 10:00 KST |
