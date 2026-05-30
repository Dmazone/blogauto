# /threads-post — 스레드 게시 & 스하리 스킬

매일 10:00 KST 실행. 오늘 발행된 포스팅 중 1개를 Threads에 게시하고, 스하리 활동 진행.

> **권장**: `node scripts/threads_poster.js` 실행이 가능하면 그것을 우선 사용.
> MCP 수동 모드는 Node.js 실행 불가 시 대체 수단.

---

## 계정 정보

- Threads 계정: `paydma.action`
- URL: `https://www.threads.com`
- 로그인: Chrome에 이미 로그인된 상태 사용 (claude-in-chrome MCP)

---

## STEP 0 — suspended 사전 확인

탭 URL이 `accounts/suspended/`이면 **즉시 중단** → 텔레그램 알림 후 종료.

---

## STEP 1 — 오늘 포스팅 목록 확인

```powershell
Get-Content data\posts_log.json
```

`data/threads_log.json`도 확인해 이미 게시된 URL 제외 (중복 방지).

---

## STEP 2 — Threads 포스팅 (랜덤 1개)

### ⚠️ 절대 금지 사항

- `document.execCommand('insertText')` — Meta 봇 탐지 대상
- `page.evaluate(() => el.click())` — JS 직접 클릭 탐지됨
- `navigator.clipboard.writeText()` in evaluate — 비정상 클립보드 접근
- `keyboard.type(text, { delay: 30 })` — 30ms = 160WPM, 사람 속도 아님

### 실행 방법

1. `tabs_context_mcp` 로 Chrome 탭 확인 → Threads 탭 ID 확인
2. `navigate` 로 `https://www.threads.com` 이동 (2~4초 대기)
3. **우하단 `+` 버튼 computer 툴로 클릭** (screenshot → 좌표 확인 → left_click)
4. 다이얼로그 열림 확인 (screenshot)
5. **텍스트를 PowerShell로 클립보드에 저장**:

```powershell
Set-Clipboard -Value "게시할 텍스트 전체"
```

6. **에디터 영역 computer 툴로 클릭** (left_click, 실제 좌표)
7. **Ctrl+V 붙여넣기** (`computer key ctrl+v`)
8. **스크린샷으로 텍스트 확인**
9. **게시 버튼 computer 툴로 클릭** (screenshot → 좌표 확인 → left_click)
10. **10~15분 대기** 후 다음 포스팅

### 게시 텍스트 작성 원칙

- **250자 이내** (Threads 제한)
- 첫 줄: 강렬한 훅 (의문·충격·공감 유발)
- 2~3줄: 핵심 내용 요약 (줄바꿈으로 가독성)
- 해시태그: 3~4개 (섹션 관련 + 트렌드 키워드)
- 마지막: `👇 더 보기\n{URL}`
- URL 형식: `https://dmazone.github.io/blogauto/posts/{섹션}/{slug}/`

### 포스팅 간격

**각 게시 후 최소 10~15분 대기** (봇 감지 방지).

---

## STEP 3 — 피드 자연 탐색 (게시 전후 필수)

게시 전후 홈 피드를 **사람처럼** 탐색:

1. 스크롤 다운 3~5회 (랜덤 간격 2~5초)
2. 관심 게시물 **좋아요** (computer left_click on ♡ 아이콘 — 좌표 확인 필수)
3. 간헐적으로 댓글 (PowerShell 클립보드 → Ctrl+V → 게시 버튼 클릭)
4. 게시와 탐색 사이 최소 **5~10분** 자연 간격 유지

---

## STEP 4 — 스하리 (node scripts로 실행 권장)

MCP 수동 진행 시:

1. `https://www.threads.com/search/?q=스하리모집&serp_type=default` 접속
2. 검색 결과 스크롤 2~3회 (3~6초 랜덤 대기)
3. 포스팅 클릭 → 게시물 읽는 척 스크롤
4. **좋아요**: screenshot → ♡ 좌표 확인 → left_click (±3px 오프셋 정신적으로 추가)
5. **리포스트**: 리포스트 아이콘 좌표 → left_click → 모달 확인 버튼 left_click
6. **팔로우**: 팔로우 버튼 좌표 → left_click
7. **댓글**: PowerShell 클립보드 7가지 중 랜덤 선택 → Ctrl+V → 게시 버튼 클릭
8. 각 액션 사이 **2~5초** 랜덤 대기
9. 계정당 작업 후 **humanWait** (5~20초 랜덤)

댓글 후보 (매번 랜덤):
- "스하링 🔁🩷"
- "스하리해요 💕🔁"
- "맞팔해요 🩷"
- "스하리 합니다 ✨"
- "반하리 할게요 🔁💚"
- "팔로우 했어요 😊🩷"
- "스하리+반하리 💕"

---

## STEP 5 — 완료 후 처리

1. `data/threads_log.json` 에 게시된 URL + 타임스탬프 기록
2. `data/shari_log.json` 에 처리한 계정 기록

텔레그램 알림:
```
📱 스레드 작업 완료!
게시: 1개 ✅
스하리+팔로우: N개
```

TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
CHAT_ID: `7724357585`

---

## 주의사항

- suspended URL 감지 즉시 중단 후 텔레그램 경고
- 같은 URL로 중복 게시 금지 (`data/threads_log.json` 확인)
- 연속 실패 3회 시 중단 후 텔레그램 경고
- alert/confirm 팝업 발생 시 즉시 중단
