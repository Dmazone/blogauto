@echo off
REM Chrome을 CDP 디버그 포트와 함께 시작 (자동화용 — 기존 세션/북마크/비밀번호 그대로)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --no-first-run --no-default-browser-check
echo Chrome 디버그 모드로 실행됨 (포트 9222)
