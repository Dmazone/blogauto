# /threads-post — 스레드 게시 & 리포스트 스킬

매일 10:00 KST 실행. 오늘 발행된 5개 포스팅을 Threads에 게시하고, 스하리·반하리 리포스트 진행.

---

## 계정 정보

- Threads 계정: `paydma.action`
- URL: `https://www.threads.com`
- 로그인: Chrome에 이미 로그인된 상태 사용 (claude-in-chrome MCP)

---

## STEP 1 — 오늘 포스팅 목록 확인

```bash
cat data/posts_log.json
```

5개 포스팅의 제목, 슬러그, 섹션 확인.

---

## STEP 2 — Threads 포스팅 (5개)

### 실행 방법

1. `tabs_context_mcp` 로 Chrome 탭 확인
2. `https://www.threads.com` 접속 확인
3. 우하단 `+` 버튼 클릭 → "새로운 스레드" 다이얼로그 오픈
4. JavaScript로 텍스트 삽입:

```javascript
const editor = document.querySelector('[contenteditable="true"]');
editor.focus();
document.execCommand('insertText', false, text);
```

5. 게시 버튼 클릭 (JavaScript 방식이 안정적):
```javascript
const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
const postBtn = buttons.find(b => b.innerText.trim() === '게시' && b.getBoundingClientRect().top > 400);
postBtn.click();
```

6. 4초 대기 후 다이얼로그 닫힘 확인 → 다음 포스팅

### 게시 텍스트 작성 원칙

- **250자 이내** (Threads 제한)
- 첫 줄: 강렬한 훅 (의문·충격·공감 유발)
- 2~3줄: 핵심 내용 1~2가지 (줄바꿈으로 가독성)
- 해시태그: 3~4개 (섹션 관련 + 트렌드 키워드)
- 마지막: `👇 더 보기\n{URL}`
- URL 형식: `https://dmazone.github.io/blogauto/posts/{섹션}/{slug}/`

### 포스팅 간격

각 게시 후 **5초 대기** (유령게시물 방지).

---

## STEP 3 — 스하리·반하리 리포스트

### 스하리 리포스트 (스크롤 매칭 방식)

1. `https://www.threads.com/@shari` 접속
2. 최신 게시물 중 **리포스트할 만한 것** 선택 기준:
   - 좋아요 50개 이상 or 댓글 10개 이상
   - 부정적·논란성 내용 제외
   - 트렌드줌 팔로워층과 관련성 있는 주제
3. 해당 게시물의 리포스트(재게시) 버튼 클릭
4. 완료 확인

### 반하리 리포스트

1. `https://www.threads.com/@banharie` (또는 실제 계정 URL) 접속
2. 동일한 선택 기준 적용
3. 리포스트 실행

> 스하리·반하리 계정 URL이 변경된 경우 Threads 검색으로 확인.

---

## 완료 후 텔레그램 알림

```
📱 스레드 작업 완료!
게시: 5개 ✅
리포스트: 스하리 1개, 반하리 1개
```

TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
CHAT_ID: `7724357585`

---

## 주의사항

- 다이얼로그 중 alert/confirm 팝업 발생 시 즉시 중단, 사용자에게 보고
- 같은 URL로 중복 게시하지 않도록 `data/threads_log.json` 에 기록 확인
- 연속 게시 실패 3회 시 중단 후 텔레그램 경고
