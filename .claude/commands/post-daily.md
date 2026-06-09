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
[STEP 8] 이미지 생성 (Stable Horde, 장당 15~25분)
[STEP 8c] 이미지 크기 검수
품질 게이트 통과
git push
```

---

## 이미지 생성 상세 (Stable Horde 규칙 — 반드시 준수)

### 제한 사항 (agent_core.js에 이미 반영됨)
- **해상도**: `width: 640, height: 384` (익명키는 640px 초과 시 403)
- **폴링 타임아웃**: 30분 (익명 큐 대기시간 15~20분)
- **sharp 업스케일**: 640×384 → 1280×720 webp
- **재시도**: 실패 시 1회 자동 재시도

### 이미지 누락 확인 방법
```powershell
node --input-type=module -e "
import fs from 'fs';
const P = 'content/posts';
fs.readdirSync(P).forEach(s => {
  const sd = P+'/'+s;
  if (!fs.statSync(sd).isDirectory()) return;
  fs.readdirSync(sd).forEach(slug => {
    const pd = sd+'/'+slug;
    if (!fs.existsSync(pd+'/index.md')) return;
    const w = fs.readdirSync(pd).filter(f=>f.endsWith('.webp'));
    if (!w.some(f=>f.includes('-thumb')) || !w.some(f=>f.endsWith('-01.webp')) || !w.some(f=>f.endsWith('-02.webp')))
      console.log('[누락]', s+'/'+slug);
  });
});
"
```

누락 발견 시:
```powershell
node scripts/fix_missing_images.mjs
```

---

## 오류 처리

| 증상 | 원인 | 처리 |
|---|---|---|
| Gemini 로그인 필요 | 세션 만료 | 텔레그램 알림 자동 발송 → Chrome에서 paydma 계정 재로그인 |
| 입력창 찾기 실패 | 20분 대기 후 세션 불안정 | 자동 재시도 (newConversation 30초 대기 루프 적용됨) |
| H2 부족 품질 게이트 실패 | Gemini 응답 이상 | 해당 섹션 스킵 → `--only {섹션}` 으로 재실행 |
| 이미지 403 | 해상도 640px 초과 | agent_core.js 이미 640×384 고정 적용됨 |
| 이미지 no data | 폴링 타임아웃 | 자동 2회 재시도 (30분 타임아웃 적용됨) |
| 이미지 생성 2회 실패 | Stable Horde 장애 | 텍스트만 발행 후 나중에 fix_missing_images.mjs 실행 |
| "Markdown" 본문 노출 | Gemini 응답 레이블 | extractFinalMarkdown에 stripMarkdownLabel 적용됨 |

---

## 완료 확인

완료 시 텔레그램으로 예약발행 목록 자동 전송됨.

이미지 누락 포스팅이 있으면:
```powershell
node scripts/fix_missing_images.mjs
```
→ 전체 포스팅 스캔 후 누락된 것만 Stable Horde로 생성 후 git push.
