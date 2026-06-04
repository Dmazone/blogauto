# /post-daily — 트렌드줌 블로그 포스팅

매일 22:00 KST, Task Scheduler가 자동 실행. 이 스킬은 수동 트리거 또는 재실행 용.

---

## STEP 0 — Chrome + Gemini 세션 전제조건 확인

Chrome이 CDP 디버그 모드로 실행 중인지 확인:

```powershell
(Invoke-WebRequest -Uri http://localhost:9222/json -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode
```

- **200** → 연결됨, 바로 실행 가능
- **오류** → `scripts\chrome_debug.bat` 실행 후 Chrome에서 paydma 계정으로 Gemini Pro 구독 확인

---

## STEP 1 — 실행

```powershell
node scripts/daily_runner.js
```

**옵션:**
| 플래그 | 설명 |
|---|---|
| `--now` | 예약 없이 즉시 발행 (복구용) |
| `--from 3` | 3번째 섹션부터 재개 |
| `--only economy,health` | 특정 섹션만 실행 |

---

## STEP 2 — 로그 모니터링

```powershell
Get-Content "logs\runner-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait -Tail 30
```

정상 흐름: `[Turn 1] 트렌드 조사` → `[Turn 5] 최종 마크다운` → `[STEP 8] 이미지 생성` → `[STEP 8c] Claude 검수` → `[STEP 7] Claude 본문 검수` → `git push` → 다음 섹션 20분 대기

---

## 오류 처리

| 증상 | 처리 |
|---|---|
| Gemini 로그인 필요 | 텔레그램 알림 자동 발송 → Chrome에서 paydma 계정 로그인 |
| 특정 섹션 실패 | 해당 섹션 스킵, 나머지 자동 계속 |
| 이미지 3회 실패 | 텍스트만 저장 + 텔레그램 경고 |
| 전체 중단됨 | `--from N`으로 N번째부터 재개 |

완료 시 텔레그램으로 예약발행 목록 자동 전송됨.
