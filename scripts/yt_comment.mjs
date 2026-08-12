/**
 * yt_comment.mjs — YouTube 영상에 쿠팡파트너스 링크 댓글 달기
 * Usage: node scripts/yt_comment.mjs <videoId> <slug>
 *
 * trending-picks 포스팅의 쿠팡 링크를 파싱해 첫 번째 댓글로 게시.
 * 업로드 직후 daily_runner.js 에서 자동 호출됨.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const SESSION   = path.join(os.homedir(), '.yt-ekaledma-session');
const wait      = ms => new Promise(r => setTimeout(r, ms));

// ── 쿠팡 링크 + 상품명 파싱 ──────────────────────────────────────

function parseProducts(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );

  // 쿠팡 링크 추출 (trackingCode 포함 여부 확인)
  const urls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''))
    .filter(u => u.includes('trackingCode=AF8691300'));

  if (!urls.length) {
    console.warn('⚠️ trackingCode=AF8691300 링크 없음 — 일반 쿠팡 링크 포함 여부 확인 필요');
  }

  // 상품명: 1) 마크다운 링크 텍스트 [상품명](url) 형식, 2) 표 **bold** 형식
  const linkNames = [...md.matchAll(/\[([^\]]+?)\s*쿠팡에서\s*보기\]/g)].map(m => m[1].trim());
  const tableNames = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)].map(m => m[1].trim());

  return urls.slice(0, 3).map((url, i) => {
    // 이름 우선순위: 링크 텍스트 → 표 이름 → URL q 파라미터에서 추출
    let name = linkNames[i] || tableNames[i] || '';
    if (!name) {
      try {
        name = decodeURIComponent(new URL(url).searchParams.get('q') || '').replace(/\+/g, ' ');
      } catch {}
    }
    return { name, url };
  });
}

function buildComment(products, slug) {
  const RANKS = ['🥇', '🥈', '🥉'];
  const blogUrl = `https://dmazone.github.io/blogauto/posts/trending-picks/${slug}/`;
  const lines = ['🛒 쿠팡 구매 링크 👇', ''];
  products.forEach((p, i) => {
    if (!p.url) return;
    // URL-인코딩된 한국어 쿼리를 읽기 좋게 디코딩
    let displayUrl = p.url;
    try {
      const u = new URL(p.url);
      const q = decodeURIComponent(u.searchParams.get('q') || '').replace(/\+/g, ' ');
      if (q) { u.searchParams.set('q', q); displayUrl = u.toString(); }
    } catch {}
    lines.push(`${RANKS[i]} ${p.name}`);
    lines.push(displayUrl);
    if (i < products.length - 1) lines.push('');
  });
  lines.push('');
  lines.push(`📌 상세 비교·리뷰 전체 보기`);
  lines.push(blogUrl);
  lines.push('');
  lines.push('※ 이 영상은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.');
  return lines.join('\n');
}

// ── Playwright 댓글 게시 ──────────────────────────────────────────

async function postComment(videoId, commentText) {
  const ctx  = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // Shorts URL로 접속 (댓글 섹션 접근 용이)
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('💬 댓글 달기 접속:', url);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);

  // 댓글 입력창 클릭 (스크롤 후)
  await p.evaluate(() => window.scrollBy(0, 600));
  await wait(1500);

  let ok = false;
  try {
    // YouTube 댓글 입력창 placeholder 클릭
    const placeholder = p.locator('#placeholder-area, ytd-comment-simplebox-renderer #placeholder-area').first();
    await placeholder.click({ timeout: 8000 });
    await wait(1000);

    // 실제 입력 영역에 타이핑
    const commentInput = p.locator('#contenteditable-root[contenteditable="true"]').first();
    await commentInput.fill(commentText);
    await wait(800);

    // "댓글" 게시 버튼 클릭
    const submitBtn = p.locator('ytd-button-renderer#submit-button button, #submit-button').first();
    await submitBtn.click({ timeout: 5000 });
    await wait(3000);

    ok = true;
    console.log('✅ 댓글 게시 완료');
  } catch (e) {
    console.log('⚠️ 댓글 게시 실패:', e.message);
  }

  await ctx.close();
  return ok;
}

// ── 메인 ─────────────────────────────────────────────────────────

async function main() {
  const videoId = process.argv[2];
  const slug    = process.argv[3];

  if (!videoId || videoId === 'unknown' || !slug) {
    console.error('Usage: node yt_comment.mjs <videoId> <slug>');
    process.exit(1);
  }

  console.log(`📹 Video: ${videoId}  |  📄 Post: ${slug}`);

  const products = parseProducts(slug);
  if (!products.length) {
    console.log('⚠️ 상품 파싱 실패 — 댓글 스킵');
    process.exit(0);
  }

  const comment = buildComment(products, slug);
  console.log('📝 댓글 내용:\n' + comment);

  await postComment(videoId, comment);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
