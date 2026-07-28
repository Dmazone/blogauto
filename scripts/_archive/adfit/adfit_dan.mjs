import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// 트렌드줌 행에서 광고단위 수(숫자 "1") 클릭 → 해당 매체 광고단위 목록으로 이동
const clicked = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('tr, [role="row"]')];
  for (const row of rows) {
    const text = row.innerText || '';
    if (text.includes('트렌드줌') || text.includes('blogauto')) {
      // 숫자 링크(광고단위 수) 찾기
      const links = [...row.querySelectorAll('a, button, [role="button"]')];
      // "1" 텍스트를 가진 링크 클릭
      const unitLink = links.find(l => l.innerText?.trim() === '1');
      if (unitLink) { unitLink.click(); return '1-클릭'; }
      // 없으면 더보기 버튼
      const moreBtn = links.find(l => l.innerText?.includes('더보기') || l.className?.includes('more'));
      if (moreBtn) { moreBtn.click(); return '더보기-클릭'; }
    }
  }
  return null;
});
console.log('클릭:', clicked);
await page.waitForTimeout(3000);

// 드롭다운에서 광고단위 관리 클릭
const menuClicked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role="menuitem"], [role="option"], a, button')];
  const target = items.find(i => i.innerText?.includes('광고단위'));
  if (target) { target.click(); return target.innerText; }
  return null;
});
console.log('메뉴 클릭:', menuClicked);
await page.waitForTimeout(4000);

// DAN 코드 찾기
const pageText = await page.evaluate(() => document.body.innerText);
const danMatches = [...pageText.matchAll(/DAN-[A-Za-z0-9]+/g)].map(m => m[0]);
console.log('DAN 코드:', danMatches);
console.log('현재 URL:', page.url());

// 광고단위 행에서 코드 버튼 클릭 시도
if (danMatches.length === 0) {
  const codeBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    const t = btns.find(b => b.innerText?.includes('코드') || b.innerText?.includes('스크립트'));
    if (t) { t.click(); return t.innerText; }
    return null;
  });
  console.log('코드 버튼:', codeBtn);
  await page.waitForTimeout(3000);

  const afterText = await page.evaluate(() => document.body.innerText);
  const afterDan = [...afterText.matchAll(/DAN-[A-Za-z0-9]+/g)].map(m => m[0]);
  console.log('코드 버튼 후 DAN:', afterDan);

  writeFileSync('data/adfit_dan.json', JSON.stringify({
    url: page.url(), danCodes: afterDan, text: afterText.slice(0, 6000)
  }, null, 2), 'utf8');
} else {
  writeFileSync('data/adfit_dan.json', JSON.stringify({
    url: page.url(), danCodes: danMatches, text: pageText.slice(0, 6000)
  }, null, 2), 'utf8');
}

console.log('완료 → data/adfit_dan.json');
await page.waitForTimeout(90000);
await ctx.close();
