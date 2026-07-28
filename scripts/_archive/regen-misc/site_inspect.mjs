/**
 * site_inspect.mjs — 블로그 시각 점검 (조회수 카운터 포함)
 */

import { chromium } from 'playwright';

const BASE        = 'https://dmazone.github.io/blogauto';
const SAMPLE_POST = `${BASE}/posts/world-travel/2026-summer-vacation-traffic-guide/`;

const wait = ms => new Promise(r => setTimeout(r, ms));
const log  = (e, m) => console.log(`${e}  ${m}`);
const snap = async (page, name) => { await page.screenshot({ path: `data/inspect_${name}.png` }); log('📸', name); };

async function main() {
  log('🔍', '블로그 시각 점검');
  const browser = await chromium.launch({ headless: false });

  // ── 1. PC 포스팅 — 조회수 카운터 대기 ───────────────────────────
  const pc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await pc.newPage();

  await pg.goto(SAMPLE_POST, { waitUntil: 'networkidle', timeout: 30000 });
  // Firebase fetch 완료 대기: #vc-num이 "-"가 아닌 값으로 바뀔 때까지
  try {
    await pg.waitForFunction(
      () => { const el = document.querySelector('.vc-num'); return el && el.textContent !== '-'; },
      { timeout: 8000 }
    );
  } catch {}
  await snap(pg, '01_post_viewcount');

  const vcVal = await pg.evaluate(() => {
    const el = document.querySelector('.vc-num');
    return el ? el.textContent : 'NOT FOUND';
  });
  log('👁', `조회수 값: "${vcVal}"`);
  await pc.close();

  // ── 2. PC 홈페이지 ───────────────────────────────────────────────
  const pc2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2  = await pc2.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(2000);
  await snap(p2, '02_home_pc');
  await pc2.close();

  // ── 3. 모바일 홈 ─────────────────────────────────────────────────
  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  });
  const mp = await mob.newPage();
  await mp.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(2000);
  await snap(mp, '03_home_mobile');
  await mob.close();

  await browser.close();
  log('🏁', '완료');
}

main();
