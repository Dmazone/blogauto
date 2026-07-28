import { chromium } from 'playwright';
import os from 'os';
import path from 'path';

const SESSION_DIR = path.join(os.homedir(), '.gemini-blog-session');
const wait = ms => new Promise(r => setTimeout(r, ms));

const context = await chromium.launchPersistentContext(SESSION_DIR, {
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

await page.goto('https://www.threads.net/@paydma.action', { waitUntil: 'networkidle', timeout: 30000 });
await wait(3000);
await page.screenshot({ path: 'data/threads_profile.png', fullPage: false });
console.log('스크린샷 저장: data/threads_profile.png');

// 팔로워 수 추출
const stats = await page.evaluate(() => {
  const text = document.body.innerText;
  const followerMatch = text.match(/(\d[\d,\.]*)\s*(팔로워|followers)/i);
  const postMatch = text.match(/(\d[\d,\.]*)\s*(게시물|posts)/i);
  return {
    followers: followerMatch ? followerMatch[1] : '파싱 불가',
    posts: postMatch ? postMatch[1] : '파싱 불가',
    snippet: text.slice(0, 500),
  };
});
console.log('팔로워:', stats.followers);
console.log('게시물:', stats.posts);

await wait(2000);
await context.close();
