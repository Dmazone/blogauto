/**
 * setup_flow_session.mjs
 * Google Flow 세션을 한 번만 설정하는 스크립트
 *
 * 사용법: node scripts/setup_flow_session.mjs
 *
 * 브라우저가 자동으로 열립니다. Google 로그인 후 Flow 페이지가 로드되면
 * 자동으로 세션이 저장됩니다. (터미널 입력 불필요)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, '..', '.flow-session');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

const FLOW_URL = 'https://labs.google/fx/ko/tools/flow';

async function main() {
  console.log('');
  console.log('🎨 Google Flow 세션 설정 시작');
  console.log('='.repeat(50));
  console.log('');
  console.log('브라우저가 열립니다. 다음 순서로 진행하세요:');
  console.log('  1. Google 계정(paydma@gmail.com)으로 로그인');
  console.log('  2. Flow 이미지 생성 페이지가 보이면 ← 자동 저장됨');
  console.log('');
  console.log('⏳ 최대 3분 대기...');
  console.log('');

  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Navigate to Flow
  await page.goto(FLOW_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Poll until user reaches labs.google/fx (logged in state)
  const deadline = Date.now() + 3 * 60 * 1000; // 3 minutes
  let saved = false;

  while (Date.now() < deadline) {
    const url = page.url();
    const title = await page.title();

    // Detect when user is FULLY logged in: must have next-auth session-token cookie
    const state = await context.storageState();
    const cookies = state.cookies || [];
    const hasSessionToken = cookies.some(c =>
      c.name.includes('session-token') || c.name === 'SAPISID' || c.name === 'SID'
    );
    const onFlowPage = url.includes('labs.google') && !url.includes('accounts.google');

    if (onFlowPage && hasSessionToken) {
      // Wait for the page to fully settle
      await page.waitForTimeout(3000);
      const finalState = await context.storageState();
      const cookieCount = finalState.cookies?.length ?? 0;

      fs.writeFileSync(SESSION_FILE, JSON.stringify(finalState, null, 2));
      console.log(`\n✅ 로그인 확인! 세션 저장 완료 (쿠키 ${cookieCount}개)`);
      console.log(`   파일: ${SESSION_FILE}`);
      saved = true;
      break;
    }

    if (!saved && url.includes('labs.google')) {
      process.stdout.write(`\r현재 페이지: ${url.substring(0, 60)}... 로그인 대기 중`);
    }

    process.stdout.write('.');
    await page.waitForTimeout(3000);
  }

  if (!saved) {
    console.log('\n⚠️  타임아웃 — 현재 상태로 세션 저장 시도...');
    const state = await context.storageState();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
    const cookieCount = state.cookies?.length ?? 0;
    console.log(`저장됨 (쿠키 ${cookieCount}개). 다시 실행이 필요할 수 있어요.`);
  }

  await browser.close();

  console.log('');
  console.log('🎉 설정 완료!');
  console.log('   이제 자동 포스팅 시 Flow 이미지가 생성됩니다.');
  console.log('   실행: node scripts/agent_core.js --section economy');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ 오류:', err.message);
  process.exit(1);
});
