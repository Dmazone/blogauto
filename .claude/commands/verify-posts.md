# /verify-posts — 발행 점검 & 자동 수정

매일 09:30 KST, Task Scheduler가 자동 실행. 이 스킬은 수동 트리거 또는 재실행 용.

---

## 실행

```powershell
node scripts/verify_posts.js
```

스크립트가 자동으로:
1. `data/posts_log.json` 에서 어제 예약발행 목록 로드
2. `gh workflow run deploy.yml` 로 즉시 배포 트리거 → 2분 대기
3. 전체 URL HTTP 200 확인
4. **404 발견 시 자동 수정**: `draft: true` 또는 미래 날짜 → 수정 후 git push
5. 텔레그램으로 결과 보고

---

## 수동 수정이 필요한 경우

자동 수정으로 해결 안 되는 404:

```powershell
# 빌드 로그 확인
gh run list --workflow=deploy.yml --limit 3
gh run view <run-id> --log
```

| 원인 | 수동 처리 |
|---|---|
| slug ≠ 디렉토리명 | 디렉토리 rename 후 push |
| categories 영문 사용 | 한국어 섹션명으로 수정 후 push |
| 이미지 손상 (15KB 미만) | 해당 이미지만 재생성 후 push |

완료 시 텔레그램으로 정상/미게재 수 자동 전송됨.
