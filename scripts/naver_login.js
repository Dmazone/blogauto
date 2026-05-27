/**
 * naver_login.js — 최초 1회 실행. 로그인 후 세션 저장.
 * 사용법: node scripts/naver_login.js
 *
 * - ID/비밀번호 자동 입력
 * - CAPTCHA, 2단계 인증은 사용자가 직접 해결
 * - 완료 후 data/naver_state.json 저장
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const STATE_FILE = path.join(__dirname, '..', 'data', 'naver_state.json');
const BLOG_ID    = 'myubel';
const NAVER_ID   = process.env.NAVER_ID || 'myubel';
const NAVER_PW   = process.env.NAVER_PW || '';

function waitForEnter(msg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, () => { rl.close(); resolve(); });
  });
}

async function main() {
  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });

  console.log('\n🌐 네이버 로그인 브라우저를 엽니다...');
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext();
  const page    = await context.newPage();

  await page.goto('https://nid.naver.com/nidlogin.login?url=https://blog.naver.com/' + BLOG_ID);

  // 로그인 페이지라면 ID/PW 자동 입력
  if (page.url().includes('nidlogin')) {
    console.log('📋 ID/비밀번호 자동 입력 중...');

    await page.fill('#id', NAVER_ID).catch(() => {});

    if (NAVER_PW) {
      await page.locator('input[type="password"]').pressSequentially(NAVER_PW, { delay: 60 }).catch(() => {});
    }

    console.log('');
    console.log('⚠️  보안문자(CAPTCHA)가 나타나면 브라우저 창에서 직접 입력하세요.');
    console.log('⚠️  로그인 버튼을 클릭하세요 (또는 Enter).');
    console.log('⚠️  2단계 인증 알림이 오면 스마트폰에서 승인하세요.');
    console.log('');

    // 블로그 페이지로 이동될 때까지 대기 (최대 3분)
    await page.waitForURL('**/blog.naver.com/**', { timeout: 180_000 }).catch(() => {
      console.warn('⚠️  3분 내 이동 없음 — 현재 상태로 저장합니다.');
    });
  }

  console.log(`\n현재 URL: ${page.url()}`);

  if (!page.url().includes('blog.naver.com')) {
    await waitForEnter('\n블로그 페이지가 열리면 Enter를 누르세요: ');
  }

  // 세션 저장
  await context.storageState({ path: STATE_FILE });
  console.log(`\n✅ 세션 저장 완료: ${STATE_FILE}`);
  console.log('이제 node scripts/naver_runner.js 를 실행할 수 있습니다.\n');

  await browser.close();
}

main().catch(console.error);
