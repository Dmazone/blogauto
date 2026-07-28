import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const WRONG_CHANNEL = 'UCQ07-tWWRq4jcpOZbTQpscA';
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => { await p.screenshot({ path: `data/del2_${name}.png` }); console.log(`📸 ${name}`); };

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  await p.goto(`https://studio.youtube.com/channel/${WRONG_CHANNEL}/videos/short`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);

  // 첫 번째 행(무선 에어 영상) hover → 점3개 메뉴 클릭
  const firstRow = p.locator('ytcp-video-row').first();
  await firstRow.hover();
  await wait(800);
  await snap(p, '01_hover');

  // 점3개 버튼 (행 안의 action 버튼)
  await firstRow.locator('#action-menu-button, [id*="action-menu"], ytcp-icon-button').last().click();
  await wait(1000);
  await snap(p, '02_menu_open');

  // 삭제 메뉴 아이템
  const delItem = p.locator('tp-yt-paper-item, [role="menuitem"]').filter({ hasText: /삭제|Delete/ }).first();
  await delItem.click();
  await wait(1500);
  await snap(p, '03_dialog');

  // 영구삭제 확인 버튼
  const confirmBtn = p.locator('ytcp-button, button').filter({ hasText: /영구 삭제|삭제|Delete/ }).last();
  await confirmBtn.click();
  await wait(3000);
  await snap(p, '04_done');

  const txt = await p.evaluate(() => document.body.innerText);
  console.log(txt.includes('무선') ? '⚠️ 아직 존재' : '✅ 삭제 완료');

  await wait(5000);
  await ctx.close();
}
main().catch(async e => { console.error('❌', e.message); process.exit(1); });
