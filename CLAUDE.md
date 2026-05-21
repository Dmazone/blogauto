# CLAUDE.md — 트렌드줌 블로그 프로젝트

## 프로젝트 개요
이 블로그는 **10개 섹션으로 구성된 한국어 종합 트렌드 블로그**다.
- 블로그명: 트렌드줌
- 플랫폼: GitHub Pages + Hugo (PaperMod 테마)
- 목적: 구글 애드센스 수익화 + 제휴마케팅
- 언어: 한국어 (기술 용어는 영어 병기)
- 발행 주기: **하루 10편, 섹션별 1편, 5분 간격 자동 발행**

---

## 10개 섹션 구조

| 섹션 ID | 이름 | 디렉토리 | 건강 서브토픽 |
|---|---|---|---|
| latest-tech | 최신기술동향 | content/posts/latest-tech/ | — |
| economy | 경제 | content/posts/economy/ | — |
| society | 사회 | content/posts/society/ | — |
| humanities | 인문 | content/posts/humanities/ | — |
| entertainment | 연예이슈 | content/posts/entertainment/ | — |
| health | 건강 | content/posts/health/ | 운동/식단/질병 롤링 |
| it-devices | IT기기 | content/posts/it-devices/ | — |
| kr-realestate | 한국부동산 | content/posts/kr-realestate/ | — |
| world-travel | 세계여행지 | content/posts/world-travel/ | — |
| sports | 스포츠 | content/posts/sports/ | — |

> 건강 섹션: 날짜 기반으로 운동 → 식단 → 질병 순서로 3일 주기 롤링

---

## 포스팅 작성 규칙

### 구조 (Technical SEO 필수)
1. **제목(H1)**: SEO 핵심 키워드 포함, 30자 이내 — front matter title이 H1 역할
2. **도입부**: 첫 문단 안에 핵심 키워드 자연스럽게 포함 (2~3문장)
3. **헤딩 계층**:
   - `##` H2 4개 (주요 섹션)
   - `###` H3 각 H2 아래 2~3개 (소주제)
   - `#` H1은 본문에 절대 사용 금지 (제목이 H1)
   - "1. 제목", "2. 제목" 숫자 번호 방식 절대 금지 — `##` `###` 마크다운만
4. **이미지**: 도입부 직후 1장, 2번째 ## 섹션 직후 1장 (총 2장, 절대 URL)
5. **내부 링크**: 본문 적절한 위치에 동일 섹션 링크 1개 이상
6. **해시태그**: 글 맨 마지막 줄에 `#태그` 7개 이상 (SEO + 소셜 디스커버리)
7. **코드블록**: 터미널 명령어는 반드시 ` ```bash ` 블록

### 문체
- 구어체와 문어체의 중간 톤 (너무 딱딱하지도, 너무 가볍지도 않게)
- 독자에게 직접 말하는 2인칭 사용 ("~할 수 있어요", "~해보세요")
- 복잡한 개념은 비유로 먼저 설명 후 기술적 설명
- **볼드**, > 인용구, - 불릿 적극 활용 (가독성·체류시간 향상)
- **금지 표현**: "다양한", "중요합니다", "살펴보겠습니다", "마지막으로", "~드립니다", 영어 직역체

### Technical SEO 규칙
- 포스트마다 핵심 키워드 1개 선정
- 키워드: 제목, 첫 문단, H2 중 최소 1개, 마지막 문단에 자연스럽게 반복
- 메타 디스크립션(description): 160자 이내, 반드시 작성 (빈값 금지)
- 태그(tags): 키워드 기반 3~6개, 중복 없이
- 동일 섹션 내 내부 링크 최소 1개 포함
- 출처 없는 수치·통계 사용 금지

### 이미지 규칙
- 모든 이미지는 AI 생성 이미지 사용 (직접 촬영 없음)
- 글 당 반드시 2개 (도입부 직후, 2번째 H2 직후)
- alt 태그 필수 (한국어로 작성)
- 파일명: post-slug-01.webp / post-slug-02.webp
- 절대 URL 사용: `https://dmazone.github.io/blogauto/images/slug-01.webp`

---

## 디렉토리 구조
```
BlogAuto/
├── CLAUDE.md                      ← 이 파일
├── config.toml                    ← Hugo 설정 (10개 메뉴)
├── content/
│   └── posts/
│       ├── latest-tech/           ← 최신기술동향
│       ├── economy/               ← 경제
│       ├── society/               ← 사회
│       ├── humanities/            ← 인문
│       ├── entertainment/         ← 연예이슈
│       ├── health/                ← 건강 (운동/식단/질병 롤링)
│       ├── it-devices/            ← IT기기
│       ├── kr-realestate/         ← 한국부동산
│       ├── world-travel/          ← 세계여행지
│       ├── sports/                ← 스포츠
│       ├── track-a/               ← (구) Claude Code 기초편
│       └── track-b/               ← (구) Claude Code 활용편
├── scripts/
│   ├── sections.js                ← 10개 섹션 정의
│   ├── agent_core.js              ← 9단계 파이프라인 (섹션 기반)
│   ├── daily_runner.js            ← 10개 섹션 순차 실행 (5분 간격)
│   └── sns_promoter.js            ← SNS 자동 홍보
├── static/
│   └── images/                    ← AI 생성 이미지 (slug-01.webp)
├── assets/css/extended/
│   └── custom.css                 ← PC 가독성 최적화 CSS
└── .github/workflows/
    └── auto-post.yml              ← GitHub Actions (매일 UTC 0:00)
```

---

## 자동화 파이프라인 (9단계)

### 비용 최적화 원칙 (중요)
- **Gemini 2.5 Flash가 파이프라인의 95%를 담당** (트렌드 수집·검증·집필·SEO 루프 전부)
- **Claude는 단 1회·max 800 토큰** — AI 냄새 제거·어색한 한국어·애드센스 위험 요소 피드백만
- Claude가 피드백을 주면 Gemini가 반영해 최종본을 완성한다
- Claude에 집필을 맡기는 코드는 절대 작성하지 않는다

### 파이프라인 흐름
1. **토픽 자동 선정** (Gemini): 해당 섹션 컨텍스트 기반으로 오늘의 트렌드 주제·슬러그 선정
2. **실시간 트렌드 서칭** (Gemini + Google Search): 2026년 최신 웹 데이터 수집
3. **AI 교차 검증** (Gemini): 신뢰성·최신성·중복 여부 필터링
4. **SEO 아웃라인 설계** (Gemini): H2/H3 구조·메타 디스크립션 생성
5. **본문 전체 집필** (Gemini): 비교 분석·장단점·경험적 어조 포함
6. **SEO 자체 검토 & 수정** (Gemini, 최대 2회): 스스로 개선 루프
7. **Claude 최종 품질 검토** (Claude Haiku, 1회·800토큰): 피드백만 → Gemini 반영
8. **이미지 생성 + GitHub 푸시**: Pollinations(fallback) / NanoBanana
9. **SNS 자동 홍보**: Instagram, Threads, Pinterest (크리덴셜 설정 시)

### 실행 방법
```bash
# 특정 섹션 1개
node scripts/agent_core.js --section economy

# 건강 섹션 서브토픽 지정
node scripts/agent_core.js --section health --subtopic 운동

# 전체 10개 섹션 (5분 간격, ~80분 소요)
node scripts/daily_runner.js

# 특정 섹션만
node scripts/daily_runner.js --only economy,health,sports

# N번째부터 재개
node scripts/daily_runner.js --from 4
```

---

## GitHub Actions 스케줄
- **매일 UTC 00:00 (KST 09:00)** 자동 실행
- 10개 섹션 순차 처리, 섹션 간 5분 대기
- 총 소요 시간: 약 60~90분
- GitHub Secrets 필요: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `BLOG_BASE_URL`

---

## 수익화 설정
- **애드센스**: `layouts/partials/ads.html` 에 코드 삽입
- **쿠팡파트너스**: 각 섹션 관련 상품 추천 링크 삽입
- **제휴마케팅**: AI 도구, IT 기기, 건강 제품 등 파트너 링크 사용

---

## 개발 원칙
- 사장님은 코드를 직접 수정하지 않는다. 모든 변경은 Claude Code가 직접 수행한다
- API Key는 반드시 환경변수(`process.env`)로 처리
- 에러 핸들링(Try-Catch) 완벽히 적용
- withRetry()로 503/429 에러 자동 재시도

## 금지 사항
- 타 블로그 문장 그대로 복붙 금지
- 출처 없는 수치/통계 사용 금지
- 영어 원문 직역체 금지 (자연스러운 한국어로 재작성)
- 이미지 저작권 있는 스크린샷 무단 사용 금지
- Claude에 본문 집필 맡기는 코드 작성 금지
