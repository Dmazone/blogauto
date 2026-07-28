import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // 1. 채널 핸들 확인
  await p.goto('https://studio.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);
  await p.screenshot({ path: 'data/chk_channel_studio.png' });

  // 맞춤설정 → 채널 핸들 확인
  await p.goto('https://studio.youtube.com/channel/UCQ07-tWWRq4jcpOZbTQpscA/editing/details', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);
  await p.screenshot({ path: 'data/chk_channel_details.png' });
  const txt = await p.evaluate(() => document.body.innerText);
  const handleMatch = txt.match(/@[A-Za-z0-9_\-\.]+/g);
  console.log('채널 핸들:', handleMatch);

  // 2. 올라간 영상 직접 확인
  await p.goto('https://www.youtube.com/shorts/FEByDK1VYuk', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);
  await p.screenshot({ path: 'data/chk_video_view.png' });
  const videoTitle = await p.evaluate(() => document.title);
  console.log('영상 제목:', videoTitle);
  console.log('URL:', p.url());

  await wait(3000);
  await ctx.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
