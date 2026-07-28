# setup_claude_bot.ps1
# Claude Code 텔레그램 봇을 Windows 작업 스케줄러에 등록
# 관리자 PowerShell에서 실행: powershell -ExecutionPolicy Bypass -File scripts\setup_claude_bot.ps1

$taskName = "BlogAuto-ClaudeBot"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

Write-Host "📱 Claude Code 텔레그램 봇 스케줄러 등록 중..."

# 기존 태스크 제거
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# 실행할 PowerShell 스크립트 내용
$runScript = @"
Set-Location '$projectDir'
node scripts\claude_telegram_bot.js
"@

# 임시 실행 스크립트 저장
$runScriptPath = Join-Path $projectDir "scripts\_run_claude_bot.ps1"
Set-Content -Path $runScriptPath -Value $runScript -Encoding UTF8

# 작업 정의
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runScriptPath`"" `
  -WorkingDirectory $projectDir

# PC 시작 시 자동 실행
$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -RunLevel Highest `
  -LogonType Interactive

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Host "✅ 작업 등록 완료: $taskName"
Write-Host ""
Write-Host "지금 바로 시작하려면:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "수동 실행:"
Write-Host "  cd $projectDir && node scripts\claude_telegram_bot.js"
