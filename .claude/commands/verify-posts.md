# /verify-posts — 발행 점검 & 자동 수정 스킬

매일 08:00 KST 실행. 전날 예약발행된 5개 포스팅을 점검하고 문제 발견 시 즉시 수정·재발행.

---

## 실행 순서

### 1. 전날 포스팅 목록 로드

```bash
cat data/posts_log.json
```

없으면 `content/posts/` 에서 어제 날짜 포스팅 탐색:
```bash
# 어제 날짜(KST) 기준 index.md 목록
find content/posts -name "index.md" -newer /tmp/yesterday_marker
```

---

### 2. 배포 강제 트리거

```bash
gh workflow run deploy.yml
```

30초 대기 후 점검 시작.

---

### 3. URL 접근 확인 (5개 포스팅)

각 URL에 HTTP GET 요청:
- **200** → 정상
- **404** → Hugo 빌드 누락 or slug 오류 → 즉시 수정
- **기타** → 30초 후 재시도 1회

블로그 베이스 URL: `https://dmazone.github.io/blogauto`
URL 패턴: `{BASE_URL}/posts/{섹션}/{slug}/`

---

### 4. 문제 발견 시 자동 수정

#### 404 케이스별 처리

| 원인 | 조치 |
|---|---|
| front matter `draft: true` 남아있음 | `draft: false` 로 수정 후 push |
| `date`가 미래 시각으로 잘못 설정 | 현재 KST 시각으로 수정 후 push |
| slug 디렉토리명 불일치 | 디렉토리명 = slug 값인지 확인, 다르면 rename 후 push |
| Hugo 빌드 자체 실패 | `gh run list --workflow=deploy.yml --limit 3` 로 빌드 로그 확인 |

수정 후:
```bash
git add content/posts/섹션/slug/
git commit -m "fix: {포스팅 제목} 발행 오류 수정"
git push
```

push 후 2분 대기 → URL 재확인.

---

### 5. 텔레그램 결과 알림

```
📊 트렌드줌 발행 확인 완료
✅ 정상: N개
❌ 수정 처리: N개
─────────────────
{포스팅별 상태 목록}
```

TOKEN: `8995151494:AAGUWIxj5PKma_2gr_HoJTHslXSCpNpqkNg`
CHAT_ID: `7724357585`

---

## 추가 콘텐츠 품질 점검 (선택)

시간 여유가 있으면 아래 항목도 확인:

- 썸네일 이미지 파일 존재 여부: `slug-thumb.webp`
- 본문 이미지 2개 존재 여부: `slug-01.webp`, `slug-02.webp`
- 파일 크기 15KB 미만이면 손상 가능성 → 재생성
- categories 값이 한국어인지 확인 (영문 section ID 사용 시 빌드 전체 실패)
