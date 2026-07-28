/**
 * yt_login.mjs — ekaledma@gmail.com으로 YouTube Studio 로그인 세션 생성
 * 처음 실행 시 비밀번호 직접 입력 → 이후 세션 재사용
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  console.log('YouTube Studio 이동...');
  await p.goto('https://studio.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);

  const url = p.url();
  console.log('현재 URL:', url);

  if (url.includes('accounts.google.com')) {
    console.log('\n🔐 로그인 필요 — 브라우저에서 ekaledma@gmail.com / 비밀번호 입력해주세요');
    console.log('로그인 완료 후 자동으로 진행됩니다...\n');

    // 이메일 자동 입력 시도
    try {
      await p.locator('input[type="email"]').fill('ekaledma@gmail.com', { timeout: 5000 });
      await p.keyboard.press('Enter');
      await wait(2000);
      console.log('이메일 입력 완료 → 비밀번호를 브라우저에서 입력해주세요');
    } catch {
      console.log('→ 브라우저에서 직접 이메일/비밀번호 입력해주세요');
    }

    // 로그인 완료까지 대기 (최대 3분)
    await p.waitForURL('**/studio.youtube.com**', { timeout: 180000 });
    console.log('\n✅ 로그인 성공!');
    await wait(2000);
  }

  // 현재 채널 확인
  const channelInfo = await p.evaluate(() => {
    const name = document.querySelector('#channel-title')?.textContent?.trim()
      || document.querySelector('[id="header-logo"] + *')?.textContent?.trim()
      || document.title;
    return name;
  });
  console.log('채널:', channelInfo);

  await p.screenshot({ path: 'data/yt_studio.png' });
  console.log('📸 data/yt_studio.png');

  console.log('\n✅ 세션 저장 완료:', SESSION);
  console.log('다음 실행부터 자동 로그인됩니다.');

  await wait(5000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
