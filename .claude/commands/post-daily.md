# /post-daily — 트렌드줌 블로그 포스팅 자동화 스킬

매일 22:00 KST 실행. 오늘 그룹의 5개 섹션을 순서대로 포스팅하고 다음날 예약발행 설정.

---

## 실행 전 확인

1. `scripts/sections.js` 에서 오늘 날짜 기준 **어느 그룹**인지 확인 (홀/짝일 교대)
2. 현재 UTC 시간 파악 후 메모
3. 각 섹션의 기존 슬러그 목록 조회 (중복 방지)

```bash
node -e "const s=require('./scripts/sections.js'); const g=s.getTodayGroup(); console.log(g.name, g.sections.map(x=>x.id));"
```

---

## 포스팅 1개 실행 흐름 (섹션마다 반복)

### STEP 1 — Gemini Pro (Chrome) 호출

- `claude-in-chrome` MCP로 Chrome 조작
- 매 섹션 시작 시 Gem URL로 **새로 이동**: `https://gemini.google.com/u/2/gem/cca9fca55f60`
- 로그인 계정: `paydma` (DmA 01, Gemini Pro 구독)
- 로그인 이슈: `accounts.google.com` 감지 시 `/u/2/` URL로 재이동하면 자동 선택

입력창 삽입:
```javascript
document.execCommand('insertText', false, text)
// 입력창 셀렉터: rich-textarea .ql-editor
// 전송 버튼: gem-icon-button.send-button button (label="메시지 보내기")
```

### 단일 종합 메시지 포맷
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
(이미지1: ![alt]({slug}-01.webp))
(H2 5~6개, H3 각 2~3개, 마지막 H2에 내부링크, 두번째 H2 직후 이미지2)
(이미지2: ![alt]({slug}-02.webp))
(마지막 줄 해시태그 7개+)
===PROMPTS===
{"imgPrompts":["본문이미지1 영어프롬프트","본문이미지2 영어프롬프트","썸네일 영어프롬프트"]}
```

응답 대기: 30초 간격 폴링, 최대 10분
```javascript
document.querySelectorAll('message-content')[0]?.innerText ?? ''
```

---

### STEP 2 — Claude 검수 & 직접 수정

Gemini 응답 파싱 후 Claude가 직접 수정 (Gemini 재요청 없음):

- 제목·키워드와 내용 일치 여부 확인
- AI 상투어·영어 직역체 완전 제거
- 출처 없는 수치 → 정성적 설명으로 대체
- 분량 부족 시 직접 보강 (최소 2,500자)
- H1 사용 여부 확인 (본문에 H1 절대 금지)
- H2 5~6개, H3 각 2~3개 구조 확인
- 마크다운 렌더링 오류 체크: `~~`, 짝 안 맞는 괄호·따옴표, YAML 콜론 누락
- 내부 링크 슬러그 실존 확인: `ls content/posts/섹션/slug/index.md` → 없으면 섹션 링크로 교체

---

### STEP 3 — 이미지 생성 (포스팅 1개 완료 직후 즉시, 일괄 금지)

이미지 3장: `slug-01.webp` (도입부), `slug-02.webp` (2번째 H2), `slug-thumb.webp` (커버)

**이미지 프롬프트 규칙:**
- 반드시 **영어**로만 작성. 한국어 한 글자도 금지
- `topic.keyword` (영어) 기반으로만 생성. `topic.title` (한국어) 절대 사용 금지
- 모든 이미지: **landscape 16:9** 비율 (`width=1280&height=720`)
- 이미지 1: 개념 설명형 (introductory, concept visualization)
- 이미지 2: 비교·분석형 (comparison, data, chart-style) — 이미지 1과 시각적으로 명확히 다르게
- 썸네일: `"{keyword} editorial magazine cover, bold colors, no text overlay, landscape 16:9"`
- 사람 얼굴 중심 썸네일 금지 (개념·사물·장면·아이콘 중심)

Pollinations URL:
```
https://image.pollinations.ai/prompt/{encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&model=flux
```

**Claude Haiku 이미지 검수 (생성 직후):**
불합격 기준 (하나라도 해당 시 즉시 재생성):
1. 섹션·주제와 전혀 다른 내용
2. 생성 프롬프트와 이미지 내용이 무관
3. 16:9가 아닌 세로·정사각형 비율
4. 극도로 흐릿하거나 노이즈가 심함
5. 혐오·단색·노이즈만 있는 이미지
6. 이미지 안에 텍스트·문자 도배

MD5 해시를 로그에 출력. 같은 런 내 동일 해시 감지 시 즉시 재생성.

---

### STEP 4 — 저장 & Git Push

저장 전 품질 게이트 (미달 시 throw):
- H2 ≥ 3개
- 본문 ≥ 1,200자

```bash
node scripts/save_post.js  # stdin으로 JSON 전달
# 또는 직접 git add/commit/push
git add content/posts/섹션/slug/
git commit -m "post: {제목}"
git push
```

예약발행 날짜: `date` 필드를 **다음날 KST** 기준으로 설정
| 포스팅 순서 | 발행 시각 KST |
|---|---|
| 1번째 | 다음날 07:00 |
| 2번째 | 다음날 07:30 |
| 3번째 | 다음날 08:00 |
| 4번째 | 다음날 08:30 |
| 5번째 | 다음날 09:00 |

---

## 포스팅 간격

20분 대기 후 다음 섹션 시작 (이미지 생성 API 부하 분산):
```javascript
await sleep(20 * 60 * 1000); // 20분
```

---

## 완료 시 텔레그램 알림

```
✅ 트렌드줌 예약발행 완료! (5개)
1. {제목} — {URL}
2. ...
발행 예정: 내일 07:00~09:00 KST
```

TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
CHAT_ID: `7724357585`

---

## 오류 처리

- 1개 포스팅 실패 → 해당 섹션만 스킵, 나머지 계속 진행
- Gemini 10분 이상 응답 없음 → 재시도 1회, 실패 시 스킵
- 이미지 생성 3회 연속 실패 → 텍스트 포스팅만 저장, 텔레그램 경고
- `503/429` 에러 → `withRetry()` 자동 재시도 (3회, 지수 백오프)
