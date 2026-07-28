import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// API로 재심사 요청 (mediaId MU9 = 트렌드줌)
const apiResult = await page.evaluate(async () => {
  // 쿠키와 CSRF 토큰 가져오기
  const csrfMeta = document.querySelector('meta[name="csrf-token"], meta[name="_csrf"]');
  const csrf = csrfMeta?.content || '';

  // 재심사 API 엔드포인트 시도
  const endpoints = [
    { method: 'POST', url: '/api/v1/media/MU9/review/request' },
    { method: 'POST', url: '/api/v1/media/MU9/reapply' },
    { method: 'POST', url: '/api/v1/media/MU9/re-review' },
    { method: 'PUT',  url: '/api/v1/media/MU9/review' },
  ];

  const results = [];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`https://adfit.kakao.com${ep.url}`, {
        method: ep.method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
          'Accept': 'application/json',
        },
        body: ep.method !== 'GET' ? '{}' : undefined,
      });
      const text = await r.text();
      results.push({ url: ep.url, status: r.status, body: text.slice(0, 300) });
      if (r.ok) return results;
    } catch (e) {
      results.push({ url: ep.url, error: e.message });
    }
  }
  return results;
});
console.log('API 결과:', JSON.stringify(apiResult, null, 2));

// UI로도 시도: 더보기 버튼 클릭
const uiResult = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('tr, [role="row"]')];
  for (const row of rows) {
    const text = row.innerText || '';
    if (text.includes('트렌드줌') && text.includes('blogauto')) {
      const btns = [...row.querySelectorAll('button')];
      const moreBtn = btns.find(b => b.innerText?.includes('더보기') || btns.length === 1) || btns[0];
      if (moreBtn) { moreBtn.click(); return '더보기 클릭 성공'; }
    }
  }
  // 백업: 모든 더보기 버튼 찾아서 위치 기반으로 3번째 것 클릭 (트렌드줌 row)
  const allMoreBtns = [...document.querySelectorAll('button')].filter(b => b.innerText?.includes('더보기'));
  console.log('더보기 버튼 수:', allMoreBtns.length);
  if (allMoreBtns.length >= 3) {
    allMoreBtns[2].click(); // 3번째 행 (트렌드줌)
    return '3번째 더보기 클릭';
  }
  return '실패';
});
console.log('UI 결과:', uiResult);
await page.waitForTimeout(2000);

// 드롭다운 메뉴 옵션 읽기
const menuItems = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[role="menuitem"], li, [class*="dropdown"] a, [class*="dropdown"] button')];
  return items.map(i => i.innerText?.trim()).filter(Boolean).slice(0, 20);
});
console.log('메뉴 항목:', menuItems);

// 재심사 항목 클릭
const reapplyClick = await page.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  const target = all.find(el => {
    const t = el.innerText?.trim() || '';
    return (t === '재심사 요청' || t === '재심사요청' || t === '심사 요청' || t.includes('재심사')) && el.offsetParent !== null;
  });
  if (target) {
    target.click();
    return `클릭: "${target.innerText?.trim()}"`;
  }
  return null;
});
console.log('재심사 클릭:', reapplyClick);
await page.waitForTimeout(3000);

const finalText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
console.log('최종 상태:\n', finalText);

await page.waitForTimeout(8000);
await ctx.close();
