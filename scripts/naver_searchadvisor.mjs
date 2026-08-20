/**
 * naver_searchadvisor.mjs — 네이버 서치어드바이저 사이트맵 제출 자동화
 * Usage: node scripts/naver_searchadvisor.mjs
 *
 * 실행 전:
 *   1. https://searchadvisor.naver.com/ 에서 paydma 계정으로 수동 로그인 후
 *      세션 디렉토리 `data/2_sessions/naver-sa/` 에 세션 파일 생성 필요
 *   2. 또는 headless: false 로 실행 후 수동 로그인 → 이후 자동 실행
 */
import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, '..', 'data', '2_sessions', 'naver-sa');
const SITE_URL    = 'https://dmazone.github.io/blogauto/';
const SITEMAP_URL = 'https://dmazone.github.io/blogauto/sitemap.xml';

const wait = ms => new Promise(r => setTimeout(r, ms));
const log  = (e, m) => console.log(`${e}  ${m}`);
const snap = async (page, name) => {
  await page.screenshot({ path: `data/3_screenshots/nsa_${name}.png` });
  log('📸', `nsa_${name}.png`);
};

async function main() {
  log('🚀', '네이버 서치어드바이저 자동화 시작');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // ── 서치어드바이저 사이트맵 페이지 접속 ──────────────────────────────────
    const SAT_URL = `https://searchadvisor.naver.com/site/${encodeURIComponent(SITE_URL)}/sitemaps`;
    log('🌐', `접속: ${SAT_URL}`);
    await page.goto(SAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);
    await snap(page, '01_loaded');

    // 로그인 페이지로 리다이렉트됐는지 확인
    if (page.url().includes('nid.naver.com') || page.url().includes('login')) {
      log('❌', '네이버 로그인 필요 — 브라우저에서 수동 로그인 후 다시 실행하세요');
      log('ℹ️', `세션 저장 위치: ${SESSION_DIR}`);
      await wait(60000); // 60초 대기 (수동 로그인 기회 제공)
      await page.goto(SAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);
      await snap(page, '02_after_login');
      if (page.url().includes('nid.naver.com')) {
        log('❌', '로그인 실패 — 종료');
        return;
      }
    }

    // ── 사이트맵 URL 입력 ────────────────────────────────────────────────────
    log('✏️', `사이트맵 URL 입력: ${SITEMAP_URL}`);

    // 입력 필드 찾기
    let inputFound = false;
    try {
      const input = page.locator('input[type="text"], input[placeholder*="sitemap"], input[placeholder*="사이트맵"]').first();
      await input.waitFor({ state: 'visible', timeout: 8000 });
      await input.fill(SITEMAP_URL);
      inputFound = true;
      log('✅', '입력 필드에 URL 입력');
    } catch {}

    if (!inputFound) {
      // JS로 입력
      const filled = await page.evaluate((url) => {
        const inputs = [...document.querySelectorAll('input[type="text"], input[type="url"]')];
        const target = inputs.find(el => !el.value || el.value.includes('http'));
        if (!target) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(target, url);
        ['input', 'change'].forEach(ev => target.dispatchEvent(new Event(ev, { bubbles: true })));
        return true;
      }, SITEMAP_URL);
      if (filled) log('✅', 'JS로 URL 입력');
      else log('⚠️', '입력 필드를 찾을 수 없음');
    }

    await wait(800);
    await snap(page, '03_input');

    // ── 제출 버튼 클릭 ────────────────────────────────────────────────────────
    let clicked = false;
    try {
      await page.getByRole('button', { name: /제출|등록|확인/i }).first().click({ timeout: 5000 });
      clicked = true; log('✅', '제출 버튼 클릭');
    } catch {}

    if (!clicked) {
      clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const btn = btns.find(b => /제출|등록|확인|Submit/.test(b.textContent?.trim() || ''));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clicked) log('✅', 'JS 버튼 클릭');
    }

    await wait(4000);
    await snap(page, '04_result');

    const body = await page.locator('body').textContent().catch(() => '');
    const success = body.includes(SITEMAP_URL) || body.includes('완료') || body.includes('등록') || body.includes('성공');

    if (success) {
      log('✅', '사이트맵 제출 완료');
      await sendTelegram(`✅ 네이버 서치어드바이저 사이트맵 제출 완료\n${SITEMAP_URL}`);
    } else {
      log('⚠️', '제출 결과 불명확 — 스크린샷 확인 필요');
      await sendTelegram(`⚠️ 네이버 서치어드바이저 제출 결과 불명확 — data/3_screenshots/nsa_04_result.png 확인`);
    }

  } catch (err) {
    log('❌', err.message);
    await snap(page, 'error').catch(() => {});
    await sendTelegram(`❌ 네이버 서치어드바이저 오류: ${err.message}`);
  } finally {
    await wait(2000);
    await context.close();
  }
}

main();
