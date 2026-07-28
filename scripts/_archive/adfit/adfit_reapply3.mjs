import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext('data/adfit-session', {
  headless: false,
  args: ['--no-first-run'],
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

await page.goto('https://adfit.kakao.com/adManagement', { waitUntil: 'networkidle', timeout: 30000 });

// 로그인 확인 및 대기
if (page.url().includes('accounts.kakao') || page.url().includes('login')) {
  console.log('>>> 로그인 필요: 카카오 계정으로 로그인해주세요 (최대 3분)');
  await page.waitForURL('**/adfit.kakao.com/**', { timeout: 180000 });
  await page.waitForTimeout(3000);
}
console.log('현재 URL:', page.url());

// 매체 탭에서 트렌드줌 행 찾기
await page.waitForTimeout(2000);

// 더보기 버튼 클릭 (row 텍스트로 식별)
const clicked = await page.evaluate(() => {
  // 방법 1: row 순서 기반 (오밥완=1, 니돈니드온=2, 트렌드줌=3)
  const allBtns = [...document.querySelectorAll('button')].filter(b =>
    b.innerText?.trim() === '더보기'
  );
  console.log('더보기 버튼 개수:', allBtns.length);

  // 각 행의 텍스트 확인
  for (const btn of allBtns) {
    const row = btn.closest('tr') || btn.closest('[role="row"]') || btn.parentElement?.parentElement;
    const rowText = row?.innerText || '';
    if (rowText.includes('blogauto') || rowText.includes('트렌드줌')) {
      btn.click();
      return `트렌드줌 더보기 클릭 (row: ${rowText.slice(0, 50)})`;
    }
  }

  // 방법 2: 3번째 더보기 버튼 클릭 (목록 순서: 오밥완/니돈니드온/트렌드줌/리드림)
  if (allBtns.length >= 3) {
    allBtns[2].click();
    return `3번째 더보기 클릭 (총 ${allBtns.length}개)`;
  }

  return `실패 (더보기 버튼 ${allBtns.length}개)`;
});
console.log('클릭 결과:', clicked);
await page.waitForTimeout(2000);

// 드롭다운 메뉴 내용 확인
const dropdownItems = await page.evaluate(() => {
  const visible = [...document.querySelectorAll('[role="menuitem"], li, button, a')]
    .filter(el => el.offsetParent !== null)
    .map(el => el.innerText?.trim())
    .filter(t => t && t.length < 30);
  return [...new Set(visible)].slice(0, 20);
});
console.log('드롭다운 메뉴:', dropdownItems);

// 재심사 클릭
const reapplied = await page.evaluate(() => {
  const allVisible = [...document.querySelectorAll('*')]
    .filter(el => el.offsetParent !== null);
  const target = allVisible.find(el => {
    const t = el.innerText?.trim() || '';
    return t.includes('재심사') || t === '심사 요청' || t === '재심사 요청';
  });
  if (target) {
    target.click();
    return `재심사 클릭: "${target.innerText?.trim()}"`;
  }
  return '재심사 버튼 없음';
});
console.log(reapplied);
await page.waitForTimeout(2000);

// 확인 모달
const confirmed = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role="button"]')]
    .filter(b => b.offsetParent !== null);
  const ok = btns.find(b => ['확인', '요청', '신청', '제출'].includes(b.innerText?.trim()));
  if (ok) { ok.click(); return `확인 버튼 클릭: "${ok.innerText?.trim()}"`; }
  return '확인 버튼 없음';
});
console.log(confirmed);
await page.waitForTimeout(3000);

const finalText = await page.evaluate(() => document.body.innerText.slice(0, 800));
console.log('최종 화면:\n', finalText);

await page.waitForTimeout(15000);
await ctx.close();
