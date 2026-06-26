/**
 * threads_setup.js — Threads 세션 초기화 (최초 1회만 실행)
 *
 * 실행:  node scripts/threads_setup.js
 *
 * Chrome 창이 열리면 Threads에 paydma.action으로 로그인하세요.
 * 로그인 완료가 감지되면 자동으로 세션이 저장되고 창이 닫힙니다.
 * 이후 threads_poster.js는 저장된 세션을 자동으로 재사용합니다.
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'chrome-profile');
const THREADS_HOME  = 'https://www.threads.com';

mkdirSync(USER_DATA_DIR, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('━'.repeat(55));
  console.log('🔧  Threads 세션 초기화 시작');
  console.log('📂  프로필 저장 위치:', USER_DATA_DIR);
  console.log('━'.repeat(55));
  console.log('👉  Chrome 창이 열리면 paydma.action으로 로그인하세요.');
  console.log('    로그인 완료 시 자동으로 감지되고 창이 닫힙니다.');
  console.log('━'.repeat(55));

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // 기본 stealth 패치
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    if (!window.chrome) window.chrome = { runtime: {} };
  });

  await page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 이미 로그인된 경우 확인
  const alreadyLoggedIn = await checkLogin(page);
  if (alreadyLoggedIn) {
    console.log('✅  이미 paydma.action으로 로그인되어 있습니다!');
    console.log('🎉  세션 저장 완료 — threads_poster.js를 바로 실행할 수 있습니다.');
    await wait(2000);
    await context.close();
    return;
  }

  console.log('⏳  로그인 대기 중 (최대 10분)...');

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await wait(5000);
    const loggedIn = await checkLogin(page).catch(() => false);
    if (loggedIn) {
      console.log('✅  paydma.action 로그인 확인됨!');
      console.log('💾  세션 저장 중...');
      await wait(3000); // 세션 완전히 기록될 시간
      await context.close();
      console.log('🎉  완료! 이제 threads_poster.js가 자동으로 이 세션을 사용합니다.');
      return;
    }
  }

  console.log('❌  10분 내 로그인이 감지되지 않았습니다. 다시 실행해주세요.');
  await context.close();
  process.exit(1);
}

async function checkLogin(page) {
  const url = page.url();
  if (url.includes('/login') || url.includes('force_authentication')) return false;

  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')];
    return links.some(a => a.href.toLowerCase().includes('paydma.action'));
  }).catch(() => false);
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
