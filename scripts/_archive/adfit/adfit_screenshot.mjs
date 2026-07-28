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

// 더보기 버튼 위치 확인
const positions = await page.evaluate(() => {
  const items = [];
  const spans = [...document.querySelectorAll('span')].filter(s => s.innerText?.trim() === '더보기');
  for (const s of spans) {
    const rect = s.getBoundingClientRect();
    const parent = s.closest('tr') || s.parentElement;
    const pRect = parent?.getBoundingClientRect();
    items.push({
      spanX: Math.round(rect.x + rect.width/2),
      spanY: Math.round(rect.y + rect.height/2),
      parentTag: parent?.tagName,
      rowText: parent?.innerText?.slice(0, 50),
    });
  }
  return items;
});
console.log('더보기 위치:', JSON.stringify(positions, null, 2));

// 스크린샷
await page.screenshot({ path: 'data/adfit_screen.png', fullPage: false });
console.log('스크린샷 저장: data/adfit_screen.png');

// 트렌드줌 더보기 좌표로 클릭
const trend = positions.find(p => p.rowText?.includes('트렌드줌'));
if (trend) {
  console.log(`트렌드줌 더보기 위치: (${trend.spanX}, ${trend.spanY})`);
  await page.mouse.click(trend.spanX, trend.spanY);
  console.log('마우스 클릭 완료');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'data/adfit_after_click.png' });
  console.log('클릭 후 스크린샷: data/adfit_after_click.png');

  // 드롭다운 텍스트
  const menu = await page.evaluate(() => {
    const layers = [...document.querySelectorAll('[class*="layer"], [class*="dropdown"], [class*="popup"]')];
    return layers.filter(l => l.offsetParent !== null).map(l => l.innerText).join('\n');
  });
  console.log('드롭다운:', menu.slice(0, 300) || '없음');

  const reapplyCount = await page.locator('text=재심사').count();
  console.log('재심사 요소 수:', reapplyCount);
  if (reapplyCount > 0) {
    await page.locator('text=재심사').first().click({ force: true });
    console.log('재심사 클릭!');
    await page.waitForTimeout(2000);
    const confirmCount = await page.locator('button:has-text("확인")').count();
    if (confirmCount > 0) {
      await page.locator('button:has-text("확인")').first().click({ force: true });
      console.log('확인!');
    }
  }
} else {
  console.log('트렌드줌 더보기를 위치로 찾지 못함');
}

await page.waitForTimeout(10000);
await ctx.close();
