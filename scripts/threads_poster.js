/**
 * threads_poster.js — Playwright로 Threads 자동 홍보 + 스하리 활동
 *
 * 실행:
 *   node scripts/threads_poster.js               # 전체 (게시 + 스하리)
 *   node scripts/threads_poster.js --post-only   # 게시만
 *   node scripts/threads_poster.js --shari-only  # 스하리만
 *
 * 스하리 전략 (검색 기반):
 *   ① "스하리모집" 등 키워드로 검색
 *   ② 모집글 작성자 프로필 방문
 *   ③ 팔로우 + 좋아요 + 리포스트 실행
 *   ④ 댓글 "스하링 🔁🩷" 남기기 → 반하리 유도
 *   ⑤ 처리한 계정은 data/shari_log.json에 기록 (30일간 중복 방지)
 */

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync } from 'fs';
import { sendTelegram } from './telegram.js';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SESSION_DIR  = path.join(os.homedir(), '.threads-blog-session');
const THREADS_HOME = 'https://www.threads.com';
const LOG_DIR      = path.join(__dirname, '..', 'logs');
const LOG_FILE     = path.join(LOG_DIR, `threads-${new Date().toISOString().slice(0, 10)}.log`);
const SHARI_LOG    = path.join(__dirname, '..', 'data', 'shari_log.json');
const DATA_DIR     = path.join(__dirname, '..', 'data');

mkdirSync(LOG_DIR,  { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const log = (emoji, msg) => {
  const line = `[${new Date().toISOString()}] ${emoji}  ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch {}
};

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 스하리 검색 키워드 (순서대로 순환)
const SHARI_KEYWORDS = [
  '스하리모집',
  '스하리1000명프로젝트',
  '뒷삭없는스하리',
  '스하리반하리',
  '스하리2000명프로젝트',
  '스하리3000명프로젝트',
];

// ────────────────────────────────────────────────────────────────────────────
// front matter에서 description + tags 기반 fallback 텍스트 생성
// ────────────────────────────────────────────────────────────────────────────
function buildFallbackText(post, blogContent) {
  const descMatch = blogContent.match(/description:\s*"([^"]+)"/);
  const tagsMatch = blogContent.match(/tags:\s*\[([^\]]+)\]/);
  const desc = descMatch?.[1]?.slice(0, 90) ?? post.title;
  const hashTags = tagsMatch
    ? tagsMatch[1].split(',').map(t => `#${t.trim().replace(/['"]/g, '').replace(/\s+/g, '')}`).slice(0, 3).join(' ')
    : '#트렌드줌 #최신이슈';
  return `${desc}\n\n${hashTags}\n\n👇 더 보기`;
}

// ────────────────────────────────────────────────────────────────────────────
// Claude Haiku로 Threads 홍보글 3버전 생성 (실패 시 front matter 기반 fallback)
// ────────────────────────────────────────────────────────────────────────────
async function generateThreadsText(post, blogContent) {
  log('✍️', `홍보글 생성: ${post.title}`);

  const fallback = buildFallbackText(post, blogContent);

  const clean = blogContent
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2500);

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content:
          `아래 블로그 포스팅을 바탕으로 Threads(스레드)용 홍보글 3버전을 만들어줘.\n\n` +
          `[조건]\n` +
          `- 각 버전 250자 이내\n` +
          `- 구어체, 캐주얼하고 자연스러운 한국어 (딱딱한 문어체 금지)\n` +
          `- 첫 문장: 강렬한 훅 (질문형 또는 충격적 사실 또는 공감 유도)\n` +
          `- 핵심 인사이트 1가지만 살짝 언급 (궁금증 유발, 전체 스포 금지)\n` +
          `- 마지막 줄: "👇 더 보기" (링크는 포함하지 않음, 별도 추가됨)\n` +
          `- 해시태그 3~4개 포함 (자연스럽게 중간 또는 끝에)\n\n` +
          `[포스팅 제목]: ${post.title}\n\n` +
          `[포스팅 내용 요약]:\n${clean}\n\n` +
          `유효한 JSON만 출력 (다른 텍스트 없이):\n` +
          `{"versions":["버전1","버전2","버전3"]}`,
      }],
    });

    const raw = msg.content[0]?.text ?? '';
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (Array.isArray(json.versions) && json.versions.length > 0) {
      return json.versions;
    }
  } catch (err) {
    log('⚠️', `홍보글 생성 실패 (fallback 사용): ${err.message}`);
  }

  return [fallback];
}

// ────────────────────────────────────────────────────────────────────────────
// 스하리 로그 (data/shari_log.json) — 30일 내 중복 방지
// ────────────────────────────────────────────────────────────────────────────
function loadShariLog() {
  if (!existsSync(SHARI_LOG)) return {};
  try {
    return JSON.parse(readFileSync(SHARI_LOG, 'utf8'));
  } catch {
    return {};
  }
}

function saveShariLog(shariLog) {
  // 30일 지난 항목 자동 정리
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [user, ts] of Object.entries(shariLog)) {
    if (new Date(ts).getTime() < cutoff) delete shariLog[user];
  }
  writeFileSync(SHARI_LOG, JSON.stringify(shariLog, null, 2), 'utf8');
}

// ────────────────────────────────────────────────────────────────────────────
// ThreadsPoster 클래스
// ────────────────────────────────────────────────────────────────────────────
class ThreadsPoster {
  constructor({ headless = false } = {}) {
    this.headless    = headless;
    this.context     = null;
    this.page        = null;
    this.totalShari  = 0;
  }

  // ── 초기화 ──────────────────────────────────────────────────────────────
  async init() {
    log('🌐', 'Threads 브라우저 시작...');

    // 세션 깨진 경우 한 번 초기화 후 재시도
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.context = await chromium.launchPersistentContext(SESSION_DIR, {
          headless:   this.headless,
          viewport:   { width: 1280, height: 900 },
          locale:     'ko-KR',
          timezoneId: 'Asia/Seoul',
          args:       ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        break;
      } catch (err) {
        log('⚠️', `브라우저 시작 실패 (시도 ${attempt}/2): ${err.message}`);
        if (attempt === 1) {
          log('🔄', '세션 디렉토리 초기화 후 재시도...');
          try { rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
          mkdirSync(SESSION_DIR, { recursive: true });
          await wait(2000);
        } else {
          throw new Error(`Playwright 시작 불가: ${err.message}`);
        }
      }
    }

    this.page = await this.context.newPage();
    await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);
    await this._ensureLoggedIn();
    log('✅', 'Threads 세션 준비 완료');
  }

  async _ensureLoggedIn() {
    await wait(4000);
    await this._checkLogin();
  }

  // 현재 페이지가 로그인 페이지인지 확인 — 맞으면 사용자 로그인 대기
  async _checkLogin() {
    const url = this.page.url();
    const isLoginPage = url.includes('/login') || url.includes('accounts.instagram') ||
                        url.includes('accounts.google') || url.includes('/signup') ||
                        url.includes('force_authentication');
    if (!isLoginPage) return; // 정상 상태

    log('🔐', '세션 만료 — 브라우저에서 Threads 로그인 후 Enter 대기 (최대 5분)');
    // Threads 홈으로 이동해서 로그인 유도
    try {
      await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {}

    const deadline = Date.now() + 300_000; // 5분
    while (Date.now() < deadline) {
      await wait(5000);
      const u = this.page.url();
      if (!u.includes('/login') && !u.includes('force_authentication') &&
          !u.includes('accounts.instagram') && !u.includes('/signup')) {
        log('✅', '로그인 확인됨 — 작업 재개');
        await wait(2000);
        return;
      }
    }
    throw new Error('Threads 로그인 타임아웃 (5분 초과)');
  }

  // goto() 래퍼 — 이동 후 로그인 페이지로 리다이렉트됐는지 자동 감지
  async _goto(url, opts = {}) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000, ...opts });
    await wait(1500);
    await this._checkLogin();
  }

  // ── ① 홍보글 게시 ───────────────────────────────────────────────────────
  async postThread(text, link) {
    const fullText = `${text}\n${link}`;
    log('📤', `게시 시작: ${text.slice(0, 50).replace(/\n/g, ' ')}...`);

    await this._goto(THREADS_HOME);
    await wait(2000);

    // 작성 영역 찾아 클릭
    const clicked = await this.page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('[contenteditable="true"]'),
        ...document.querySelectorAll('p[data-lexical-text="true"]'),
        ...[...document.querySelectorAll('div, span')].filter(el =>
          el.textContent?.includes('새로운 소식이 있나요')
        ),
      ];
      for (const el of candidates) { el.click(); return true; }
      return false;
    });

    if (!clicked) log('⚠️', '작성 영역 클릭 실패, JS 강제 시도');
    await wait(1000);

    try {
      await this.page.evaluate((t) => navigator.clipboard.writeText(t), fullText);
      await this.page.keyboard.press('Control+v');
    } catch {
      await this.page.keyboard.type(fullText, { delay: 30 });
    }
    await wait(1000);

    const posted = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('div[role="button"], button')];
      const postBtn = btns.find(b => b.textContent?.trim() === '게시');
      if (postBtn) { postBtn.click(); return true; }
      return false;
    });

    if (!posted) await this.page.keyboard.press('Control+Enter');

    await wait(4000);
    log('✅', '게시 완료');
    return true;
  }

  // ── ② 스하리 (검색 기반 — 모집글 찾아가기) ─────────────────────────────
  async doShari(targetCount = 30) {
    log('🔥', `스하리 시작 (목표: ${targetCount}개) — 검색 기반 모집글 탐색`);

    const shariLog    = loadShariLog();
    let successCount  = 0;

    for (const keyword of SHARI_KEYWORDS) {
      if (successCount >= targetCount) break;

      log('🔍', `"${keyword}" 검색 중...`);
      await this._goto(
        `https://www.threads.com/search/?q=${encodeURIComponent(keyword)}&serp_type=default`
      );
      await wait(2000);

      // 스크롤해서 결과 더 로드
      for (let i = 0; i < 4; i++) {
        await this.page.evaluate(() => window.scrollBy(0, 1200));
        await wait(rand(800, 1400));
      }

      // 검색 결과에서 포스트 링크 추출
      const postLinks = await this.page.evaluate(() => {
        const anchors = [...document.querySelectorAll('a[href*="/post/"]')];
        const urls = [...new Set(anchors.map(a => a.href))].filter(h =>
          h.includes('/post/') && h.includes('threads.com')
        );
        return urls;
      });

      log('📋', `"${keyword}" — 포스트 ${postLinks.length}개 발견`);

      for (const postUrl of postLinks) {
        if (successCount >= targetCount) break;

        // URL에서 username 추출: https://www.threads.com/@username/post/xxx
        const usernameMatch = postUrl.match(/@([^/]+)\/post\//);
        if (!usernameMatch) continue;
        const username = usernameMatch[1];

        // 30일 이내 이미 처리한 계정이면 스킵
        if (shariLog[username]) {
          log('⏭️', `이미 스하리 한 계정 스킵: @${username}`);
          continue;
        }

        log('👤', `스하리 진행: @${username} (${postUrl})`);

        // 해당 포스트로 이동
        await this._goto(postUrl);
        await wait(rand(1500, 2500));

        const ok = await this._shariPost(username);

        if (ok) {
          shariLog[username] = new Date().toISOString();
          saveShariLog(shariLog);
          successCount++;
          this.totalShari++;
          log('🎉', `스하리+댓글 완료: @${username} (${successCount}/${targetCount})`);
          await wait(rand(4000, 7000)); // 인간적인 속도 유지
        } else {
          log('⚠️', `스하리 부분 실패: @${username}`);
          await wait(rand(2000, 3500));
        }
      }
    }

    log('🎯', `스하리 완료: ${successCount}개`);
    return successCount;
  }

  // ── 포스트 1개 스하리 실행 (좋아요 + 리포스트 + 팔로우 + 댓글) ─────────
  async _shariPost(username) {
    try {
      // 1) 좋아요
      const liked = await this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        const likeBtn = btns.find(b => {
          const svg = b.querySelector('svg');
          return svg?.getAttribute('aria-label')?.includes('좋아요') &&
                 !svg?.getAttribute('aria-label')?.includes('좋아요 취소');
        });
        if (likeBtn) { likeBtn.click(); return true; }
        // 대체: aria-label 속성이 parent에 있는 경우
        const svgs = [...document.querySelectorAll('svg[aria-label*="좋아요"]')];
        const likeSvg = svgs.find(s => !s.getAttribute('aria-label')?.includes('취소'));
        if (likeSvg) {
          (likeSvg.closest('div[role="button"]') || likeSvg.parentElement)?.click();
          return true;
        }
        return false;
      });

      if (!liked) {
        log('⚠️', `좋아요 버튼 못 찾음: @${username}`);
      }
      await wait(rand(500, 1000));

      // 2) 리포스트
      const repostClicked = await this.page.evaluate(() => {
        const svgs = [...document.querySelectorAll('svg[aria-label*="리포스트"]')];
        const repostSvg = svgs.find(s => !s.getAttribute('aria-label')?.includes('취소'));
        const target = repostSvg?.closest('div[role="button"]') || repostSvg?.parentElement;
        if (target) { target.click(); return true; }
        return false;
      });

      if (repostClicked) {
        await wait(700);
        // 리포스트 확인 모달
        await this.page.evaluate(() => {
          const btns = [...document.querySelectorAll('div[role="button"], button')];
          const confirm = btns.find(b => b.textContent?.trim() === '리포스트');
          confirm?.click();
        });
        await wait(rand(600, 1000));
      } else {
        log('⚠️', `리포스트 버튼 못 찾음: @${username}`);
      }

      // 3) 팔로우 (아직 팔로우 안 한 경우만)
      const followed = await this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        const followBtn = btns.find(b => b.textContent?.trim() === '팔로우');
        if (followBtn) { followBtn.click(); return true; }
        return false;
      });
      if (followed) log('➕', `팔로우: @${username}`);
      await wait(rand(800, 1500));

      // 4) 댓글 "스하링" 남기기 (가장 중요 — 반하리 유도 신호)
      const commented = await this._leaveComment('스하링 🔁🩷');

      // 좋아요 또는 리포스트 중 하나라도 성공하면 카운트
      return liked || repostClicked;
    } catch (err) {
      log('⚠️', `_shariPost 오류 @${username}: ${err.message}`);
      return false;
    }
  }

  // ── 댓글 남기기 ("스하링") ───────────────────────────────────────────────
  async _leaveComment(commentText) {
    try {
      // 댓글 입력창 찾아 클릭 (Threads UI 여러 버전 대응)
      const clickedInput = await this.page.evaluate(() => {
        // 1) aria-label 기반 (en/ko 혼용)
        const ariaSelectors = [
          '[aria-label*="댓글"]', '[aria-label*="reply"]', '[aria-label*="Reply"]',
          '[aria-label*="답글"]', '[aria-label*="Add a comment"]',
          '[placeholder*="댓글"]', '[data-placeholder*="댓글"]', '[aria-placeholder*="댓글"]',
        ];
        for (const sel of ariaSelectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return true; }
        }

        // 2) 텍스트 기반 (placeholder-like 텍스트)
        const keywords = ['댓글 달기', '댓글 추가', '답글 달기', 'Add a comment', 'Reply...'];
        const all = [...document.querySelectorAll('p, div, span, [role="textbox"]')];
        const found = all.find(el => keywords.some(kw => el.textContent?.trim().startsWith(kw)));
        if (found) { found.click(); return true; }

        // 3) data-lexical-text 또는 contenteditable 중 댓글 영역인 것
        const edits = [...document.querySelectorAll('[contenteditable="true"]')];
        // 포스트 작성용(홈)이 아닌 댓글 영역: 보통 여러 개 중 마지막
        if (edits.length > 1) { edits[edits.length - 1].click(); return true; }

        return false;
      });

      // 클릭 실패 시 키보드 단축키 시도 (Threads에서 r = 답글)
      if (!clickedInput) {
        await this.page.keyboard.press('r');
        await wait(600);
      }

      if (!clickedInput) {
        log('⚠️', '댓글 입력창 못 찾음 — 댓글 생략');
        return false;
      }

      await wait(800);

      // 입력창이 활성화된 후 contenteditable 찾아 텍스트 입력
      const typed = await this.page.evaluate((text) => {
        const editables = [...document.querySelectorAll('[contenteditable="true"]')];
        // 가장 마지막에 나타난 contenteditable (댓글 입력창)
        const commentBox = editables[editables.length - 1];
        if (!commentBox) return false;
        commentBox.focus();
        document.execCommand('insertText', false, text);
        return true;
      }, commentText);

      if (!typed) {
        // 폴백: 클립보드 + Ctrl+V
        try {
          await this.page.evaluate((t) => navigator.clipboard.writeText(t), commentText);
          await this.page.keyboard.press('Control+v');
        } catch {
          await this.page.keyboard.type(commentText, { delay: 60 });
        }
      }

      await wait(600);

      // 댓글 게시 버튼
      const posted = await this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        // 댓글 영역에서 가장 마지막에 보이는 "게시" 버튼
        const postBtns = btns.filter(b => b.textContent?.trim() === '게시');
        if (postBtns.length > 0) {
          postBtns[postBtns.length - 1].click();
          return true;
        }
        return false;
      });

      if (!posted) {
        await this.page.keyboard.press('Control+Enter');
      }

      await wait(1500);
      log('💬', `댓글 남김: "${commentText}"`);
      return true;
    } catch (err) {
      log('⚠️', `댓글 실패: ${err.message}`);
      return false;
    }
  }

  async close() {
    try { await this.context?.close(); } catch {}
    log('🔒', 'Threads 세션 종료');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 메인 실행
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const args      = process.argv.slice(2);
  const postOnly  = args.includes('--post-only');
  const shariOnly = args.includes('--shari-only');

  // posts_log.json 읽기
  const logPath = path.join(__dirname, '..', 'data', 'posts_log.json');
  if (!existsSync(logPath)) {
    log('❌', 'posts_log.json 없음 — daily_runner.js를 먼저 실행하세요');
    process.exit(1);
  }
  const postsLog = JSON.parse(readFileSync(logPath, 'utf8'));
  const posts    = postsLog.posts ?? [];

  if (posts.length === 0) {
    log('⚠️', 'posts_log.json에 포스팅이 없습니다');
    process.exit(0);
  }

  log('🚀', `threads_poster 시작 — ${posts.length}개 포스팅, postOnly=${postOnly}, shariOnly=${shariOnly}`);

  const poster       = new ThreadsPoster({ headless: false });
  await poster.init();

  let successPost = 0;
  let totalShari  = 0;
  const results   = [];

  // ── ① 블로그 홍보글 게시 (포스팅별 순서대로) ──────────────────────────
  if (!shariOnly) {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      log('', '─'.repeat(55));
      log('📰', `[${i + 1}/${posts.length}] ${post.title}`);

      const mdPath = path.join(
        __dirname, '..', 'content', 'posts',
        post.sectionDir, post.slug, 'index.md'
      );
      const blogContent = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';

      try {
        const versions = await generateThreadsText(post, blogContent);
        const text     = versions[i % versions.length];
        await poster.postThread(text, post.url);
        successPost++;
        results.push({ title: post.title, url: post.url, posted: true });
        log('✅', `게시 완료: ${post.title}`);
      } catch (err) {
        log('❌', `게시 실패: ${err.message}`);
        results.push({ title: post.title, url: post.url, posted: false });
      }

      // 포스팅 간 30초 휴식 (마지막 제외)
      if (i < posts.length - 1) {
        log('⏸️', '다음 포스팅까지 30초 대기...');
        await wait(30_000);
      }
    }
  }

  // ── ② 스하리 (모집글 검색 → 찾아가서 스하리+댓글) ─────────────────────
  if (!postOnly) {
    log('', '─'.repeat(55));
    try {
      const count = await poster.doShari(30);
      totalShari  = count;
    } catch (err) {
      log('❌', `스하리 실패: ${err.message}`);
    }
  }

  await poster.close();

  // 결과 요약
  log('', '='.repeat(55));
  log('🎉', `완료 — 게시 ${successPost}/${posts.length} | 스하리 총 ${totalShari}개`);

  // 텔레그램 알림
  const lines = [
    `🧵 트렌드줌 Threads 홍보 완료!`,
    `📝 게시: ${successPost}/${posts.length}개`,
    `🔁 스하리: 총 ${totalShari}개`,
    ``,
  ];
  if (!shariOnly) {
    results.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.posted ? '✅' : '❌'} ${r.title}`);
      lines.push(`   ${r.url}`);
    });
  }
  await sendTelegram(lines.join('\n')).catch(() => {});
  log('📱', '텔레그램 알림 전송 완료');
}

main().catch(err => {
  console.error('❌ threads_poster 치명적 오류:', err.message);
  process.exit(1);
});
