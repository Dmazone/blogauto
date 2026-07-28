/**
 * connect_chrome.js — 전용 Chromium 프로필로 Playwright 컨텍스트 생성
 *
 * data/chrome-profile/ 에 세션이 저장되므로 첫 로그인 이후 자동 재사용.
 * 최초 1회: node scripts/threads_setup.js 실행 후 로그인.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'chrome-profile');

mkdirSync(USER_DATA_DIR, { recursive: true });

// Playwright가 자동 삽입하는 자동화 탐지 포인트 제거용 init script
const STEALTH_SCRIPT = `
  (() => {
    // 가장 핵심 — Playwright/Selenium 감지 플래그 제거
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // headless에서는 window.chrome이 없어 탐지됨 — 채워 넣기
    if (!window.chrome) window.chrome = { runtime: {} };

    // 언어/플러그인을 실제 브라우저처럼
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });

    // permissions.query 훅 — Notification.permission 직접 반환 (자동화 탐지 우회)
    const _origQuery = window.navigator.permissions.query.bind(navigator.permissions);
    window.navigator.permissions.query = (p) =>
      p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : _origQuery(p);
  })();
`;

export async function connectChrome() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    // --enable-automation 제거 — HTTP 응답 헤더에 자동화 플래그 노출 방지
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // 이 context에서 생성되는 모든 페이지에 stealth 스크립트 자동 적용
  await context.addInitScript({ content: STEALTH_SCRIPT });

  async function newTab(url) {
    const page = await context.newPage();
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return page;
  }

  return { context, newTab };
}
