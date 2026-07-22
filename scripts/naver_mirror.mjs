/**
 * naver_mirror.mjs — 네이버 블로그 자동 미러링 (Playwright)
 *
 * 실행:
 *   node scripts/naver_mirror.mjs          # 최근 1일치
 *   node scripts/naver_mirror.mjs --days 3 # 최근 3일치
 *   node scripts/naver_mirror.mjs --slug some-slug  # 특정 포스트 1개
 *
 * 필요 환경변수 (.env):
 *   NAVER_ID   네이버 아이디
 *   NAVER_PW   네이버 비밀번호
 *   BLOG_BASE_URL  원본 블로그 URL (원문 링크용)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const NAVER_ID   = process.env.NAVER_ID;
const NAVER_PW   = process.env.NAVER_PW;
const BASE_URL   = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');
const DATA_DIR   = path.join(ROOT, 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'naver-profile');
const MIRROR_LOG  = path.join(DATA_DIR, 'naver_mirrored.json');
const POSTS_DIR   = path.join(ROOT, 'content', 'posts');

if (!NAVER_ID || !NAVER_PW) {
  console.error('❌ .env에 NAVER_ID, NAVER_PW를 설정하세요.');
  process.exit(1);
}

const COOKIE_FILE = path.join(DATA_DIR, 'naver-cookies.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// ── 미러 로그 ─────────────────────────────────────────────────────────────
function loadLog() {
  try { return JSON.parse(fs.readFileSync(MIRROR_LOG, 'utf-8')); }
  catch { return {}; }
}
function saveLog(log) {
  fs.writeFileSync(MIRROR_LOG, JSON.stringify(log, null, 2), 'utf-8');
}

// ── Markdown → 네이버 붙여넣기용 HTML ───────────────────────────────────
function mdToHtml(md, slug, sectionDir) {
  const absBase = `${BASE_URL}/posts/${sectionDir}/${slug}`;

  let html = md
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const abs = src.startsWith('http') ? src : `${absBase}/${src}`;
      return `<img src="${abs}" alt="${alt}" style="max-width:100%;display:block;margin:16px auto;">`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const abs = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      return `<a href="${abs}" target="_blank" rel="noopener">${text}</a>`;
    })
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(#\S+ ?)+$/gm, (m) => `<p style="color:#888;font-size:0.85em;">${m}</p>`)
    .replace(/(<li>.*<\/li>\n?)+/gs, (b) => `<ul>${b}</ul>`)
    .replace(/\\\~/g, '~')         // 이스케이프 물결 복원
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // 원문 링크 푸터
  html += `<hr><p style="color:#888;font-size:0.9em;">📌 원문: <a href="${absBase}/">${absBase}/</a></p>`;

  return `<p>${html}</p>`;
}

// ── 포스트 스캔 ──────────────────────────────────────────────────────────
function scanPosts({ daysBack = 1, slug: targetSlug = null } = {}) {
  const posts = [];
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  for (const sectionDir of fs.readdirSync(POSTS_DIR)) {
    const sectionPath = path.join(POSTS_DIR, sectionDir);
    if (!fs.statSync(sectionPath).isDirectory()) continue;

    for (const postDir of fs.readdirSync(sectionPath)) {
      if (targetSlug && postDir !== targetSlug) continue;
      const indexPath = path.join(sectionPath, postDir, 'index.md');
      if (!fs.existsSync(indexPath)) continue;

      const stat = fs.statSync(indexPath);
      if (!targetSlug && stat.mtime < cutoff) continue;

      const raw = fs.readFileSync(indexPath, 'utf-8');
      const titleM = raw.match(/^title:\s*"?([^"\n]+)"?/m);
      const tagsM  = raw.match(/^tags:\s*\[([^\]]+)\]/m);
      const body   = raw.replace(/^---[\s\S]+?---\n*/m, '').trim();

      // japan-trends / us-trends 은 한국어가 아니므로 건너뜀
      if (['japan-trends', 'us-trends'].includes(sectionDir)) continue;

      posts.push({
        slug: postDir,
        sectionDir,
        title: (titleM?.[1] ?? postDir).replace(/\\"/g, '"').trim(),
        tags: tagsM ? tagsM[1].replace(/"/g, '').split(',').map(t => t.trim()).filter(Boolean) : [],
        body,
      });
    }
  }
  return posts;
}

// ── Naver 로그인 (수동 로그인 대기 방식) ─────────────────────────────────
async function ensureLogin(page, context) {
  // 저장된 쿠키 복원
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      if (saved.length > 0) await context.addCookies(saved);
      console.log(`  🍪 저장된 쿠키 복원 (${saved.length}개)`);
    } catch {}
  }

  // 글쓰기 폼 직접 접근 시도 → 로그인 여부 판단
  await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${NAVER_ID}`, {
    waitUntil: 'domcontentloaded', timeout: 20000,
  });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (!currentUrl.includes('nidlogin') && !currentUrl.includes('/login')) {
    console.log('  ✅ 세션 유효 — 쓰기 권한 확인');
    return;
  }

  // 로그인 필요 — 수동 로그인 대기
  console.log('\n  ⚠️  로그인이 필요합니다.');
  console.log('  → 열린 브라우저 창에서 네이버 로그인을 완료해주세요.');
  console.log('  → 로그인 완료 후 자동으로 계속 진행됩니다. (최대 5분 대기)\n');

  await page.waitForURL(
    (url) => !url.href.includes('nidlogin') && !url.href.includes('/login'),
    { timeout: 300000 }
  );
  await page.waitForTimeout(2000);

  // 로그인 성공 → 쿠키 저장
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`  ✅ 로그인 완료 — 쿠키 저장됨 (${cookies.length}개)`);
}

// ── SE3 HTML 클립보드 붙여넣기 방식으로 본문 삽입 ──────────────────────
async function fillEditor(page, htmlContent) {
  await page.waitForSelector('[contenteditable="true"]', { timeout: 10000 });

  // JS로 직접 focus + HTML 주입 (뷰포트 밖 요소도 처리 가능)
  const ok = await page.evaluate((html) => {
    // 제목용 contenteditable은 건너뛰고 본문 영역 선택
    const els = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    // 본문 영역 = title이 아닌 것 (se-title-text 부모 안이 아닌 것)
    const bodyEl = els.find(el => !el.closest('.se-title-text, .se-section-documentTitle')) || els[els.length - 1];
    if (!bodyEl) return false;
    bodyEl.scrollIntoView({ behavior: 'instant', block: 'center' });
    bodyEl.focus();
    // clipboard paste 시도
    try {
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      bodyEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {
      // fallback: innerHTML 직접
      bodyEl.innerHTML = html;
      bodyEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return true;
  }, htmlContent);

  if (ok) { console.log('    → 본문 주입 완료'); }
  else { throw new Error('본문 에디터 영역을 찾을 수 없음'); }
  await page.waitForTimeout(1000);
}

// ── 컨텍스트(page or frame) 에서 셀렉터 찾기 (여러 시도) ───────────────
async function findIn(ctx, selectors, timeout = 8000) {
  for (const sel of selectors) {
    try {
      const el = await ctx.waitForSelector(sel, { timeout });
      if (el) return el;
    } catch {}
  }
  return null;
}

// ── 포스트 1개 발행 ───────────────────────────────────────────────────
async function publishPost(page, post) {
  // ensureLogin 에서 이미 글쓰기 폼에 도달한 경우 재활용, 그렇지 않으면 재이동
  if (!page.url().includes('PostWriteForm')) {
    const writeUrl = `https://blog.naver.com/PostWriteForm.naver?blogId=${NAVER_ID}`;
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  }

  // 로그인 리다이렉트 확인
  if (page.url().includes('nidlogin')) throw new Error('세션 만료 — 다시 로그인 필요');

  // SE3 에디터 로드 대기
  await page.waitForSelector('.se-title-text, .se-section-documentTitle', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // SE3 팝업 닫기 (임시저장 복구 알림 등)
  try {
    const popup = await page.$('.se-popup.se-popup-alert, .se-popup-alert-confirm');
    if (popup) {
      // 취소(새 글 작성) 버튼 클릭
      const cancelBtn = await page.$('.se-popup-alert-confirm .se-btn:not(.se-btn-primary), .se-popup button:last-child');
      if (cancelBtn) await cancelBtn.click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      console.log('    → 팝업 닫음');
    }
  } catch {}

  // 제목 입력 (SE3: contenteditable div)
  const titleEl = await findIn(page, [
    '.se-title-text', '.se-section-documentTitle .se-module',
    'div[class*="title"] [contenteditable]', 'p.se-placeholder',
  ]);
  if (!titleEl) throw new Error('제목 영역을 찾을 수 없음 (SE3)');
  await titleEl.click();
  await page.waitForTimeout(300);
  await page.keyboard.type(post.title, { delay: 20 });
  console.log(`    → 제목 입력: ${post.title}`);

  // 본문 삽입
  const html = mdToHtml(post.body, post.slug, post.sectionDir);
  await fillEditor(page, html);
  await page.waitForTimeout(1500);

  // 태그 입력
  try {
    const tagInput = await findIn(page, [
      'input[name="tag"]', '.se-tag-input input', '[placeholder*="태그"]',
      '.tag_input input',
    ], 3000);
    if (tagInput && post.tags.length > 0) {
      for (const tag of post.tags.slice(0, 10)) {
        await tagInput.click();
        await tagInput.type(tag, { delay: 20 });
        await tagInput.press('Enter');
        await page.waitForTimeout(300);
      }
    }
  } catch {}

  // SE3 발행 버튼
  const publishBtn = await findIn(page, [
    '.se-publish-btn', 'button:has-text("발행")', '.publish_area button',
    'button[class*="publish"]', '.btn_submit:has-text("발행")',
  ]);
  if (!publishBtn) throw new Error('발행 버튼을 찾을 수 없음');
  await publishBtn.click();
  await page.waitForTimeout(2000);

  // 발행 확인 팝업 (공개설정 등)
  try {
    const confirmBtn = await page.waitForSelector(
      'button:has-text("발행"), button:has-text("확인"), .btn_ok, .publish_btn, button.se-btn-primary',
      { timeout: 5000 }
    );
    await confirmBtn.click();
    await page.waitForTimeout(3000);
  } catch {}

  const finalUrl = page.url();
  console.log(`    → 발행 완료: ${finalUrl}`);
  return finalUrl;
}

// ── 메인 ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const daysIdx  = args.indexOf('--days');
const slugIdx  = args.indexOf('--slug');
const daysBack = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 1 : 1;
const targetSlug = slugIdx >= 0 ? args[slugIdx + 1] : null;

const mirrorLog = loadLog();
const posts = scanPosts({ daysBack, slug: targetSlug });

console.log(`\n🗞️  네이버 블로그 미러링 — ${targetSlug ? targetSlug : `최근 ${daysBack}일`} / ${posts.length}개 대상\n`);

if (posts.length === 0) {
  console.log('포스팅할 글 없음. 종료.');
  process.exit(0);
}

const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,          // Naver 봇 감지 방지
  viewport: { width: 1280, height: 800 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = await browser.newPage();

let done = 0, skipped = 0, failed = 0;

try {
  await ensureLogin(page, browser);

  for (const post of posts) {
    if (mirrorLog[post.slug]) {
      console.log(`  ⏭️  스킵 (이미 미러링): ${post.title}`);
      skipped++;
      continue;
    }

    console.log(`  🔄 발행 중: ${post.title}`);
    try {
      const publishedUrl = await publishPost(page, post);
      mirrorLog[post.slug] = { url: publishedUrl, mirrored: new Date().toISOString() };
      saveLog(mirrorLog);
      console.log(`  ✅ 완료: ${post.slug}`);
      done++;
      await page.waitForTimeout(5000); // 연속 발행 방지
    } catch (err) {
      console.error(`  ❌ 실패: ${post.title} — ${err.message}`);
      failed++;
    }
  }
} finally {
  await browser.close();
}

console.log(`\n✅ 완료 — 성공 ${done}개 / 스킵 ${skipped}개 / 실패 ${failed}개\n`);
