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

// 트렌드줌 행 위치 파악
const rowPos = await page.evaluate(() => {
  const trs = [...document.querySelectorAll('tr')];
  for (const tr of trs) {
    if (tr.innerText?.includes('트렌드줌') && tr.innerText?.includes('blogauto')) {
      const rect = tr.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width * 0.25), y: Math.round(rect.y + rect.height / 2) };
    }
  }
  return null;
});
console.log('트렌드줌 행 위치:', rowPos);

if (!rowPos) { console.log('행 없음'); await ctx.close(); process.exit(1); }

// 1단계: 행 위에 마우스 올려서 hover 상태 만들기
await page.mouse.move(rowPos.x, rowPos.y);
await page.waitForTimeout(800);

// hover 후 더보기(⋮) 스팬 위치 재확인
const btnPos = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('span.ico_comm, span[slot="link"]')].filter(
    s => s.innerText?.trim() === '더보기'
  );
  for (const s of spans) {
    const rect = s.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const tr = s.closest('tr');
      if (tr?.innerText?.includes('트렌드줌')) {
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
      }
    }
  }
  // 위치가 0이 아닌 더보기 스팬 중 행 내 4번째 (트렌드줌=index 3, 조형섭 제외=2)
  const visible = spans.filter(s => {
    const r = s.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  console.log('visible 더보기 수:', visible.length);
  if (visible.length > 0) {
    const r = visible[visible.length - 1].getBoundingClientRect();
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
  }
  return null;
});

console.log('더보기 버튼 hover 후 위치:', btnPos);

if (btnPos && btnPos.x > 0 && btnPos.y > 0) {
  // 2단계: 정확한 좌표로 클릭
  await page.mouse.move(btnPos.x, btnPos.y);
  await page.waitForTimeout(300);
  await page.mouse.click(btnPos.x, btnPos.y);
  console.log(`더보기 클릭: (${btnPos.x}, ${btnPos.y})`);
} else {
  // fallback: hover 상태에서 바로 첫 번째 visible span 클릭
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')].filter(s => s.innerText?.trim() === '더보기');
    const visible = spans.filter(s => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (visible.length) visible[0].click();
  });
  console.log('fallback 클릭');
}

await page.waitForTimeout(1500);
await page.screenshot({ path: 'data/adfit_hover_click.png' });
console.log('스크린샷: data/adfit_hover_click.png');

// 재심사 찾기
const reapplyCount = await page.locator('text=재심사').count();
console.log('재심사 요소 수:', reapplyCount);

if (reapplyCount > 0) {
  await page.locator('text=재심사').first().click({ timeout: 5000 });
  console.log('재심사 클릭!');
  await page.waitForTimeout(2000);
  const confirmCount = await page.locator('button:has-text("확인")').count();
  if (confirmCount > 0) {
    await page.locator('button:has-text("확인")').first().click();
    console.log('확인 클릭!');
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'data/adfit_reapply_done.png' });
  console.log('완료 스크린샷: data/adfit_reapply_done.png');
} else {
  // 현재 화면 텍스트
  const visible = await page.evaluate(() => {
    return [...document.querySelectorAll('*')]
      .filter(el => el.offsetParent !== null && el.children.length === 0)
      .map(el => el.innerText?.trim())
      .filter(t => t && t.length > 1 && t.length < 30)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 40);
  });
  console.log('현재 화면 요소:', visible);
}

await page.waitForTimeout(15000);
await ctx.close();
