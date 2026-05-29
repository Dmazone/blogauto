/**
 * connect_chrome.js — 실행 중인 Chrome에 CDP로 연결
 *
 * Chrome은 반드시 chrome_debug.bat으로 실행되어 있어야 함.
 * 연결 실패 시 chrome_debug.bat을 자동 실행 후 재시도.
 */
import { chromium } from 'playwright';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CDP_URL   = 'http://localhost:9222';
const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BAT_PATH   = path.join(__dirname, 'chrome_debug.bat');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 실행 중인 Chrome에 CDP로 연결.
 * Chrome이 디버그 모드가 아니면 자동 실행 후 재시도.
 *
 * @returns {{ browser: Browser, newTab: () => Promise<Page> }}
 */
export async function connectChrome() {
  let browser;

  // 1차 시도: 이미 실행 중인 Chrome에 연결
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 4000 });
  } catch {
    // 실행 중이지 않거나 디버그 포트 없음 → chrome_debug.bat 실행
    console.log('🌐  Chrome 디버그 모드 실행 중...');
    exec(`"${BAT_PATH}"`, { shell: true });
    await wait(4000);

    // 2차 시도
    try {
      browser = await chromium.connectOverCDP(CDP_URL, { timeout: 10000 });
    } catch (err) {
      throw new Error(
        `Chrome CDP 연결 실패 (${err.message})\n` +
        `→ chrome_debug.bat을 먼저 실행하거나, Chrome을 --remote-debugging-port=9222 옵션으로 시작해주세요.`
      );
    }
  }

  // 기존 context (로그인 세션 포함) 사용
  const contexts = browser.contexts();
  const context  = contexts[0] ?? await browser.newContext();

  /**
   * 새 탭을 열어 반환. 작업 완료 후 page.close() 로 탭만 닫을 것 (browser.close() 금지).
   */
  async function newTab(url) {
    const page = await context.newPage();
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return page;
  }

  return { browser, context, newTab };
}
