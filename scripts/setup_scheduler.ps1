# setup_scheduler.ps1 — Windows 작업 스케줄러 등록
# 실행: powershell -ExecutionPolicy Bypass -File scripts\setup_scheduler.ps1

$blogPath = "C:\Users\Paydma\BlogAuto"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "Node.js: $nodePath"
Write-Host "사용자: $userName"

# 현재 사용자로 실행하는 Principal (로그인 상태에서만 실행)
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited

# ── Task 1: 매일 22:00 KST — 예약발행 작업 생성 ────────────────────────────
$action1  = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument "scripts\daily_runner.js" `
  -WorkingDirectory $blogPath

$trigger1 = New-ScheduledTaskTrigger -Daily -At "22:00"

$settings1 = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
  -RestartCount 1 `
  -RestartInterval (New-TimeSpan -Minutes 30) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName "BlogAuto-Generate" `
  -Description "트렌드줌 매일 10개 포스팅 예약발행 생성 (22:00 KST)" `
  -Action $action1 `
  -Trigger $trigger1 `
  -Settings $settings1 `
  -Principal $principal `
  -Force | Out-Null

Write-Host "✅ BlogAuto-Generate 등록 완료 (매일 22:00 KST)"

# ── Task 2: 매일 09:20 KST — 발행 확인 + 텔레그램 보고 ─────────────────────
$action2  = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument "scripts\verify_posts.js" `
  -WorkingDirectory $blogPath

$trigger2 = New-ScheduledTaskTrigger -Daily -At "09:20"

$settings2 = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName "BlogAuto-Verify" `
  -Description "트렌드줌 발행 확인 및 텔레그램 보고 (09:20 KST)" `
  -Action $action2 `
  -Trigger $trigger2 `
  -Settings $settings2 `
  -Principal $principal `
  -Force | Out-Null

Write-Host "✅ BlogAuto-Verify 등록 완료 (매일 09:20 KST)"
Write-Host ""
Get-ScheduledTask -TaskName "BlogAuto-*" | Select-Object TaskName, State | Format-Table -AutoSize
