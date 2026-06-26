/**
 * connect_chrome.js — 전용 Chromium 프로필로 Playwright 컨텍스트 생성
 *
 * data/chrome-profile/ 에 세션이 저장되므로 첫 로그인 이후 자동 재사용.
 * 첫 실행 시 Chrome 창이 열리면 Threads에 로그인하면 됨 (최대 5분 대기).
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'chrome-profile');

export async function connectChrome() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  async function newTab(url) {
    const page = await context.newPage();
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return page;
  }

  return { context, newTab };
}
