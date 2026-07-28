import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

// GitHub Pages 빌드 대기 후 접근
await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// 트렌드줌 더보기 클릭
const moreClicked = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('td, [role="cell"]')];
  const target = cells.find(c => c.innerText?.trim() === '트렌드줌');
  if (target) {
    const row = target.closest('tr, [role="row"]');
    const moreBtn = row?.querySelector('button');
    if (moreBtn) { moreBtn.click(); return '더보기 클릭'; }
  }
  return null;
});
console.log(moreClicked);
await page.waitForTimeout(1500);

// 재심사 요청 클릭
const reapplyClicked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role="menuitem"], button, a')];
  const target = items.find(i => {
    const t = i.innerText?.trim() || '';
    return t.includes('재심사') || t.includes('심사 요청') || t.includes('심사요청');
  });
  if (target) { target.click(); return `클릭: ${target.innerText}`; }
  // 전체 텍스트 출력 (디버그용)
  return '재심사 버튼 없음. 메뉴: ' + items.slice(0, 30).map(i => i.innerText?.trim()).filter(Boolean).join(' | ');
});
console.log(reapplyClicked);
await page.waitForTimeout(2000);

// 확인 모달이 있으면 확인 클릭
const confirmed = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const confirmBtn = btns.find(b => {
    const t = b.innerText?.trim() || '';
    return t === '확인' || t === '요청' || t === '신청';
  });
  if (confirmBtn) { confirmBtn.click(); return `확인 클릭: ${confirmBtn.innerText}`; }
  return null;
});
console.log('확인:', confirmed);
await page.waitForTimeout(3000);

const resultText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('결과 페이지:\n', resultText.slice(0, 500));

await page.waitForTimeout(10000);
await ctx.close();
