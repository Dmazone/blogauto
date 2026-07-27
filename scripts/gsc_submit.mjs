/**
 * gsc_submit.mjs — Google Search Console 사이트맵 재제출 자동화
 * 사용: node scripts/gsc_submit.mjs
 */

import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(os.homedir(), '.gemini-blog-session');

const SITE_URL = 'https://dmazone.github.io/blogauto/';
const SITEMAP  = 'https://dmazone.github.io/blogauto/sitemap.xml';
const GSC_URL  = `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(SITE_URL)}`;

const wait = ms => new Promise(r => setTimeout(r, ms));
const log  = (e, m) => console.log(`${e}  ${m}`);
const snap = async (page, name) => { await page.screenshot({ path: `data/gsc_${name}.png` }); log('📸', name); };

async function main() {
  log('🚀', 'GSC 자동화 시작');
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(GSC_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(3000);
    await snap(page, '01_loaded');

    if (page.url().includes('accounts.google.com')) {
      log('❌', 'Google 로그인 필요'); return;
    }

    // ── DOM 전체 "제출" 텍스트 포함 요소 조사 ───────────────────────
    const submitElemInfo = await page.evaluate(() => {
      const all = [...document.querySelectorAll('*')];
      return all
        .filter(el => el.textContent.trim() === '제출' && el.children.length === 0)
        .map(el => ({
          tag: el.tagName,
          class: el.className?.slice(0, 60),
          parentTag: el.parentElement?.tagName,
          parentClass: el.parentElement?.className?.slice(0, 60),
          rect: el.getBoundingClientRect(),
        }));
    });
    log('🔍', `"제출" 요소: ${JSON.stringify(submitElemInfo)}`);

    // ── 기존 사이트맵 삭제 ────────────────────────────────────────────
    // ⋮ 버튼 — "more_vert" 아이콘 포함한 모든 요소 찾기
    const kebabInfo = await page.evaluate(() => {
      const all = [...document.querySelectorAll('*')];
      const candidates = all.filter(el =>
        el.textContent.trim() === 'more_vert' ||
        (el.className && String(el.className).includes('more-vert')) ||
        (el.getAttribute('aria-label') || '').includes('more')
      );
      return candidates.map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, text: el.textContent.trim().slice(0, 20), x: r.left + r.width/2, y: r.top + r.height/2 };
      }).filter(c => c.x > 0 && c.y > 0);
    });
    log('🔍', `⋮ 후보: ${JSON.stringify(kebabInfo)}`);

    if (kebabInfo.length > 0) {
      const kb = kebabInfo[0];
      log('🗑️', `⋮ 클릭: (${kb.x}, ${kb.y})`);
      await page.mouse.move(kb.x, kb.y - 50);
      await wait(400);
      await page.mouse.move(kb.x, kb.y);
      await wait(400);
      await page.mouse.click(kb.x, kb.y);
      await wait(1500);
      await snap(page, '02_kebab');

      // 메뉴 텍스트 확인
      const menuItems = await page.evaluate(() => {
        return [...document.querySelectorAll('[role="menuitem"], [role="option"], .mat-menu-item, .mat-mdc-menu-item')]
          .map(el => el.textContent.trim());
      });
      log('📋', `메뉴: ${JSON.stringify(menuItems)}`);

      const deleted = await page.evaluate(() => {
        const items = [...document.querySelectorAll('[role="menuitem"], [role="option"], .mat-menu-item, .mat-mdc-menu-item, *')];
        const del = items.find(el => el.children.length === 0 && /^삭제$/.test(el.textContent.trim()));
        if (del) { del.click(); return true; }
        return false;
      });

      if (deleted) {
        await wait(1000);
        await snap(page, '03_confirm');
        await page.getByRole('button', { name: /확인|ok/i }).click().catch(() => {});
        await wait(2500);
        log('✅', '삭제 완료');
        await snap(page, '04_deleted');
      } else {
        await page.keyboard.press('Escape');
        log('ℹ️', '삭제 메뉴 없음');
      }
    }

    await wait(1000);

    // ── 입력 필드에 sitemap.xml 입력 ─────────────────────────────────
    log('✏️', '사이트맵 URL 입력');
    const input = page.locator('[aria-label="사이트맵 URL 입력"]');
    await input.waitFor({ state: 'visible', timeout: 10000 });
    const inputHandle = await input.elementHandle();
    await page.evaluate(el => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'sitemap.xml');
      ['input', 'change', 'keyup', 'keydown'].forEach(ev =>
        el.dispatchEvent(new Event(ev, { bubbles: true }))
      );
    }, inputHandle);
    await wait(400);

    const val = await input.inputValue();
    log('✏️', `입력 값: "${val}"`);
    await snap(page, '05_input');

    // ── "제출" 클릭 — 여러 방법 순차 시도 ───────────────────────────
    // 방법 1: Playwright getByText (shadow DOM 포함)
    let clicked = false;
    try {
      await page.getByText('제출', { exact: true }).click({ timeout: 3000 });
      clicked = true; log('🚀', 'getByText("제출") 클릭 성공');
    } catch {}

    // 방법 2: getByRole
    if (!clicked) {
      try {
        await page.getByRole('button', { name: '제출' }).click({ timeout: 3000 });
        clicked = true; log('🚀', 'getByRole 클릭 성공');
      } catch {}
    }

    // 방법 3: "제출" 텍스트 포함 요소의 부모 클릭
    if (!clicked) {
      const submitClicked = await page.evaluate(() => {
        const all = [...document.querySelectorAll('*')];
        // "제출" 텍스트 리프 노드의 부모 찾아 클릭
        const leaf = all.find(el => el.children.length === 0 && el.textContent.trim() === '제출');
        if (!leaf) return false;
        // 클릭 가능한 조상 찾기 (최대 5단계)
        let target = leaf;
        for (let i = 0; i < 5; i++) {
          if (!target.parentElement) break;
          target = target.parentElement;
          const tag = target.tagName.toLowerCase();
          if (tag === 'button' || tag === 'a' || target.getAttribute('role') === 'button') {
            target.click();
            return target.tagName;
          }
        }
        // 조상 못 찾으면 leaf 자체 클릭
        leaf.click();
        return leaf.tagName;
      });
      if (submitClicked) { clicked = true; log('🚀', `부모 요소 클릭: ${submitClicked}`); }
    }

    // 방법 4: 좌표 클릭 (스크린샷 기준 제출 버튼 위치)
    if (!clicked) {
      if (submitElemInfo.length > 0) {
        const r = submitElemInfo[0].rect;
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        log('🚀', `좌표 클릭: (${x}, ${y})`);
        await page.mouse.click(x, y);
        clicked = true;
      } else {
        // 최후 수단: 스크린샷 기준 하드코딩 좌표
        await page.mouse.click(1186, 239);
        log('🚀', '하드코딩 좌표 클릭 (1186, 239)');
        clicked = true;
      }
    }

    await wait(5000);
    await snap(page, '06_result');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await wait(3000);
    await snap(page, '07_final');

    // 결과 판단
    const finalUrl = page.url();
    const body = await page.locator('body').textContent();
    const rowCount = (body.match(/sitemap\.xml/g) || []).length;
    const errorGone = !body.includes('가져올 수 없음') || rowCount >= 2;

    log('📊', `URL: ${finalUrl}`);
    log('📊', `sitemap.xml 언급: ${rowCount}회`);

    const status = errorGone
      ? '✅ 사이트맵 재제출 완료'
      : '⚠️ 재제출 — Google 재크롤링 후 상태 갱신';
    log('🏁', status);
    await sendTelegram(`${status}\n${SITEMAP}\ndata/gsc_07_final.png`);

  } catch (err) {
    log('❌', err.message);
    await snap(page, 'error').catch(() => {});
    await sendTelegram(`❌ GSC 오류: ${err.message}`);
  } finally {
    await wait(2000);
    await context.close();
  }
}

main();
