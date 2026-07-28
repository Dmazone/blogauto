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

// 테이블 렌더링 대기
await page.waitForTimeout(3000);

// 모든 요소 중 '더보기' 텍스트 포함 요소 찾기 (Playwright 내장)
const allMoreBtns = await page.locator('text=더보기').all();
console.log('더보기 요소 수:', allMoreBtns.length);

// 각 더보기 옆 행 텍스트 확인
for (let i = 0; i < allMoreBtns.length; i++) {
  const parent = allMoreBtns[i].locator('..').locator('..');
  const rowText = await parent.innerText().catch(() => '');
  console.log(`더보기[${i}] 부모 텍스트:`, rowText.slice(0, 80).replace(/\n/g, ' | '));
}

// 트렌드줌 행의 더보기 찾기
let trendBtn = null;
for (let i = 0; i < allMoreBtns.length; i++) {
  try {
    const ancestor = allMoreBtns[i].locator('xpath=ancestor::tr[1]');
    const rowText = await ancestor.innerText({ timeout: 1000 }).catch(() => '');
    if (rowText.includes('트렌드줌') || rowText.includes('blogauto')) {
      trendBtn = allMoreBtns[i];
      console.log('트렌드줌 더보기 발견 (index', i, ')');
      break;
    }
  } catch {}
}

// 못 찾으면 3번째 (오밥완=0, 니돈니드온=1, 트렌드줌=2)
if (!trendBtn && allMoreBtns.length >= 3) {
  trendBtn = allMoreBtns[2];
  console.log('3번째 더보기 사용 (트렌드줌 추정)');
}

if (!trendBtn) {
  console.log('더보기 버튼을 찾을 수 없음. DOM 구조 확인:');
  const html = await page.evaluate(() => {
    const table = document.querySelector('table, [role="grid"], [class*="list"]');
    return table?.innerHTML?.slice(0, 2000) || document.body.innerHTML.slice(0, 2000);
  });
  console.log(html);
  await ctx.close();
  process.exit(1);
}

// 더보기 클릭
await trendBtn.click();
console.log('더보기 클릭 완료');
await page.waitForTimeout(1500);

// 드롭다운에서 재심사 요청 찾기
const dropdownItems = await page.locator('[role="menuitem"], [role="option"], li, button').all();
console.log('드롭다운 항목 수:', dropdownItems.length);
for (const item of dropdownItems) {
  const t = await item.innerText().catch(() => '');
  if (t.trim()) console.log(' -', t.trim());
}

// 재심사 텍스트 요소 클릭
try {
  const reapplyBtn = page.locator('text=/재심사/');
  const count = await reapplyBtn.count();
  console.log('재심사 요소 수:', count);
  if (count > 0) {
    await reapplyBtn.first().click();
    console.log('재심사 요청 클릭!');
  }
} catch (e) {
  console.log('재심사 클릭 오류:', e.message);
}

await page.waitForTimeout(2000);

// 확인 팝업
try {
  const confirmBtn = page.locator('button:has-text("확인"), button:has-text("요청"), button:has-text("신청")');
  if (await confirmBtn.count() > 0) {
    await confirmBtn.first().click();
    console.log('확인 클릭!');
  }
} catch {}

await page.waitForTimeout(3000);
const finalText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log('최종 화면:\n', finalText);

await page.waitForTimeout(15000);
await ctx.close();
