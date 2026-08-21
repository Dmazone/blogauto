/**
 * yt_update_channel.mjs — YouTube 채널 정보(About) 업데이트
 * 채널 설명과 링크에 블로그 URL 추가 → YouTube에서 블로그로 트래픽 유도
 * Usage: node scripts/yt_update_channel.mjs
 */
import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const SESSION      = path.join(os.homedir(), '.yt-ekaledma-session');
const CHANNEL_ID   = 'UCZA_nUdouXfwAF0vuSG74_w'; // @dmalog
const BLOG_URL     = 'https://dmazone.github.io/blogauto/';
const CHANNEL_DESC = `트렌드줌 공식 YouTube 채널 @dmalog입니다.

✅ 최신 트렌드 상품 TOP3 비교·추천 (매일 업데이트)
✅ 쿠팡 최저가 링크 첫 번째 댓글 확인!

📰 블로그에서 상세 리뷰 보기: ${BLOG_URL}

#트렌드 #상품추천 #쿠팡추천 #Shorts`;

const wait = ms => new Promise(r => setTimeout(r, ms));
const log  = (e, m) => console.log(`${e}  ${m}`);
const snap = async (p, name) => { await p.screenshot({ path: `data/3_screenshots/ch_${name}.png` }); log('📸', name); };

async function main() {
  log('🚀', 'YouTube 채널 정보 업데이트 시작');

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  try {
    // YouTube Studio 채널 맞춤설정 페이지
    const customizeUrl = `https://studio.youtube.com/channel/${CHANNEL_ID}/editing/details`;
    log('🌐', `접속: ${customizeUrl}`);
    await p.goto(customizeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(4000);
    await snap(p, '01_details');

    // ── 설명 입력란 업데이트 ──────────────────────────────────────────────────
    log('✏️', '채널 설명 입력...');
    let descOk = false;
    try {
      const descEl = p.locator('[aria-label*="설명"], [aria-label*="description"], textarea[placeholder*="채널"]').first();
      await descEl.waitFor({ state: 'visible', timeout: 8000 });
      await descEl.click();
      await p.keyboard.selectAll();
      await p.keyboard.type(CHANNEL_DESC, { delay: 15 });
      descOk = true;
      log('✅', '설명 입력 완료');
    } catch {}

    if (!descOk) {
      descOk = await p.evaluate((desc) => {
        const textareas = [...document.querySelectorAll('textarea, [contenteditable="true"]')];
        const el = textareas.find(t =>
          t.placeholder?.includes('설명') ||
          t.getAttribute('aria-label')?.includes('설명') ||
          t.getAttribute('aria-label')?.toLowerCase().includes('description')
        );
        if (!el) return false;
        el.focus();
        el.value = desc;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, CHANNEL_DESC);
      if (descOk) log('✅', 'JS로 설명 입력');
    }

    await wait(1000);
    await snap(p, '02_desc_filled');

    // ── 링크 섹션 — 블로그 URL 추가 ──────────────────────────────────────────
    log('🔗', '블로그 링크 추가...');
    try {
      // "링크 추가" 버튼 찾기
      const addLinkBtn = p.locator('button:has-text("링크 추가"), button:has-text("Add link"), [aria-label*="링크 추가"]').first();
      await addLinkBtn.click({ timeout: 5000 });
      await wait(1500);

      // URL 입력
      const urlInput = p.locator('input[type="url"], input[placeholder*="URL"], input[aria-label*="URL"]').last();
      await urlInput.fill(BLOG_URL, { timeout: 5000 });
      await wait(500);

      // 제목 입력
      const titleInput = p.locator('input[placeholder*="제목"], input[placeholder*="title"], input[aria-label*="제목"]').last();
      await titleInput.fill('트렌드줌 블로그', { timeout: 5000 }).catch(() => {});
      await wait(500);

      log('✅', '링크 추가 완료');
    } catch (e) {
      log('⚠️', `링크 추가 실패 (설명 업데이트는 성공): ${e.message}`);
    }

    await snap(p, '03_links');

    // ── 저장 ─────────────────────────────────────────────────────────────────
    log('💾', '저장 중...');
    let saved = false;
    try {
      await p.getByRole('button', { name: /게시|저장|Publish|Save/i }).first().click({ timeout: 5000 });
      saved = true; log('✅', '저장 버튼 클릭');
    } catch {}
    if (!saved) {
      saved = await p.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const btn = btns.find(b => /^(게시|저장|Publish|Save)$/.test(b.textContent?.trim() || ''));
        if (btn) { btn.click(); return true; }
        return false;
      });
    }

    await wait(4000);
    await snap(p, '04_saved');

    const status = saved ? '✅ 채널 정보 업데이트 완료' : '⚠️ 저장 버튼 미발견 — 수동 확인 필요';
    log('🏁', status);
    await sendTelegram(`${status}\n블로그 링크: ${BLOG_URL}`);

  } catch (err) {
    log('❌', err.message);
    await snap(p, 'error').catch(() => {});
    await sendTelegram(`❌ 채널 정보 업데이트 오류: ${err.message}`);
  } finally {
    await wait(2000);
    await ctx.close();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
