# /threads-post — 스레드 게시 & 스하리

매일 10:00~15:00 KST, Task Scheduler가 1시간 간격으로 6회 자동 실행.
이 스킬은 수동 트리거 또는 재실행 용.

---

## 동작 방식

| 실행 시각 | 동작 |
|---|---|
| 10:00 (1번째) | 포스팅 1개 게시 (API) + 스하리 5개 (브라우저) |
| 11:00~15:00 (2~6번째) | 포스팅 1개 게시 (API) — 스하리 스킵 |

- 포스팅 순서: `posts_log.json` 배열 순서 (07:00→07:30→…→09:30 발행 순)
- 이미 게시된 URL은 `data/threads_log.json`으로 중복 차단 (7일)
- 오늘 6개 모두 완료되면 자동 종료

---

## STEP 1 — 실행

```powershell
node scripts/threads_poster.js
```

**옵션:**
| 플래그 | 설명 |
|---|---|
| (없음) | 다음 미게시 포스팅 1개 + 스하리 (첫 실행 시만) |
| `--post-only` | 포스팅만 (스하리 스킵) |
| `--shari-only` | 스하리만 (포스팅 스킵) |

---

## STEP 2 — Task Scheduler 설정 (최초 1회)

아래 PowerShell을 **관리자 권한**으로 실행:

```powershell
$scriptDir = "C:\Users\Paydma\00_Claude_CODE\BlogAuto"
$nodeExe   = (Get-Command node).Source
$action    = New-ScheduledTaskAction -Execute $nodeExe -Argument "scripts/threads_poster.js" -WorkingDirectory $scriptDir
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

foreach ($hour in 10..15) {
  $trigger = New-ScheduledTaskTrigger -Daily -At "${hour}:00"
  Register-ScheduledTask -TaskName "ThreadsPost_${hour}00" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
}
Write-Host "Task Scheduler 등록 완료 (10:00~15:00 매시간)"
```

---

## STEP 3 — 로그 모니터링

```powershell
Get-Content "logs\threads-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait -Tail 30
```

완료 시 텔레그램으로 게시 결과 + 스하리 수 자동 전송됨.

---

## 오류 처리

| 증상 | 처리 |
|---|---|
| 토큰 만료 | `data/threads_log.json` 확인 → 토큰 재발급 후 `.env` 업데이트 |
| 스하리 Chrome 실패 | `node scripts/threads_setup.js` 실행 후 로그인 |
| 계정 정지(suspended) | 즉시 중단 + 텔레그램 경고 (본인인증 필요) |
| 중복 게시 방지 | `data/threads_log.json`으로 7일간 중복 체크 |
