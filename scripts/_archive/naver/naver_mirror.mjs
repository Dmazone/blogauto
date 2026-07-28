/**
 * naver_mirror.mjs — 네이버 블로그 자동 미러링 (Playwright)
 *
 * 실행:
 *   node scripts/naver_mirror.mjs          # 최근 1일치
 *   node scripts/naver_mirror.mjs --days 3 # 최근 3일치
 *   node scripts/naver_mirror.mjs --slug some-slug  # 특정 포스트 1개
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const NAVER_ID   = process.env.NAVER_ID || 'myubel';
const BASE_URL   = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');
const DATA_DIR   = path.join(ROOT, 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'naver-profile');
const MIRROR_LOG  = path.join(DATA_DIR, 'naver_mirrored.json');
const COOKIE_FILE = path.join(DATA_DIR, 'naver-cookies.json');
const POSTS_DIR   = path.join(ROOT, 'content', 'posts');

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

// ── Markdown → HTML (네이버 블로그용) ────────────────────────────────────
function mdToHtml(md, slug, sectionDir) {
  const absBase = BASE_URL ? `${BASE_URL}/posts/${sectionDir}/${slug}` : '';

  // 커버(thumb) 이미지는 본문에 이미 삽입되어 있지 않으므로 첫 이미지를 상단에 추가
  let html = md
    // 이미지 — 절대 URL
    .replace(/!\[([^\]]*)\]\(([^)]+\.webp|[^)]+\.jpg|[^)]+\.png|[^)]+\.gif)\)/g, (_, alt, src) => {
      const abs = src.startsWith('http') ? src : (absBase ? `${absBase}/${src}` : src);
      if (src.includes('-thumb.')) return '';  // 썸네일은 제외
      return `<p><img src="${abs}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:12px auto;border-radius:6px;"></p>`;
    })
    // 일반 링크
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const abs = href.startsWith('http') ? href : (BASE_URL ? `${BASE_URL}${href}` : href);
      return `<a href="${abs}" target="_blank" rel="noopener">${text}</a>`;
    })
    // 제목
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:1.3em;font-weight:bold;margin:20px 0 8px;border-bottom:2px solid #eee;padding-bottom:6px;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1em;font-weight:bold;margin:16px 0 6px;color:#333;">$1</h3>')
    // 강조
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 인용
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #4CAF50;padding:8px 12px;margin:12px 0;background:#f9f9f9;color:#555;border-radius:0 4px 4px 0;">$1</blockquote>')
    // 목록
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    .replace(/\\\~/g, '~')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, m => `<ul style="padding-left:20px;margin:8px 0;">${m}</ul>`)
    // 단락
    .replace(/\n\n+/g, '</p><p style="margin:10px 0;line-height:1.8;">')
    .replace(/\n/g, '<br>');

  // 원문 링크 — 마지막 1회만
  const footer = absBase
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #eee;"><p style="color:#888;font-size:0.85em;">📌 원문: <a href="${absBase}/" target="_blank" rel="noopener">${absBase}/</a></p>`
    : '';

  return `<p style="margin:10px 0;line-height:1.8;">${html}</p>${footer}`;
}

// HTML → 순수 텍스트 (폴백용)
function htmlToPlainText(html) {
  return html
    .replace(/<h[1-6]>(.+?)<\/h[1-6]>/gi, '\n\n$1\n')
    .replace(/<li>(.+?)<\/li>/gi, '\n• $1')
    .replace(/<blockquote[^>]*>(.+?)<\/blockquote>/gi, '\n「$1」\n')
    .replace(/<br>/gi, '\n')
    .replace(/<p>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

      // BOM 제거 후 파싱 (Windows 저장 파일에 ﻿ 포함되는 경우 대응)
      const raw = fs.readFileSync(indexPath, 'utf-8').replace(/^﻿/, '');
      const titleM = raw.match(/^title:\s*"?([^"\n]+)"?/m);
      const tagsM  = raw.match(/^tags:\s*\[([^\]]+)\]/m);
      // front matter 추출: 두 번째 --- 이후 내용만 body로
      const fmEnd = raw.indexOf('\n---', 3);
      const body  = fmEnd >= 0 ? raw.slice(fmEnd + 4).trim() : raw.trim();

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

// ── 로그인 ────────────────────────────────────────────────────────────────
async function ensureLogin(page, context) {
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      if (saved.length > 0) {
        await context.addCookies(saved);
        console.log(`  🍪 저장된 쿠키 복원 (${saved.length}개)`);
      }
    } catch {}
  }

  await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${NAVER_ID}`, {
    waitUntil: 'domcontentloaded', timeout: 25000,
  });
  await page.waitForTimeout(3000);

  if (!page.url().includes('nidlogin') && !page.url().includes('/login')) {
    console.log('  ✅ 세션 유효');
    return;
  }

  console.log('\n  ⚠️  로그인 필요 — 열린 브라우저에서 네이버 로그인 후 대기합니다. (최대 5분)\n');
  await page.waitForURL(
    (url) => !url.href.includes('nidlogin') && !url.href.includes('/login'),
    { timeout: 300000 }
  );
  await page.waitForTimeout(2000);
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`  ✅ 로그인 완료 — 쿠키 저장 (${cookies.length}개)`);
}

// ── 포스트 발행 ────────────────────────────────────────────────────────────
async function publishPost(page, context, post) {
  const writeUrl = `https://blog.naver.com/PostWriteForm.naver?blogId=${NAVER_ID}`;
  await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  if (page.url().includes('nidlogin')) throw new Error('세션 만료');

  // SE3 로드 대기
  await page.waitForSelector('.se-title-text', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // 임시저장 팝업 닫기 (있으면)
  const cancelBtn = await page.$('.se-popup-button-cancel');
  if (cancelBtn) {
    await cancelBtn.click();
    await page.waitForTimeout(800);
    console.log('    → 임시저장 팝업 닫음');
  }

  // 본문 영역 좌표 파악 (se-title-text 아래 영역)
  const coords = await page.evaluate(() => {
    const titleEl = document.querySelector('.se-title-text');
    const titleR = titleEl?.getBoundingClientRect();
    const bodySection = document.querySelector('.se-main-container .se-section:not(.se-section-documentTitle) .se-text-paragraph, .se-main-container .se-section:not(.se-section-documentTitle)');
    const bodyR = bodySection?.getBoundingClientRect();
    return {
      titleX: titleR ? Math.round(titleR.x + titleR.width / 3) : 315,
      titleY: titleR ? Math.round(titleR.y + titleR.height / 2) : 248,
      bodyX: bodyR ? Math.round(bodyR.x + bodyR.width / 2) : 450,
      bodyY: bodyR ? Math.round(bodyR.y + Math.min(bodyR.height / 2, 50)) : 380,
    };
  });
  console.log(`    → 좌표: 제목(${coords.titleX},${coords.titleY}) 본문(${coords.bodyX},${coords.bodyY})`);

  // 기존 드래프트 내용 지우기 (본문 영역 클릭 → Ctrl+A → Backspace)
  await page.mouse.click(coords.bodyX, coords.bodyY);
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // ── 제목 입력 ──
  await page.mouse.click(coords.titleX, coords.titleY);
  await page.waitForTimeout(400);
  await page.keyboard.type(post.title);
  await page.waitForTimeout(300);

  const titleState = await page.evaluate(() => {
    const el = document.querySelector('.se-title-text');
    return { isEmpty: el?.classList.contains('se-is-empty'), text: el?.innerText?.slice(0, 50) };
  });
  console.log(`    → 제목 입력: "${titleState.text}" (isEmpty=${titleState.isEmpty})`);
  if (titleState.isEmpty) throw new Error('제목 입력 실패 — SE3 내부 모델 미반영');

  // ── 본문 입력 (클립보드 HTML 붙여넣기) ──
  const html = mdToHtml(post.body, post.slug, post.sectionDir);

  // 클립보드에 HTML 설정
  const clipOk = await page.evaluate(async (htmlContent) => {
    try {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([
        htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      ], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
      ]);
      return true;
    } catch (e) { return false; }
  }, html);

  // 본문 영역 클릭 후 붙여넣기
  await page.mouse.click(coords.bodyX, coords.bodyY + 40);
  await page.waitForTimeout(500);

  if (clipOk) {
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(3000);  // SE3 파싱 대기
    console.log('    → 클립보드 HTML 붙여넣기');
  } else {
    console.log('    → 클립보드 실패, 텍스트 폴백');
    const plainText = htmlToPlainText(html);
    await page.keyboard.type(plainText);
    await page.waitForTimeout(500);
  }

  // SE3 내용 확인 (innerText 기준)
  let bodyLen = await page.evaluate(() => {
    const container = document.querySelector('.se-main-container');
    const titleText = document.querySelector('.se-title-text')?.innerText?.trim() || '';
    const total = container?.innerText?.trim() || '';
    return Math.max(0, total.length - titleText.length);
  });
  console.log(`    → 본문 길이: ${bodyLen}자`);

  // bodyLen=0이어도 SE3 내부 모델에 클립보드 내용이 반영됐을 수 있음 → 폴백 없이 진행
  // (클립보드 붙여넣기 후 innerText 체크가 SE3 모델을 즉시 반영하지 않는 경우 발생)

  // ── 발행 패널 열기 ──
  await page.mouse.click(640, 22); // 헤더 빈 영역
  await page.waitForTimeout(500);

  const publishBtn = await page.waitForSelector('[class*="publish_btn"]', { state: 'visible', timeout: 10000 });
  await publishBtn.click();
  console.log('    → 발행 패널 열기');
  await page.waitForTimeout(2500);

  // ── 발행 확인 ──
  const confirmBtn = await page.waitForSelector('[class*="confirm_btn"]', { state: 'visible', timeout: 8000 });
  await confirmBtn.click();
  console.log('    → 발행 확인 클릭');

  // PostView URL로 이동 대기 (최대 15초)
  let finalUrl = page.url();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    finalUrl = page.url();
    if (!finalUrl.includes('PostWriteForm')) break;
  }

  if (finalUrl.includes('PostWriteForm')) {
    throw new Error('발행 후 페이지 이동 없음 — 제목/본문 확인 필요');
  }

  console.log(`    → ✅ 발행 완료: ${finalUrl}`);
  return finalUrl;
}

// ── 메인 ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const daysIdx    = args.indexOf('--days');
const slugIdx    = args.indexOf('--slug');
const daysBack   = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 1 : 1;
const targetSlug = slugIdx >= 0 ? args[slugIdx + 1] : null;

const mirrorLog = loadLog();
const posts     = scanPosts({ daysBack, slug: targetSlug });

console.log(`\n🗞️  네이버 블로그 미러링 — ${targetSlug ? targetSlug : `최근 ${daysBack}일`} / 대상 ${posts.length}개\n`);

if (posts.length === 0) {
  console.log('포스팅할 글 없음. 종료.');
  process.exit(0);
}

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  args: ['--disable-blink-features=AutomationControlled'],
});

// 클립보드 권한 허용
await context.grantPermissions(['clipboard-read', 'clipboard-write']);

const page = await context.newPage();
let done = 0, skipped = 0, failed = 0;

try {
  await ensureLogin(page, context);

  for (const post of posts) {
    if (mirrorLog[post.slug]) {
      console.log(`  ⏭️  스킵 (이미 미러링): ${post.title}`);
      skipped++;
      continue;
    }

    console.log(`\n  🔄 발행 중: ${post.title}`);
    try {
      const publishedUrl = await publishPost(page, context, post);
      mirrorLog[post.slug] = { url: publishedUrl, mirrored: new Date().toISOString() };
      saveLog(mirrorLog);
      done++;
      await page.waitForTimeout(5000); // 연속 발행 방지
    } catch (err) {
      console.error(`  ❌ 실패: ${post.title} — ${err.message}`);
      failed++;
    }
  }
} finally {
  await context.close();
}

console.log(`\n✅ 완료 — 성공 ${done}개 / 스킵 ${skipped}개 / 실패 ${failed}개\n`);
