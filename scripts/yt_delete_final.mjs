import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const VIDEO_ID = 'FEByDK1VYuk';
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => { await p.screenshot({ path: `data/delf_${name}.png` }); };

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false, ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'], viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  await p.goto(`https://studio.youtube.com/video/${VIDEO_ID}/edit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);

  // 옵션 → 삭제
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button,[role="button"]')];
    btns.find(b => (b.getAttribute('aria-label')||'').includes('옵션'))?.click();
  });
  await wait(800);
  await p.evaluate(() => {
    const items = [...document.querySelectorAll('tp-yt-paper-item,[role="menuitem"]')];
    items.find(i => i.textContent?.trim() === '삭제')?.click();
  });
  await wait(1500);

  // 체크박스 체크
  await p.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"], tp-yt-paper-checkbox, [role="checkbox"]');
    if (cb) cb.click();
  });
  await wait(500);
  await snap(p, '01_checked');

  // 영구 삭제 버튼
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button,ytcp-button')];
    btns.find(b => b.textContent?.trim() === '영구 삭제')?.click();
  });
  await wait(4000);
  await snap(p, '02_done');

  const url = p.url();
  console.log('URL:', url);
  console.log(url.includes('/videos') ? '✅ 삭제 완료 — 목록으로 이동됨' : '확인 필요');

  await wait(3000);
  await ctx.close();
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
