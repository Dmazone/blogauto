import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = 'data/adfit_result.json';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

// 매체 탭으로 이동
await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// 로그인 확인
if (page.url().includes('login') || page.url().includes('accounts.kakao')) {
  console.log('로그인 필요 — 창에서 카카오 로그인 후 기다려주세요');
  await page.waitForURL('**/adfit.kakao.com/**', { timeout: 120000 });
  await page.waitForTimeout(3000);
}

// 트렌드줌 더보기 버튼 클릭
const clicked = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('td, [role="cell"]')];
  const target = cells.find(c => c.innerText?.trim() === '트렌드줌');
  if (target) {
    const row = target.closest('tr, [role="row"]');
    const moreBtn = row?.querySelector('button, [class*="more"], [class*="detail"]');
    if (moreBtn) { moreBtn.click(); return 'more-btn'; }
    target.click(); return 'cell';
  }
  return null;
});
console.log('클릭 결과:', clicked);
await page.waitForTimeout(3000);

// 광고단위 코드 스크립트 태그 찾기
const adCode = await page.evaluate(() => {
  const scripts = [...document.querySelectorAll('script, code, pre, textarea')];
  for (const el of scripts) {
    const t = el.innerText || el.value || '';
    if (t.includes('DAN-') || t.includes('kakao_ad_area') || t.includes('ba.min.js')) {
      return t;
    }
  }
  // DAN- 패턴 텍스트에서 찾기
  const bodyText = document.body.innerText;
  const match = bodyText.match(/DAN-[A-Za-z0-9]+/);
  return match ? match[0] : null;
});

// 전체 텍스트 저장
const bodyText = await page.evaluate(() => document.body.innerText);

const result = { url: page.url(), adCode, bodyText: bodyText.slice(0, 8000) };
writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
console.log('저장 완료:', OUT);
console.log('광고 코드:', adCode);

await page.waitForTimeout(120000);
await ctx.close();
