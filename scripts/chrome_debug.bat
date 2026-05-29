@echo off
REM Chrome을 CDP 디버그 포트와 함께 시작
REM 자동화 스크립트들이 이 Chrome에 연결해서 로그인 상태 그대로 사용
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --no-first-run --no-default-browser-check
echo Chrome 디버그 모드로 실행됨 (포트 9222)
