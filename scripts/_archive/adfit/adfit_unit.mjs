import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = 'data/adfit_unit.json';

// 기존 Chrome 건드리지 않고 새 세션으로 실행
const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

// 광고단위 탭 바로 이동
await page.goto('https://adfit.kakao.com/adManagement?type=ADUNIT', {
  waitUntil: 'networkidle', timeout: 30000,
});
await page.waitForTimeout(4000);

// 매체 필터에서 트렌드줌 선택
const filterResult = await page.evaluate(() => {
  // 매체 선택 드롭다운 찾기
  const selects = [...document.querySelectorAll('select, [role="combobox"], [class*="select"]')];
  return selects.map(s => ({ tag: s.tagName, text: s.innerText?.slice(0, 50) }));
});
console.log('필터 요소:', JSON.stringify(filterResult));

// 매체 선택 버튼 클릭
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role="button"]')];
  const mediaBtn = btns.find(b => b.innerText?.includes('매체') || b.innerText?.includes('선택'));
  if (mediaBtn) mediaBtn.click();
});
await page.waitForTimeout(2000);

// 트렌드줌 선택
const selected = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role="option"], [class*="item"]')];
  const target = items.find(i => i.innerText?.includes('트렌드줌') || i.innerText?.includes('blogauto'));
  if (target) { target.click(); return target.innerText; }
  return null;
});
console.log('트렌드줌 선택:', selected);
await page.waitForTimeout(3000);

// 전체 페이지 텍스트에서 DAN- 코드 추출
const pageText = await page.evaluate(() => document.body.innerText);
const danCodes = [...pageText.matchAll(/DAN-[A-Za-z0-9]+/g)].map(m => m[0]);
console.log('DAN 코드 발견:', danCodes);

// 스크립트 태그 안에서도 탐색
const scriptCodes = await page.evaluate(() => {
  const all = [...document.querySelectorAll('script')];
  return all.map(s => s.innerText).filter(t => t.includes('DAN-'));
});
console.log('스크립트 내 DAN 코드:', scriptCodes.slice(0, 3));

writeFileSync(OUT, JSON.stringify({
  url: page.url(),
  danCodes,
  pageText: pageText.slice(0, 6000),
}, null, 2), 'utf8');
console.log('저장:', OUT);

await page.waitForTimeout(90000);
await ctx.close();
