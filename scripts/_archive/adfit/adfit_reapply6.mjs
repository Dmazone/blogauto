import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });

if (page.url().includes('accounts.kakao') || page.url().includes('login')) {
  console.log('>>> 로그인 필요');
  await page.waitForURL('**/adfit.kakao.com/**', { timeout: 180000 });
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(2000);

// 트렌드줌 더보기 = text 로케이터 4번째 (index 3)
// force:true 로 inner_tbl 오버레이 우회
console.log('트렌드줌 더보기 force 클릭...');
await page.locator('text=더보기').nth(3).click({ force: true, timeout: 10000 });
console.log('클릭 완료');
await page.waitForTimeout(2000);

// 드롭다운 내용
const menuText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log('드롭다운 후 화면:\n', menuText.slice(0, 600));

// 재심사 클릭
const reapply = await page.locator('text=재심사').first();
const count = await page.locator('text=재심사').count();
console.log('재심사 텍스트 요소 수:', count);

if (count > 0) {
  await reapply.click({ force: true, timeout: 5000 });
  console.log('재심사 클릭!');
  await page.waitForTimeout(2000);

  // 확인 팝업
  const confirmCount = await page.locator('button:has-text("확인")').count();
  if (confirmCount > 0) {
    await page.locator('button:has-text("확인")').first().click({ force: true });
    console.log('확인 클릭!');
  }
  await page.waitForTimeout(3000);
} else {
  // 재심사 없으면 현재 페이지 상태 출력
  const txt = await page.evaluate(() => {
    const layers = [...document.querySelectorAll('[class*="layer"], [class*="dropdown"], [class*="popup"], ul')];
    return layers.filter(l => l.offsetParent !== null).map(l => l.innerText?.trim()).filter(Boolean).join('\n---\n');
  });
  console.log('팝업/레이어 내용:', txt.slice(0, 500) || '없음');
}

const final = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('최종:\n', final);

await page.waitForTimeout(15000);
await ctx.close();
