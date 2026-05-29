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

import { connectChrome } from './connect_chrome.js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { sendTelegram } from './telegram.js';

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const THREADS_HOME = 'https://www.threads.com';
const LOG_DIR      = path.join(__dirname, '..', 'logs');
const LOG_FILE     = path.join(LOG_DIR, `threads-${new Date().toISOString().slice(0, 10)}.log`);
const SHARI_LOG    = path.join(__dirname, '..', 'data', 'shari_log.json');
const DATA_DIR     = path.join(__dirname, '..', 'data');

mkdirSync(LOG_DIR,  { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

const log = (emoji, msg) => {
  const line = `[${new Date().toISOString()}] ${emoji}  ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch {}
};

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * 사람처럼 불규칙한 딜레이
 * 30%: 빠름(1~3초), 40%: 보통(4~10초), 20%: 느림(11~25초), 10%: 아주느림(26~50초)
 */
function humanWait() {
  const r = Math.random();
  let ms;
  if (r < 0.30)      ms = rand(1000, 3000);
  else if (r < 0.70) ms = rand(4000, 10000);
  else if (r < 0.90) ms = rand(11000, 25000);
  else               ms = rand(26000, 50000);
  log('⏱️', `대기 ${(ms/1000).toFixed(1)}초...`);
  return wait(ms);
}

// 스하리 댓글 멘트 — 매번 랜덤 선택 (봇 감지 방지)
const SHARI_COMMENTS = [
  '스하링 🔁🩷',
  '스하리해요 💕🔁',
  '맞팔해요 🩷',
  '스하리 합니다 ✨',
  '반하리 할게요 🔁💚',
  '팔로우 했어요 😊🩷',
  '스하리+반하리 💕',
];

// 스하리 검색 키워드 — 실행마다 순서 셔플
const SHARI_KEYWORDS_BASE = [
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
  constructor() {
    this.context    = null;
    this.page       = null;
    this.totalShari = 0;
  }

  // ── 초기화 — 실행 중인 Chrome에 CDP 연결 ─────────────────────────────────
  async init() {
    log('🌐', 'Chrome CDP 연결 중... (로그인 세션 자동 사용)');
    const { context, newTab } = await connectChrome();
    this.context = context;

    // 새 탭을 열어 Threads로 이동 (기존 Chrome 세션 → 로그인 불필요)
    this.page = await newTab(THREADS_HOME);
    await wait(2000);

    const url = this.page.url();
    if (url.includes('/login') || url.includes('accounts.instagram') || url.includes('/signup')) {
      throw new Error('Threads 로그인 필요 — Chrome에서 Threads에 로그인 후 다시 실행해주세요.');
    }
    log('✅', 'Threads 세션 준비 완료 (Chrome 기존 로그인 사용)');
  }

  // (하위 호환 — CDP 방식에서는 사용 안 함)
  async _ensureLoggedIn() {}
  async _checkLogin() {
    const url = this.page.url();
    const isLoginPage = url.includes('/login') || url.includes('accounts.instagram') ||
                        url.includes('accounts.google') || url.includes('/signup') ||
                        url.includes('force_authentication');
    if (!isLoginPage) return;

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

  // goto() 래퍼 — 이동 후 정지 계정 / 로그인 리다이렉트 감지
  async _goto(url, opts = {}) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000, ...opts });
    await wait(rand(800, 1800));
    const cur = this.page.url();
    // 정지 계정 리다이렉트 감지 → 예외 throw → 호출부에서 skip 처리
    if (cur.includes('/accounts/suspended/')) {
      throw new Error('SUSPENDED');
    }
    await this._checkLogin();
  }

  // 페이지에서 사람처럼 읽는 척 — 스크롤 위아래 랜덤
  async _readPage(postText = '') {
    const isLong = postText.length > 100;
    // 글이 길면 더 오래 머뭄
    const scrollCount = isLong ? rand(2, 5) : rand(1, 2);
    for (let i = 0; i < scrollCount; i++) {
      const dir = Math.random() > 0.3 ? 400 : -200; // 주로 아래, 가끔 위로
      await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dir);
      await wait(rand(1500, isLong ? 5000 : 3000));
    }
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
  async doShari(targetCount = 15) {
    log('🔥', `스하리 시작 (목표: ${targetCount}개) — 검색 기반 모집글 탐색`);

    const shariLog   = loadShariLog();
    let successCount = 0;

    // 키워드 순서를 매 실행마다 셔플
    const keywords = shuffle(SHARI_KEYWORDS_BASE);

    for (const keyword of keywords) {
      if (successCount >= targetCount) break;

      log('🔍', `"${keyword}" 검색 중...`);
      await this._goto(
        `https://www.threads.com/search/?q=${encodeURIComponent(keyword)}&serp_type=default`
      );
      await wait(rand(1500, 3000));

      // 검색 결과 읽는 척 — 스크롤 횟수·속도 랜덤
      const scrollTimes = rand(3, 6);
      for (let i = 0; i < scrollTimes; i++) {
        const scrollAmt = rand(600, 1400);
        await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), scrollAmt);
        await wait(rand(2500, 5500)); // 사람이 결과 읽는 속도
      }

      // 검색 결과에서 포스트 링크 + 팔로우 버튼 모두 추출
      const postLinks = await this.page.evaluate(() => {
        const anchors = [...document.querySelectorAll('a[href*="/post/"]')];
        return [...new Set(anchors.map(a => a.href))].filter(h =>
          h.includes('/post/') && h.includes('threads.com') && !h.includes('/media')
        );
      });

      log('📋', `"${keyword}" — 포스트 ${postLinks.length}개 발견`);

      // 포스트 목록도 랜덤 셔플 (같은 순서 반복 방지)
      const shuffledPosts = shuffle(postLinks);

      for (const postUrl of shuffledPosts) {
        if (successCount >= targetCount) break;

        const usernameMatch = postUrl.match(/@([^/]+)\/post\//);
        if (!usernameMatch) continue;
        const username = usernameMatch[1];

        if (shariLog[username]) {
          log('⏭️', `이미 처리한 계정 스킵: @${username}`);
          continue;
        }

        log('👤', `스하리 진행: @${username}`);

        // 포스트 방문 전 사람처럼 대기
        await humanWait();

        try {
          await this._goto(postUrl);
        } catch (err) {
          if (err.message === 'SUSPENDED') {
            log('🚫', `정지 계정 스킵: @${username}`);
            continue; // 다음 포스트로 바로 이동
          }
          throw err;
        }

        // 포스트 내용 읽는 척
        const postText = await this.page.evaluate(() => document.body.innerText.slice(0, 300));
        await this._readPage(postText);

        const ok = await this._shariPost(username);

        if (ok) {
          shariLog[username] = new Date().toISOString();
          saveShariLog(shariLog);
          successCount++;
          this.totalShari++;
          log('🎉', `스하리 완료: @${username} (${successCount}/${targetCount})`);
          await humanWait();
        } else {
          log('⚠️', `스하리 부분 실패: @${username}`);
          await wait(rand(3000, 8000));
        }
      }
    }

    log('🎯', `스하리 완료: ${successCount}개`);
    return successCount;
  }

  // ── 포스트 1개 스하리 실행 (순서 랜덤 + 댓글 다양화) ────────────────────
  async _shariPost(username) {
    try {
      let liked = false, repostClicked = false, followed = false;

      // ── 좋아요 클릭 ───────────────────────────────────────────────────────
      const doLike = async () => {
        const ok = await this.page.evaluate(() => {
          const svgs = [...document.querySelectorAll('svg[aria-label]')];
          const s = svgs.find(x => {
            const l = x.getAttribute('aria-label') || '';
            return (l.includes('좋아요') || l.toLowerCase().includes('like'))
              && !l.includes('취소') && !l.toLowerCase().includes('unlike');
          });
          if (s) {
            // SVG → 부모 → role="button" 인 조상 찾기
            let el = s;
            for (let i = 0; i < 4; i++) {
              el = el.parentElement;
              if (!el) break;
              if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') {
                el.click(); return true;
              }
            }
            s.parentElement?.click(); return true;
          }
          return false;
        });
        liked = ok;
        if (!ok) log('⚠️', `좋아요 버튼 못 찾음: @${username}`);
        else log('❤️', `좋아요: @${username}`);
        await wait(rand(1200, 3500));
      };

      // ── 리포스트 클릭 ─────────────────────────────────────────────────────
      const doRepost = async () => {
        const ok = await this.page.evaluate(() => {
          const svgs = [...document.querySelectorAll('svg[aria-label]')];
          const s = svgs.find(x => {
            const l = x.getAttribute('aria-label') || '';
            return (l.includes('리포스트') || l.toLowerCase().includes('repost'))
              && !l.includes('취소');
          });
          if (!s) return false;
          let el = s;
          for (let i = 0; i < 4; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') {
              el.click(); return true;
            }
          }
          s.parentElement?.click(); return true;
        });
        if (ok) {
          await wait(rand(1000, 2500));
          // 모달 확인 버튼
          const confirmed = await this.page.evaluate(() => {
            const b = [...document.querySelectorAll('div[role="button"],button')]
              .find(b => b.textContent?.trim() === '리포스트' || b.textContent?.trim() === 'Repost');
            if (b) { b.click(); return true; }
            return false;
          });
          repostClicked = confirmed || ok;
          if (repostClicked) log('🔁', `리포스트: @${username}`);
          await wait(rand(1500, 4000));
        } else {
          log('⚠️', `리포스트 버튼 못 찾음: @${username}`);
        }
      };

      // ── 팔로우 클릭 (포스트 페이지 먼저, 실패 시 프로필) ─────────────────
      const doFollow = async () => {
        const ok = await this.page.evaluate(() => {
          const b = [...document.querySelectorAll('div[role="button"],button,[role="button"]')]
            .find(b => { const t = b.textContent?.trim(); return t === '팔로우' || t === 'Follow'; });
          if (b) { b.click(); return true; }
          return false;
        });
        if (ok) {
          followed = true;
          log('➕', `팔로우: @${username}`);
        } else {
          // 프로필 페이지에서 재시도
          try {
            await this._goto(`https://www.threads.com/@${username}`);
            await wait(rand(1000, 2500));
            const ok2 = await this.page.evaluate(() => {
              const b = [...document.querySelectorAll('div[role="button"],button,[role="button"]')]
                .find(b => { const t = b.textContent?.trim(); return t === '팔로우' || t === 'Follow'; });
              if (b) { b.click(); return true; }
              return false;
            });
            followed = ok2;
            if (ok2) log('➕', `팔로우 (프로필): @${username}`);
            else log('⏭️', `이미 팔로우 중: @${username}`);
          } catch {}
        }
        await wait(rand(1500, 4000));
      };

      // ── 댓글 남기기 ───────────────────────────────────────────────────────
      const doComment = async () => {
        const commentText = SHARI_COMMENTS[Math.floor(Math.random() * SHARI_COMMENTS.length)];
        await this._leaveComment(commentText);
      };

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 액션 순서 랜덤 결정
      //   패턴 A: 좋아요 → 팔로우 → 리포스트 → 댓글
      //   패턴 B: 팔로우 → 좋아요 → 댓글 → 리포스트
      //   패턴 C: 좋아요 → 리포스트 → 댓글 → 팔로우
      //   패턴 D: 팔로우 → 리포스트 → 좋아요 → 댓글
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const patterns = [
        [doLike, doFollow, doRepost, doComment],
        [doFollow, doLike, doComment, doRepost],
        [doLike, doRepost, doComment, doFollow],
        [doFollow, doRepost, doLike, doComment],
      ];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      const patternIdx = patterns.indexOf(pattern) + 1;
      log('🎲', `액션 패턴 ${patternIdx} 선택`);

      for (const action of pattern) {
        await action();
      }

      return liked || repostClicked || followed;
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
    // 탭만 닫고 Chrome 브라우저는 유지
    try { await this.page?.close(); } catch {}
    log('🔒', 'Threads 탭 종료 (Chrome 유지)');
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

  // 게시할 포스팅: 전체 중 랜덤 1개만 선택
  const selectedPost = posts[Math.floor(Math.random() * posts.length)];
  log('🚀', `threads_poster 시작 — 오늘의 게시글: "${selectedPost.title}" | shariOnly=${shariOnly}`);

  const poster   = new ThreadsPoster();
  await poster.init();

  let successPost = 0;
  let totalShari  = 0;
  const results   = [];

  // ── ① 블로그 홍보글 게시 (랜덤 1개) ──────────────────────────────────────
  if (!shariOnly) {
    log('', '─'.repeat(55));
    log('📰', `오늘의 포스팅: ${selectedPost.title}`);

    const mdPath = path.join(
      __dirname, '..', 'content', 'posts',
      selectedPost.sectionDir, selectedPost.slug, 'index.md'
    );
    const blogContent = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';

    try {
      const versions = await generateThreadsText(selectedPost, blogContent);
      const text     = versions[0];
      await poster.postThread(text, selectedPost.url);
      successPost++;
      results.push({ title: selectedPost.title, url: selectedPost.url, posted: true });
      log('✅', `게시 완료: ${selectedPost.title}`);
    } catch (err) {
      log('❌', `게시 실패: ${err.message}`);
      results.push({ title: selectedPost.title, url: selectedPost.url, posted: false });
    }

    // 게시 후 스하리 전 여유 시간
    await humanWait();
  }

  // ── ② 스하리 (모집글 검색 → 찾아가서 스하리+팔로우) ─────────────────────
  if (!postOnly) {
    log('', '─'.repeat(55));
    try {
      const count = await poster.doShari(15);
      totalShari  = count;
    } catch (err) {
      log('❌', `스하리 실패: ${err.message}`);
    }
  }

  await poster.close();

  // 결과 요약
  log('', '='.repeat(55));
  log('🎉', `완료 — 게시 ${successPost}/1 | 스하리 총 ${totalShari}개`);

  // 텔레그램 알림
  const lines = [
    `🧵 트렌드줌 Threads 작업 완료!`,
    `📝 게시: ${successPost}/1개 (랜덤 선택)`,
    `🔁 스하리+팔로우: 총 ${totalShari}개`,
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
