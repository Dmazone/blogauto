# /threads-post — 스레드 게시 & 스하리

매일 10:00 KST, Task Scheduler가 자동 실행. 이 스킬은 수동 트리거 또는 재실행 용.

---

## STEP 0 — Chrome 디버그 모드 + paydma.action 로그인 확인

```powershell
(Invoke-WebRequest -Uri http://localhost:9222/json -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode
```

- **200** → 연결됨
- **오류** → `scripts\chrome_debug.bat` 실행 후 일반 Chrome에서 **paydma.action** 계정으로 Threads 로그인

> ⚠️ 크로미움(Playwright 자체 브라우저)이 아닌 **일반 Chrome**에서 로그인할 것.  
> 로그인 후 스크립트가 자동으로 계정을 확인하고 5분 내 대기 후 진행.

---

## STEP 1 — 실행

```powershell
node scripts/threads_poster.js
```

**옵션:**
| 플래그 | 설명 |
|---|---|
| (없음) | 홍보글 게시 1개 + 스하리 15개 |
| `--post-only` | 홍보글 게시만 |
| `--shari-only` | 스하리만 |

스크립트가 자동으로:
1. Chrome CDP 연결 → Threads 로그인 확인 → **paydma.action 계정 검증**
2. suspended 감지 시 즉시 중단 + 텔레그램 알림
3. 오늘 포스팅 중 랜덤 1개 선택 → 홍보글 3버전 생성 (Claude Haiku) → 게시
4. 스하리 키워드 검색 → 좋아요 + 리포스트 + 팔로우 + 댓글 (15개 목표)

---

## STEP 2 — 로그 모니터링

```powershell
Get-Content "logs\threads-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait -Tail 30
```

완료 시 텔레그램으로 게시 결과 + 스하리 수 자동 전송됨.

---

## 오류 처리

| 증상 | 처리 |
|---|---|
| Chrome CDP 연결 실패 | `chrome_debug.bat` 실행 후 재시도 |
| paydma.action 계정 불일치 | 텔레그램 알림 → 5분 내 계정 교체하면 자동 재개 |
| 계정 정지(suspended) | 즉시 중단 + 텔레그램 경고 (본인인증 필요) |
| 연속 실패 3회 | 자동 중단 + 텔레그램 경고 |
| 중복 게시 방지 | `data/threads_log.json` 으로 7일간 중복 체크 |
