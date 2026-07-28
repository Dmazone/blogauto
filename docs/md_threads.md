# 스레드 포스팅 운영 기준 (md_threads.md)

> 출처: `md_blogauto.md` + `.claude/commands/threads-post.md` 통합 정리
> 핵심 제약: **작업글(홍보글)은 하루 1건 고정**

---

## 계정 및 스케줄

| 항목 | 값 |
|---|---|
| Threads 계정 | `paydma.action` |
| 실행 시각 | 매일 **10:00 KST** (Task Scheduler 자동 실행) |
| 스킬 명령어 | `/threads-post` |
| 텔레그램 TOKEN | `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg` |
| 텔레그램 CHAT_ID | `7724357585` |

---

## 하루 1건 고정 원칙

- **홍보글(작업글) 1건/일 초과 게시 금지**
- 기본 실행 모드: 홍보글 1개 + 스하리 15개
- 홍보글만 게시: `--post-only` 플래그 사용
- 스하리만 실행: `--shari-only` 플래그 사용
- 중복 방지: `data/threads_log.json` 7일간 체크 (동일 포스팅 재게시 방지)

---

## 실행 절차

### STEP 0 — Chrome CDP 연결 확인

```powershell
(Invoke-WebRequest -Uri http://localhost:9222/json -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode
```

- **200** → 연결됨, 다음 단계 진행
- **오류** → `scripts\chrome_debug.bat` 실행 후 일반 Chrome에서 `paydma.action` 계정으로 Threads 로그인

> ⚠️ 반드시 **일반 Chrome** 에서 로그인 (Playwright 자체 브라우저 사용 불가)
> 로그인 후 스크립트가 계정 자동 확인 → 5분 내 대기 후 진행

### STEP 1 — 실행

```powershell
node scripts/threads_poster.js
```

스크립트 자동 수행 순서:
1. Chrome CDP 연결 → Threads 로그인 확인 → `paydma.action` 계정 검증
2. suspended 감지 시 즉시 중단 + 텔레그램 알림
3. 오늘 포스팅 중 랜덤 1개 선택 → 홍보글 3버전 생성(Claude Haiku) → 게시
4. 스하리 키워드 검색 → 좋아요 + 리포스트 + 팔로우 + 댓글 (15개 목표)

### STEP 2 — 로그 모니터링

```powershell
Get-Content "logs\threads-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait -Tail 30
```

완료 시 텔레그램으로 게시 결과 + 스하리 수 자동 전송.

---

## 오류 처리

| 증상 | 처리 |
|---|---|
| Chrome CDP 연결 실패 | `chrome_debug.bat` 실행 후 재시도 |
| `paydma.action` 계정 불일치 | 텔레그램 알림 → 5분 내 계정 교체하면 자동 재개 |
| 계정 정지 (suspended) | 즉시 중단 + 텔레그램 경고 (본인인증 필요) |
| 연속 실패 3회 | 자동 중단 + 텔레그램 경고 |
| 중복 게시 방지 | `data/threads_log.json` 으로 7일간 중복 체크 |

---

## 연관 파일

| 파일 | 역할 |
|---|---|
| `.claude/commands/threads-post.md` | 스킬 원문 |
| `scripts/threads_poster.js` | 실행 스크립트 |
| `data/threads_log.json` | 중복 방지 로그 (7일) |
| `logs/threads-YYYY-MM-DD.log` | 일별 실행 로그 |
| `md_blogauto.md` | 전체 블로그 운영 기준 |
