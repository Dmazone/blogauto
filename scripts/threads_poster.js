/**
 * threads_poster.js — Playwright로 Threads 자동 홍보 + 스하리 활동
 *
 * 실행:
 *   node scripts/threads_poster.js               # 전체 (게시 + 스하리)
 *   node scripts/threads_poster.js --post-only   # 게시만
 *   node scripts/threads_poster.js --shari-only  # 스하리만
 *
 * 흐름 (포스팅 1개당):
 *   ① 블로그 본문 요약 → Threads 홍보글 게시 (링크 포함)
 *   ② 피드 10개 탐색 (문화 학습)
 *   ③ 스하리 (팔로우+하트+리포스트) 최대한 많이
 *   ④ 다음 포스팅 반복
 */

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { sendTelegram } from './telegram.js';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SESSION_DIR = path.join(os.homedir(), '.threads-blog-session');
const THREADS_HOME = 'https://www.threads.com';
const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, `threads-${new Date().toISOString().slice(0, 10)}.log`);
mkdirSync(LOG_DIR, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const log = (emoji, msg) => {
  const line = `[${new Date().toISOString()}] ${emoji}  ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch {}
};

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ────────────────────────────────────────────────────────────────────────────
// Claude Haiku로 Threads 홍보글 3버전 생성
// ────────────────────────────────────────────────────────────────────────────
async function generateThreadsText(post, blogContent) {
  log('✍️', `홍보글 생성: ${post.title}`);

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
    log('⚠️', `홍보글 생성 실패: ${err.message}`);
  }

  // 폴백
  return [`${post.title}\n\n지금 트렌드줌에서 확인하세요!\n#트렌드 #최신이슈\n\n👇 더 보기`];
}

// ────────────────────────────────────────────────────────────────────────────
// ThreadsPoster 클래스
// ────────────────────────────────────────────────────────────────────────────
class ThreadsPoster {
  constructor({ headless = false } = {}) {
    this.headless   = headless;
    this.context    = null;
    this.page       = null;
    this.totalShari = 0;
  }

  // ── 초기화 ──────────────────────────────────────────────────────────────
  async init() {
    log('🌐', 'Threads 브라우저 시작...');
    this.context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless:   this.headless,
      viewport:   { width: 1280, height: 900 },
      locale:     'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    this.page = await this.context.newPage();
    await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this._ensureLoggedIn();
    log('✅', 'Threads 세션 준비 완료');
  }

  async _ensureLoggedIn() {
    await wait(4000);
    const url = this.page.url();
    if (url.includes('/login') || url.includes('accounts.') || url.includes('/signup')) {
      log('🔐', '로그인 필요 — 브라우저에서 직접 로그인해주세요 (최대 3분 대기)');
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await wait(4000);
        const u = this.page.url();
        if (!u.includes('/login') && !u.includes('/signup')) {
          log('✅', '로그인 확인됨');
          return;
        }
      }
      throw new Error('Threads 로그인 타임아웃');
    }
  }

  // ── ① 홍보글 게시 ───────────────────────────────────────────────────────
  async postThread(text, link) {
    const fullText = `${text}\n${link}`;
    log('📤', `게시 시작: ${text.slice(0, 50).replace(/\n/g, ' ')}...`);

    // 홈으로 이동
    await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(3000);

    // 작성 영역 찾아 클릭
    const clicked = await this.page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('[contenteditable="true"]'),
        ...document.querySelectorAll('p[data-lexical-text="true"]'),
        ...[...document.querySelectorAll('div, span')].filter(el =>
          el.textContent?.includes('새로운 소식이 있나요')
        ),
      ];
      for (const el of candidates) {
        el.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      log('⚠️', '작성 영역 클릭 실패, JS 강제 시도');
    }
    await wait(1000);

    // 텍스트 입력 (클립보드 방식)
    try {
      await this.page.evaluate((t) => navigator.clipboard.writeText(t), fullText);
      await this.page.keyboard.press('Control+v');
    } catch {
      await this.page.keyboard.type(fullText, { delay: 30 });
    }
    await wait(1000);

    // 게시 버튼 클릭
    const posted = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('div[role="button"], button')];
      const postBtn = btns.find(b => b.textContent?.trim() === '게시');
      if (postBtn) { postBtn.click(); return true; }
      return false;
    });

    if (!posted) {
      await this.page.keyboard.press('Control+Enter');
    }

    await wait(4000);
    log('✅', '게시 완료');
    return true;
  }

  // ── ② 피드 탐색 & 문화 학습 ─────────────────────────────────────────────
  async browseFeed(count = 10) {
    log('👀', `피드 ${count}개 탐색 중...`);
    await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2000);

    const seen = new Set();
    let browsed = 0;

    for (let i = 0; i < count * 4 && browsed < count; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 500));
      await wait(rand(800, 1500));

      const texts = await this.page.evaluate(() => {
        const articles = document.querySelectorAll('article');
        return [...articles].map(a => a.innerText?.slice(0, 150).trim()).filter(t => t?.length > 15);
      });

      for (const t of texts) {
        if (!seen.has(t)) {
          seen.add(t);
          browsed++;
        }
      }
    }

    log('📚', `피드 ${browsed}개 파악 완료`);
    return browsed;
  }

  // ── ③ 스하리 (팔로우 + 하트 + 리포스트) ────────────────────────────────
  async doShari(targetCount = 30) {
    log('🔥', `스하리 시작 (목표: ${targetCount}개)`);
    await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2000);

    let successCount  = 0;
    let scrollCount   = 0;
    const processedKeys = new Set();

    while (successCount < targetCount && scrollCount < 150) {
      // 현재 뷰포트의 article 목록
      const postCount = await this.page.evaluate(() =>
        document.querySelectorAll('article').length
      );

      for (let idx = 0; idx < postCount && successCount < targetCount; idx++) {
        const key = await this.page.evaluate(i => {
          const a = document.querySelectorAll('article')[i];
          return a?.innerText?.slice(0, 40) ?? '';
        }, idx);

        if (!key || processedKeys.has(key)) continue;
        processedKeys.add(key);

        const ok = await this._sharisOnePost(idx);
        if (ok) {
          successCount++;
          this.totalShari++;
          log('🔁', `스하리 ${successCount}/${targetCount} (총 ${this.totalShari})`);
          await wait(rand(1800, 3500));
        }
      }

      // 스크롤
      await this.page.evaluate(() => window.scrollBy(0, 700));
      scrollCount++;
      await wait(rand(1000, 1800));

      // 피드 끝 감지
      const atBottom = await this.page.evaluate(() => {
        return window.scrollY + window.innerHeight >= document.body.scrollHeight - 200;
      });
      if (atBottom && scrollCount > 20) {
        log('📍', '피드 끝 도달 → 홈 재이동');
        await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await wait(2000);
        scrollCount = 0;
      }
    }

    log('🎯', `스하리 완료: ${successCount}개`);
    return successCount;
  }

  async _sharisOnePost(idx) {
    try {
      // 1) 좋아요
      const liked = await this.page.evaluate((i) => {
        const article = document.querySelectorAll('article')[i];
        if (!article) return false;
        const svgs = article.querySelectorAll('svg');
        const likeBtn = [...svgs].find(svg =>
          svg.getAttribute('aria-label')?.includes('좋아요') ||
          svg.closest('[aria-label*="좋아요"]')
        );
        const clickable = likeBtn?.closest('div[role="button"]') || likeBtn?.parentElement?.parentElement;
        if (clickable) { clickable.click(); return true; }
        return false;
      }, idx);

      if (!liked) return false;
      await wait(rand(400, 800));

      // 2) 리포스트
      await this.page.evaluate((i) => {
        const article = document.querySelectorAll('article')[i];
        if (!article) return;
        const svgs = article.querySelectorAll('svg');
        const repostBtn = [...svgs].find(svg =>
          svg.getAttribute('aria-label')?.includes('리포스트') ||
          svg.closest('[aria-label*="리포스트"]')
        );
        const clickable = repostBtn?.closest('div[role="button"]') || repostBtn?.parentElement?.parentElement;
        clickable?.click();
      }, idx);

      await wait(700);

      // 리포스트 모달 확인 버튼 클릭
      await this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        const confirm = btns.find(b => b.textContent?.trim() === '리포스트');
        confirm?.click();
      });
      await wait(rand(400, 700));

      // 3) 팔로우 (아직 팔로우 안 한 계정만)
      await this.page.evaluate((i) => {
        const article = document.querySelectorAll('article')[i];
        if (!article) return;
        const btns = [...article.querySelectorAll('div[role="button"], button')];
        const followBtn = btns.find(b => b.textContent?.trim() === '팔로우');
        followBtn?.click();
      }, idx);

      return true;
    } catch {
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
  const args       = process.argv.slice(2);
  const postOnly   = args.includes('--post-only');
  const shariOnly  = args.includes('--shari-only');

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

  log('🚀', `threads_poster 시작 — ${posts.length}개 포스팅`);

  const poster = new ThreadsPoster({ headless: false });
  await poster.init();

  let successPost  = 0;
  let totalShari   = 0;
  const results    = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    log('', '─'.repeat(55));
    log('📰', `[${i + 1}/${posts.length}] ${post.title}`);

    // 블로그 본문 읽기
    const mdPath = path.join(
      __dirname, '..', 'content', 'posts',
      post.sectionDir, post.slug, 'index.md'
    );
    const blogContent = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';

    // ① 홍보글 게시
    if (!shariOnly) {
      try {
        const versions = await generateThreadsText(post, blogContent);
        const text     = versions[i % versions.length]; // 순서대로 다른 버전 사용
        await poster.postThread(text, post.url);
        successPost++;
        results.push({ title: post.title, url: post.url, posted: true });
        log('✅', `게시 완료: ${post.title}`);
      } catch (err) {
        log('❌', `게시 실패: ${err.message}`);
        results.push({ title: post.title, url: post.url, posted: false });
      }
    }

    // ② 피드 탐색 (문화 학습)
    if (!postOnly) {
      try {
        await poster.browseFeed(10);
      } catch (err) {
        log('⚠️', `피드 탐색 실패: ${err.message}`);
      }

      // ③ 스하리
      try {
        const count = await poster.doShari(30);
        totalShari += count;
      } catch (err) {
        log('⚠️', `스하리 실패: ${err.message}`);
      }
    }

    // 포스팅 간 1분 휴식 (마지막 제외)
    if (i < posts.length - 1) {
      log('⏸️', '다음 포스팅까지 1분 대기...');
      await wait(60_000);
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
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.posted ? '✅' : '❌'} ${r.title}`);
    lines.push(`   ${r.url}`);
  });
  await sendTelegram(lines.join('\n')).catch(() => {});
  log('📱', '텔레그램 알림 전송 완료');
}

main().catch(err => {
  console.error('❌ threads_poster 치명적 오류:', err.message);
  process.exit(1);
});
