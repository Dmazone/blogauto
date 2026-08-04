# CLAUDE.md — 트렌드줌 운영 기준

## 프로젝트

- **블로그**: 트렌드줌 | GitHub Pages + Hugo (PaperMod) | `https://dmazone.github.io/blogauto`
- **YouTube**: @dmalog (DMAZON - Hip Item M...) | ekaledma@gmail.com 소유 (복수 채널 주의: @DmALOQ 아님)
- **목적**: 구글 애드센스 수익화 + 쿠팡파트너스 제휴마케팅

---

## 3가지 핵심 업무

| # | 업무 | 스크립트 | 주기 |
|---|---|---|---|
| 1 | **블로그 7개 예약발행** | `daily_runner.js` | 매일 01:00 KST |
| 2 | **trending-picks 영상 → @dmalog 업로드** | `yt_make_shorts.mjs` → `yt_upload.mjs` | 매일 (trending-picks 발행 후) |
| 3 | **사이트 고도화 / 트래픽 방향성** | `submit_all_indexnow.mjs`, `gsc_submit.mjs` | 수시 |

---

## 핵심 설정

| 항목 | 값 |
|---|---|
| Gemini Gem URL | `https://gemini.google.com/u/2/gem/cca9fca55f60` |
| Google 계정 | `paydma` (DmA 01, Gemini Pro 구독) |
| YouTube 계정 | `ekaledma@gmail.com` |
| YouTube 채널 | **@dmalog** (DMAZON) — @DmALOQ와 다름, 절대 혼동 금지 |
| YouTube 세션 | `~/.yt-ekaledma-session` |
| 텔레그램 TOKEN | `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg` |
| 텔레그램 CHAT_ID | `7724357585` |
| 쿠팡파트너스 trackingCode | `AF8691300` |
| Threads 계정 | `paydma.action` (보류 중) |

---

## 업무 1 — 블로그 7개 예약발행

### 섹션 구조 (13개)

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

### 발행 타임라인

| 시각 (KST) | 작업 |
|---|---|
| 01:00 | `node scripts/daily_runner.js` — 7개 포스팅 생성 + 예약 설정 |
| 05:00~08:00 | GitHub Actions (scheduled-deploy) — 30분 간격 순차 공개 |
| 08:00 | `/verify-posts` — 발행 점검 + 오류 수정 |

**발행 시간표** (sectionIndex 0~6): `05:00 / 05:30 / 06:00 / 06:30 / 07:00 / 07:30 / 08:00`
trending-picks는 항상 마지막(index 6 = 08:00).

### 재시작 명령어

```powershell
node scripts/daily_runner.js --from N       # N번째 섹션부터 재개
node scripts/daily_runner.js --only economy,health  # 특정 섹션만
node scripts/daily_runner.js --only economy --now   # 예약 없이 즉시 발행
```

---

## 업무 2 — YouTube Shorts 자동화

### 실행 시점 ★★★

> **블로그 7개 예약발행 완료 직후** — `daily_runner.js` 가 trending-picks 포스팅을 완료하면 **자동**으로 영상 제작 → 업로드 → 댓글 달기까지 이어서 실행한다.  
> 별도 명령어 없이 자동 파이프라인으로 처리됨. 수동 실행은 아래 명령 참고.

### 파이프라인

```
[daily_runner.js] 블로그 7개 발행 완료
  → trending-picks 포스팅 감지
  → yt_make_shorts.mjs   (MP4 생성, ~25~30초)
  → yt_upload.mjs        (YouTube Studio 업로드, VIDEO_ID 반환)
  → yt_comment.mjs       (쿠팡파트너스 링크 첫 댓글 즉시 게시)
```

### 스크립트

| 파일 | 역할 |
|---|---|
| `scripts/yt_login.mjs` | 최초 로그인 / 세션 갱신 |
| `scripts/yt_make_shorts.mjs` | trending-picks 포스트 → MP4 생성 |
| `scripts/yt_upload.mjs` | YouTube Studio 업로드 + VIDEO_ID 출력 |
| `scripts/yt_comment.mjs` | 업로드 직후 쿠팡파트너스 링크 댓글 자동 게시 |
| `scripts/yt_batch_shorts.mjs` | 과거 포스팅 일괄 영상 생성 + 예약 업로드 |
| `scripts/yt_publish_video.mjs` | `node yt_publish_video.mjs <videoId>` 로 초안 공개 |
| `scripts/yt_delete_final.mjs` | 잘못 올린 영상 삭제 (복구용) |

### 채널 전환 절차 (업로드 전 필수)

ekaledma@gmail.com에는 **@DmALOQ**(기본)와 **@dmalog**(DMAZON) 두 채널이 있다.  
업로드 스크립트 실행 전 반드시 studio.youtube.com에서 @dmalog 채널로 전환 확인.  
잘못된 채널에 올리면 즉시 `yt_delete_final.mjs`로 삭제.

### [지침] 슬라이드 배경 이미지 생성 표준 ★★★★★

> **핵심 원칙**: Shorts 슬라이드 배경은 반드시 해당 포스팅의 **Gemini 생성 블로그 이미지**를 사용한다.  
> **Pollinations 폴백 일절 금지** — Gemini 이미지 없으면 그냥 흰색 배경으로 진행.

| 순서 | 내용 |
|---|---|
| 1 | 블로그 포스팅의 Gemini 이미지 직접 사용 (`content/posts/trending-picks/{slug}/`) |
| 2 | `bg_intro` (s0, s3) → `{slug}-thumb.webp` (Gemini 썸네일) |
| 3 | `bg_s1` (s1 TOP3) → `{slug}-01.webp` (Gemini 본문 이미지 1) |
| 4 | `bg_s2` (s2 CTA) → `{slug}-02.webp` (Gemini 본문 이미지 2) |
| 5 | 파일 없으면 → **단색 배경 (#1a1a2e)** 사용 (Pollinations 절대 금지) |
| 6 | 생성된 이미지를 `<img object-fit:cover>` 로 배경 적용 — **9:16 강제 변환 절대 금지** |
| 7 | 텍스트는 HTML 오버레이로 렌더링 (한국어 □□□□ 버그 방지) |

### 기술 스택

- **FFmpeg**: `C:\Users\Paydma\.vscode\extensions\kilocode.kilo-code-7.4.17-win32-x64\bin\ffmpeg.exe`
- **해상도**: 1080×1920 (Shorts 세로 포맷)
- **출력**: `data/1_youtube-shorts/`
- **BGM**: `data/1_youtube-shorts/bgm/`

### 미해결 이슈

- 한국어 텍스트 FFmpeg drawtext → □□□□ 박스로 표시됨
- 해결 방향: Playwright HTML 렌더링 → 스크린샷 → FFmpeg concat 방식으로 전환 예정

---

## 업무 3 — 사이트 고도화 / 트래픽

| 스크립트 | 역할 |
|---|---|
| `scripts/submit_all_indexnow.mjs` | Bing/Yahoo/DuckDuckGo 즉시 색인 제출 |
| `scripts/gsc_submit.mjs` | Google Search Console 사이트맵 재제출 |

---

## 콘텐츠 품질 기준 ★★★

> **전문 기자 수준의 구체성** + **독자가 끝까지 읽을 이유** 두 가지가 모든 글의 기준이다.

### 글 구조

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

### E-E-A-T (애드센스 필수)

| 항목 | 요건 |
|---|---|
| Experience | "독자에게 실제로 어떤 의미인가" 관점 서술 |
| Expertise | 출처 있는 수치만 사용 (기관명+날짜) |
| Authority | 공식 발표문·보도자료·법령 1차 소스 인용 |
| Trust | 불확실한 정보는 불확실하다고 명시 |

### 트렌드상품(trending-picks) 추가 규칙

- 형식: 비교·추천형 ("TOP3", "vs 비교", 예산대별 추천)
- 각 상품마다: 모델명·가격대·스펙·장단점·타겟 구매자 명시
- 쿠팡 링크: `[상품명 쿠팡에서 보기](https://www.coupang.com/np/search?q=상품명&sourceType=affiliate&trackingCode=AF8691300)`
- 비교표(마크다운 표) 1개 이상 포함

### 실시간 트렌드 의무 ★★★★★

1. **날짜 확인** — 오늘 날짜(YYYY-MM-DD)를 Gemini 프롬프트 최상단에 명시
2. **실시간 검색** — 최근 72시간 이내 핫이슈만 사용
3. **신선도 검증** — 2주 이상 전 이슈, 새 전개 없으면 탈락

---

## 이미지 기준

| 파일 | 위치 | 역할 |
|---|---|---|
| `{slug}-01.webp` | 도입부 직후 | 첫 번째 H2 장면 |
| `{slug}-02.webp` | 두 번째 H2 직후 | 이미지1과 오브젝트·색감·구도 완전히 다르게 |
| `{slug}-thumb.webp` | 커버 | 사람 얼굴 클로즈업 금지 |

**생성 순서**: ① Gemini Pro "이미지 만들기" 전용 — **Pollinations 폴백 일절 금지** ★★★★★  
Gemini 세션 없으면 이미지 없이 포스트 발행 (저품질 이미지보다 이미지 없음이 낫다)  
**품질 게이트**: 15KB 미만 → 즉시 재생성  
**누락 복구**: `node scripts/fix_bad_thumbs.mjs` (Gemini Pro 전용 재생성)

**Hugo Page Bundle 구조:**
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

### 취소선 렌더링 버그 (`~`)
Goldmark가 `~` 두 개를 `<del>`로 처리. `agent_core.js`에서 자동 이스케이프됨.  
전체 재처리: `node scripts/fix_tilde_escape.mjs`

### categories 빌드 오류
Hugo categories에 영문 섹션 ID 사용 시 빌드 전체 실패.  
반드시 한국어: `categories: ["최신기술동향"]`  
글로벌: `categories: ["日本トレンド"]` / `categories: ["Global Trends"]`

### Gemini 세션 만료
텔레그램 알림 자동 발송 → Chrome 창에서 paydma 계정 재로그인 → 자동 재개.

### Threads 재개 방법 (현재 보류)
```powershell
schtasks /change /tn "\BlogAuto-Threads" /enable
```

---

## 파일 구조

```
scripts/
├── daily_runner.js          # 블로그 발행 메인
├── agent_core.js            # 포스팅 생성 코어
├── sections.js              # 섹션 정의
├── gemini_browser.js        # Gemini 브라우저 자동화
├── telegram.js              # 텔레그램 알림
├── verify_posts.js          # 발행 검증
├── fix_missing_images.mjs   # 이미지 누락 복구
├── fix_tilde_escape.mjs     # ~ 버그 수정
├── submit_all_indexnow.mjs  # IndexNow 색인 제출
├── gsc_submit.mjs           # GSC 사이트맵 제출
├── yt_login.mjs             # YouTube 로그인
├── yt_make_shorts.mjs       # Shorts 영상 생성
├── yt_upload.mjs            # YouTube Studio 업로드
├── yt_publish_video.mjs     # 초안 → 공개
├── yt_delete_final.mjs      # 영상 삭제 (복구용)
├── threads_*.js             # Threads SNS (보류)
└── _archive/                # 실패·임시 스크립트 보관

data/
├── 1_youtube-shorts/        # 생성된 영상 + BGM
├── 2_sessions/              # 브라우저 세션 데이터
└── 3_screenshots/           # 디버그 스크린샷

docs/                        # 운영 문서 (CONTENTS_PLAN 등)
```

---

## 개발 원칙

- 모든 코드 수정은 Claude Code가 직접 수행
- **Anthropic API(ANTHROPIC_API_KEY) 사용 금지** — 비용 발생
- **Google Gemini API 직접 호출 금지** — Gemini Pro 웹 브라우저 자동화만 사용
- **Claude에 본문 집필 맡기는 코드 작성 금지** — 집필은 Gemini 전담
- 포스팅 1개 실패가 전체에 영향 없도록 `try/catch` 필수
- 장기 작업 완료 시 항상 텔레그램 알림 전송
- `git add content/` — `git add .` 금지 (스크린샷 실수 커밋 방지)
- 코드 수정 후 반드시 `git commit + git push origin main`까지 완료

---

## 절대 금지

| 금지 항목 | 이유 |
|---|---|
| 타 블로그 문장 복붙 | 저작권 + 애드센스 정책 위반 |
| 출처 없는 수치·통계 | E-E-A-T 위반 |
| `static/images/`에 이미지 저장 | Hugo Page Bundle 구조 위반 |
| 본문에 `~` 단독 사용 | 취소선 렌더링 버그 |
| `git add .` | 스크린샷·temp 파일 실수 커밋 |
| Anthropic/Gemini API 직접 호출 | 추가 비용 발생 |
| @DmALOQ 채널에 YouTube 업로드 | 잘못된 채널 — 반드시 @dmalog |

---

## 스킬 목록

| 명령어 | 파일 | 실행 시각 |
|---|---|---|
| `/post-daily` | `.claude/commands/post-daily.md` | 01:00 KST |
| `/verify-posts` | `.claude/commands/verify-posts.md` | 08:00 KST |
| `/threads-post` | `.claude/commands/threads-post.md` | 보류 중 |
