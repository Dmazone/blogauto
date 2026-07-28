import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const VIDEO_ID = 'FEByDK1VYuk';
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => { await p.screenshot({ path: `data/del3_${name}.png` }); console.log(`📸 ${name}`); };

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // 영상 edit 페이지 직접 접근
  await p.goto(`https://studio.youtube.com/video/${VIDEO_ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);
  await snap(p, '01_edit');

  // 상단 점3개(더보기) 버튼 클릭 — 헤더 영역
  const moreBtn = await p.evaluate(() => {
    // aria-label에 "더보기", "more actions", "옵션" 등
    const btns = [...document.querySelectorAll('button, ytcp-icon-button, [role="button"]')];
    const more = btns.find(b => {
      const l = (b.getAttribute('aria-label') || '').toLowerCase();
      const t = (b.textContent || '').trim();
      return l.includes('more') || l.includes('더보기') || l.includes('옵션') ||
             l.includes('action') || t === '⋯' || t === '…';
    });
    if (more) { more.click(); return more.getAttribute('aria-label') || more.textContent; }
    return null;
  });
  console.log('더보기 버튼:', moreBtn);
  await wait(1000);
  await snap(p, '02_more_menu');

  // 삭제 메뉴 선택
  const delItem = await p.evaluate(() => {
    const items = [...document.querySelectorAll('tp-yt-paper-item, [role="menuitem"], ytcp-ve')];
    const d = items.find(i => i.textContent?.trim().match(/^(삭제|Delete|영구 삭제)$/));
    if (d) { d.click(); return d.textContent?.trim(); }
    return null;
  });
  console.log('삭제 메뉴:', delItem);
  await wait(1500);
  await snap(p, '03_confirm');

  // 확인 다이얼로그
  const confirmed = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, ytcp-button')];
    const d = btns.find(b => b.textContent?.trim().match(/영구 삭제|삭제|Delete/));
    if (d) { d.click(); return d.textContent?.trim(); }
    return null;
  });
  console.log('확인:', confirmed);
  await wait(4000);
  await snap(p, '04_result');

  console.log('현재 URL:', p.url());
  if (p.url().includes('/videos/')) {
    console.log('✅ 삭제 후 목록으로 이동 → 삭제 완료');
  }

  await wait(5000);
  await ctx.close();
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
