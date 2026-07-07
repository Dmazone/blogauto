# /post-daily — 트렌드줌 블로그 포스팅

매일 22:00 KST, Task Scheduler가 자동 실행. 이 스킬은 수동 트리거 또는 재실행 용.

---

## STEP 0 — 전제조건 확인

Chrome CDP 연결 확인:
```powershell
(Invoke-WebRequest -Uri http://localhost:9222/json -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode
```
- **200** → 연결됨
- **오류** → `scripts\chrome_debug.bat` 실행 후 Chrome에서 paydma 계정으로 Gemini Pro 접속 확인

---

## STEP 1 — 실행

```powershell
node scripts/daily_runner.js
```

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

**정상 흐름:**
```
[Turn 1] 트렌드 조사
[Turn 2] 주제 확정 + 아웃라인
[Turn 3] 본문 집필
[Turn 4] 자체검수
[Turn 5] 최종 마크다운 추출
[Turn 6] 이미지 프롬프트 생성
[STEP 7] 검수 스킵 (Turn 4 완료)
[STEP 8] 이미지 생성
[STEP 8c] 이미지 크기 검수
품질 게이트 통과
git push
```

---

## 재시도 전략 (자동 적용)

섹션당 최대 **3회** 시도, 각 실패 후 3분 대기.

**품질 게이트 기준 (agent_core.js)**:
- H2 최소 **2개** (이전 3개에서 완화 — Gemini 응답 편차 흡수)
- 본문 최소 **1,000자** (공백 제외)

**H2 복구 3단계 (Turn 5 내)**:
1. H2 부족 시 즉시 재출력 요청 (Turn 5 재시도)
2. 실패 시 DOM 직접 추출 + 마크다운 역변환
3. 그래도 부족 시 숫자번호(`1. 제목`) → `## 제목` 자동 변환

**Gemini 응답 재추출 방지 (gemini_browser.js)**:
- 전송 전 응답 요소 수 기록
- 새 응답 요소가 DOM에 추가될 때까지 최대 15초 대기 후 추출

---

## 이미지 생성

| 항목 | 값 |
|---|---|
| 소스 | Pollinations.ai (flux 모델, 1280×720) |
| 재시도 | 실패 시 1회 자동 재시도 |
| 누락 복구 | `node scripts/fix_missing_images.mjs` |

---

## 오류 처리

| 증상 | 원인 | 처리 |
|---|---|---|
| Gemini 로그인 필요 | 세션 만료 | 텔레그램 알림 자동 발송 → Chrome에서 paydma 계정 재로그인 |
| 입력창 찾기 실패 | 세션 불안정 | 자동 재시도 (newConversation 30초 대기 루프) |
| H2 부족 3회 전부 실패 | Gemini JSON 파싱 반복 실패 | `--only {섹션} --now` 로 즉시 재실행 |
| 이미지 누락 | 생성 오류 | `node scripts/fix_missing_images.mjs` |

---

## 완료 확인

완료 시 텔레그램으로 예약발행 목록 자동 전송됨.

이미지 누락 포스팅이 있으면:
```powershell
node scripts/fix_missing_images.mjs
```
→ 전체 포스팅 스캔 후 누락된 것만 생성 후 git push.
