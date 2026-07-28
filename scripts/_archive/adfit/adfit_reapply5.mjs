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

// span[slot="link"].ico_comm 이 더보기 버튼 실제 구조
// 부모 요소(링크/버튼) 기반으로 트렌드줌 행 찾기
const clicked = await page.evaluate(() => {
  // 모든 더보기 span 찾기
  const spans = [...document.querySelectorAll('span.ico_comm, [slot="link"], span')].filter(
    s => s.innerText?.trim() === '더보기'
  );
  console.log('span 수:', spans.length);

  // tr 또는 그 부모에서 트렌드줌 텍스트 찾기
  for (const span of spans) {
    let el = span;
    for (let i = 0; i < 8; i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      const t = el.innerText || '';
      if (t.includes('트렌드줌') && t.includes('blogauto')) {
        // 더보기 span의 실제 클릭 대상 (부모 a 또는 button)
        const clickTarget = span.closest('a, button, [role="button"]') || span;
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return `트렌드줌 더보기 dispatchClick (ancestor: ${el.tagName})`;
      }
    }
  }
  return '실패';
});
console.log('클릭:', clicked);
await page.waitForTimeout(2000);

// 드롭다운 항목 읽기
const items = await page.evaluate(() => {
  return [...document.querySelectorAll('*')]
    .filter(el => el.offsetParent !== null && el.children.length === 0)
    .map(el => el.innerText?.trim())
    .filter(t => t && t.length > 0 && t.length < 20)
    .filter((v, i, a) => a.indexOf(v) === i);
});
console.log('화면 요소:', items.slice(0, 30));

// 재심사 클릭
const reapply = await page.evaluate(() => {
  const all = [...document.querySelectorAll('*')].filter(el => el.offsetParent !== null);
  const target = all.find(el => {
    const t = el.innerText?.trim() || '';
    return t.includes('재심사') || t === '심사 요청';
  });
  if (target) {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return `재심사 클릭: "${target.innerText?.trim()}"`;
  }
  // 재심사 없으면 현재 메뉴 전체 출력
  const menu = [...document.querySelectorAll('[class*="layer"], [class*="dropdown"], [class*="popup"], [class*="menu"]')]
    .filter(el => el.offsetParent !== null)
    .map(el => el.innerText?.trim())
    .filter(Boolean);
  return '재심사 없음. 팝업: ' + menu.join(' | ');
});
console.log(reapply);
await page.waitForTimeout(2000);

// 확인 버튼
const confirm = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role="button"]')].filter(b => b.offsetParent !== null);
  const ok = btns.find(b => ['확인', '요청', '신청', '제출', '완료'].includes(b.innerText?.trim()));
  if (ok) { ok.dispatchEvent(new MouseEvent('click', { bubbles: true })); return ok.innerText?.trim(); }
  return null;
});
console.log('확인:', confirm);
await page.waitForTimeout(4000);

const finalText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('최종:\n', finalText);

await page.waitForTimeout(15000);
await ctx.close();
