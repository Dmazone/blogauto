/**
 * yt_delete_video.mjs — @DmALOQ 채널에서 잘못 올라간 영상 삭제
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const VIDEO_ID = 'FEByDK1VYuk';
// @DmALOQ 채널 ID (잘못 올라간 곳)
const WRONG_CHANNEL = 'UCQ07-tWWRq4jcpOZbTQpscA';
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/del_${name}.png` });
  console.log(`📸 del_${name}.png`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // @DmALOQ 채널 Shorts 목록
  const shortsUrl = `https://studio.youtube.com/channel/${WRONG_CHANNEL}/videos/short`;
  console.log('1️⃣ @DmALOQ Shorts 목록...');
  await p.goto(shortsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);
  await snap(p, '01_list');

  // 해당 영상 점 3개 메뉴 → 영구삭제
  console.log('2️⃣ 삭제 메뉴 탐색...');
  const menuClicked = await p.evaluate((videoTitle) => {
    const rows = [...document.querySelectorAll('ytcp-video-row')];
    for (const row of rows) {
      if (row.textContent?.includes(videoTitle) || row.textContent?.includes('무선')) {
        // 점 3개 버튼
        const menuBtn = row.querySelector('#action-menu-button, ytcp-icon-button[id*="action"]');
        if (menuBtn) { menuBtn.click(); return 'menu-clicked'; }
      }
    }
    return null;
  }, '무선 에어');
  console.log('  메뉴:', menuClicked);
  await wait(1500);
  await snap(p, '02_menu');

  // "영구 삭제" 또는 "삭제" 클릭
  const deleteClicked = await p.evaluate(() => {
    const items = [...document.querySelectorAll('tp-yt-paper-item, [role="menuitem"]')];
    const del = items.find(i =>
      i.textContent?.trim().includes('영구 삭제') ||
      i.textContent?.trim().includes('삭제') ||
      i.textContent?.trim().includes('Delete')
    );
    if (del) { del.click(); return del.textContent?.trim(); }
    return null;
  });
  console.log('  삭제 선택:', deleteClicked);
  await wait(2000);
  await snap(p, '03_confirm_dialog');

  // 확인 다이얼로그 → 삭제 확인
  const confirmed = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, ytcp-button')];
    const confirm = btns.find(b =>
      b.textContent?.trim() === '영구 삭제' ||
      b.textContent?.trim() === '삭제' ||
      b.textContent?.trim() === 'Delete' ||
      b.textContent?.trim() === 'Confirm'
    );
    if (confirm) { confirm.click(); return confirm.textContent?.trim(); }
    return null;
  });
  console.log('  확인:', confirmed);
  await wait(3000);
  await snap(p, '04_deleted');

  const txt = await p.evaluate(() => document.body.innerText);
  if (confirmed) {
    console.log('\n✅ 삭제 완료');
  } else {
    console.log('\n→ data/del_*.png 확인 필요');
    console.log(txt.slice(0, 200));
  }

  await wait(5000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
