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
import { postToThreads } from './threads_api.js';
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
const SHARI_LOG       = path.join(__dirname, '..', 'data', 'shari_log.json');
const THREADS_POST_LOG = path.join(__dirname, '..', 'data', 'threads_log.json');
const DATA_DIR        = path.join(__dirname, '..', 'data');

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


/**
 * 사람처럼 불규칙한 딜레이 (봇 신고 최소화를 위해 전반적으로 느리게)
 * 20%: 보통(15~40초), 50%: 느림(45~120초), 30%: 아주느림(130~240초)
 */
function humanWait() {
  const r = Math.random();
  let ms;
  if (r < 0.20)      ms = rand(15000, 40000);
  else if (r < 0.70) ms = rand(45000, 120000);
  else               ms = rand(130000, 240000);
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
// Threads 홍보글 생성 — front matter 기반 템플릿 (API 없음)
// ────────────────────────────────────────────────────────────────────────────
async function generateThreadsText(post, blogContent) {
  log('✍️', `홍보글 생성 (템플릿): ${post.title}`);
  return [buildFallbackText(post, blogContent)];
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

// threads_log.json — 중복 게시 방지 (7일 보관)
function loadThreadsLog() {
  if (!existsSync(THREADS_POST_LOG)) return {};
  try { return JSON.parse(readFileSync(THREADS_POST_LOG, 'utf8')); } catch { return {}; }
}
function saveThreadsLog(tlog) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [url, ts] of Object.entries(tlog)) {
    if (new Date(ts).getTime() < cutoff) delete tlog[url];
  }
  writeFileSync(THREADS_POST_LOG, JSON.stringify(tlog, null, 2), 'utf8');
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
    log('🌐', 'Chrome CDP 연결 중...');
    const { context, newTab } = await connectChrome();
    this.context = context;
    this.page = await newTab(THREADS_HOME);
    await wait(6000);
    await this._checkLogin();
    await this._verifyAccount();
    log('✅', 'Threads 세션 준비 완료');
  }

  // ── paydma.action 계정 로그인 여부 확인 ──────────────────────────────────
  async _verifyAccount() {
    log('🔍', 'paydma.action 계정 확인 중...');

    const checkProfilePage = async () => {
      await this.page.goto('https://www.threads.com/@paydma.action', {
        waitUntil: 'domcontentloaded', timeout: 15000,
      }).catch(() => {});
      await wait(2000);
      return this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        return btns.some(b => {
          const t = b.textContent?.trim();
          return t === '프로필 편집' || t === 'Edit profile';
        });
      }).catch(() => false);
    };

    // 1차: 현재 페이지 nav 링크에서 계정 확인 (빠른 체크)
    const hasNavLink = await this.page.evaluate(() => {
      return [...document.querySelectorAll('a[href]')]
        .some(a => a.href.toLowerCase().includes('paydma.action'));
    }).catch(() => false);

    if (hasNavLink || await checkProfilePage()) {
      log('✅', 'paydma.action 계정 확인됨');
      await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await wait(2000);
      return;
    }

    log('🔐', '⚠️ paydma.action 미로그인 — 일반 Chrome에서 로그인해주세요');
    await sendTelegram(
      '⚠️ Threads 계정 확인 필요!\n' +
      'paydma.action이 아닌 계정으로 로그인된 것 같습니다.\n' +
      '일반 Chrome에서 paydma.action으로 로그인해주세요.\n' +
      '로그인 완료 후 자동으로 재개됩니다 (최대 5분).'
    ).catch(() => {});

    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      await wait(15000);
      if (await checkProfilePage()) {
        log('✅', 'paydma.action 계정 확인됨');
        await this.page.goto(THREADS_HOME, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await wait(2000);
        return;
      }
    }
    throw new Error('paydma.action 계정 로그인 타임아웃 (5분)');
  }

  async _ensureLoggedIn() {
    await wait(4000);
    await this._checkLogin();
  }
  async _checkLogin() {
    const url = this.page.url();
    // 내 계정 정지 감지 — 별도로 먼저 체크 (루프 전에)
    if (url.includes('/accounts/suspended/')) throw new Error('MY_ACCOUNT_SUSPENDED');
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
      await wait(15000);
      const u = this.page.url();
      if (!u.includes('/login') && !u.includes('force_authentication') &&
          !u.includes('accounts.instagram') && !u.includes('/signup')) {
        log('✅', '로그인 확인됨 — 작업 재개');
        await wait(6000);
        return;
      }
    }
    throw new Error('Threads 로그인 타임아웃 (5분 초과)');
  }

  // goto() 래퍼 — 이동 후 정지 계정 / 로그인 리다이렉트 감지
  async _goto(url, opts = {}) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000, ...opts });
    await wait(rand(2400, 5400));
    const cur = this.page.url();
    // 정지 계정 리다이렉트 감지 → 예외 throw → 호출부에서 skip 처리
    if (cur.includes('/accounts/suspended/')) {
      throw new Error('MY_ACCOUNT_SUSPENDED');
    }
    await this._checkLogin();
  }

  // 자연스러운 마우스 이동 후 클릭 (베지어 커브 경로 — 봇 감지 방지 핵심)
  async _mouseClick(x, y, jitter = 3) {
    const start = await this.page.evaluate(() => ({
      x: window._lastMouseX ?? 300,
      y: window._lastMouseY ?? 300,
    }));
    const steps = rand(8, 15);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // ease in-out cubic
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const mx = start.x + (x - start.x) * ease + (Math.random() - 0.5) * 4;
      const my = start.y + (y - start.y) * ease + (Math.random() - 0.5) * 4;
      await this.page.mouse.move(mx, my);
      await wait(rand(30, 84));
    }
    const cx = x + (Math.random() - 0.5) * jitter;
    const cy = y + (Math.random() - 0.5) * jitter;
    await this.page.mouse.click(cx, cy);
    await this.page.evaluate(([lx, ly]) => {
      window._lastMouseX = lx; window._lastMouseY = ly;
    }, [cx, cy]);
  }

  // 페이지에서 사람처럼 읽는 척 — 스크롤 위아래 랜덤
  async _readPage(postText = '') {
    const isLong = postText.length > 100;
    // 글이 길면 더 오래 머뭄
    const scrollCount = isLong ? rand(2, 5) : rand(1, 2);
    for (let i = 0; i < scrollCount; i++) {
      const dir = Math.random() > 0.3 ? 400 : -200; // 주로 아래, 가끔 위로
      await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dir);
      await wait(rand(4500, isLong ? 15000 : 9000));
    }
  }

  // ── ① 홍보글 게시 ───────────────────────────────────────────────────────
  async postThread(text, link) {
    const fullText = `${text}\n${link}`;
    log('📤', `게시 시작: ${text.slice(0, 50).replace(/\n/g, ' ')}...`);

    // 중복 게시 체크
    const tlog = loadThreadsLog();
    if (tlog[link]) {
      log('⏭️', `이미 게시된 URL 스킵: ${link}`);
      return false;
    }

    await this._goto(THREADS_HOME);
    await wait(rand(6000, 12000));

    // 작성 영역 Playwright 실제 클릭 (mouse simulation — evaluate click 금지)
    let editorClicked = false;
    for (const sel of ['[contenteditable="true"]', '[placeholder*="새로운 소식"]', 'p[data-placeholder]']) {
      try {
        await this.page.locator(sel).first().click({ timeout: 4000 });
        editorClicked = true;
        break;
      } catch {}
    }
    if (!editorClicked) {
      // 홈 피드의 작성 영역 좌표 클릭 (fallback)
      const box = await this.page.evaluate(() => {
        const el = [...document.querySelectorAll('div,span')].find(e => e.textContent?.includes('새로운 소식이 있나요'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (box) await this._mouseClick(box.x, box.y);
      else log('⚠️', '작성 영역 클릭 실패');
    }
    await wait(rand(2400, 4500));

    // 텍스트 입력: keyboard.type — human-like 240~450ms/char (3x slower, replace: execCommand + clipboard)
    await this.page.keyboard.type(fullText, { delay: rand(240, 450) });
    await wait(rand(3000, 6000));

    // 게시 버튼: bounding box 좌표 → page.mouse.click (±3px 랜덤 오프셋)
    let posted = false;
    try {
      const box = await this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        const b = btns.find(b => b.textContent?.trim() === '게시' && b.getBoundingClientRect().top > 300);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (box) {
        await this._mouseClick(box.x, box.y);
        posted = true;
      }
    } catch {}
    if (!posted) await this.page.keyboard.press('Control+Enter');

    await wait(rand(21000, 39000));

    // 게시 성공 기록
    tlog[link] = new Date().toISOString();
    saveThreadsLog(tlog);

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
      await wait(rand(4500, 9000));

      // 검색 결과 읽는 척 — 스크롤 횟수·속도 랜덤
      const scrollTimes = rand(3, 6);
      for (let i = 0; i < scrollTimes; i++) {
        const scrollAmt = rand(600, 1400);
        await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), scrollAmt);
        await wait(rand(7500, 16500)); // 사람이 결과 읽는 속도
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
          if (err.message === 'MY_ACCOUNT_SUSPENDED') {
            // 내 계정(paydma.action) 정지 → 즉시 전체 중단
            log('🚨', '내 계정 정지 감지 — 스하리 즉시 중단');
            await sendTelegram('🚨 paydma.action 계정 정지!\n스하리 자동 중단. 본인인증 후 재시도해주세요.').catch(() => {});
            throw err;
          }
          // 방문 대상 페이지 오류 (타임아웃, 존재하지 않는 포스트 등) → 해당 계정만 스킵
          log('⚠️', `페이지 이동 실패 @${username}: ${err.message}`);
          continue;
        }

        // 포스트 내용 읽는 척
        const postText = await this.page.evaluate(() => document.body.innerText.slice(0, 300));
        await this._readPage(postText);

        let ok = false;
        try {
          ok = await this._shariPost(username);
        } catch (err) {
          if (err.message === 'MY_ACCOUNT_SUSPENDED') {
            log('🚨', '내 계정 정지 감지 (스하리 중) — 즉시 중단');
            await sendTelegram('🚨 paydma.action 계정 정지!\n스하리 자동 중단. 본인인증 후 재시도해주세요.').catch(() => {});
            throw err;
          }
          log('⚠️', `_shariPost 예외 @${username}: ${err.message}`);
        }

        if (ok) {
          shariLog[username] = new Date().toISOString();
          saveShariLog(shariLog);
          successCount++;
          this.totalShari++;
          log('🎉', `스하리 완료: @${username} (${successCount}/${targetCount})`);
          await humanWait();
        } else {
          log('⚠️', `스하리 부분 실패: @${username}`);
          await wait(rand(9000, 24000));
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

      // ── 좋아요 클릭 (좌표 조회 → page.mouse.click, evaluate click 금지) ─
      const doLike = async () => {
        const box = await this.page.evaluate(() => {
          const svgs = [...document.querySelectorAll('svg[aria-label]')];
          const s = svgs.find(x => {
            const l = x.getAttribute('aria-label') || '';
            return (l.includes('좋아요') || l.toLowerCase().includes('like'))
              && !l.includes('취소') && !l.toLowerCase().includes('unlike');
          });
          if (!s) return null;
          let el = s;
          for (let i = 0; i < 4; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') {
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
          const r = s.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (box) {
          await this._mouseClick(box.x, box.y);
          liked = true;
          log('❤️', `좋아요: @${username}`);
        } else {
          log('⚠️', `좋아요 버튼 못 찾음: @${username}`);
        }
        await wait(rand(3600, 10500));
      };

      // ── 리포스트 클릭 (좌표 조회 → page.mouse.click) ────────────────────
      const doRepost = async () => {
        const box = await this.page.evaluate(() => {
          const svgs = [...document.querySelectorAll('svg[aria-label]')];
          const s = svgs.find(x => {
            const l = x.getAttribute('aria-label') || '';
            return (l.includes('리포스트') || l.toLowerCase().includes('repost')) && !l.includes('취소');
          });
          if (!s) return null;
          let el = s;
          for (let i = 0; i < 4; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') {
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
          const r = s.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (box) {
          await this._mouseClick(box.x, box.y);
          await wait(rand(3000, 7500));
          // 모달 확인 버튼도 _mouseClick으로
          const confirmBox = await this.page.evaluate(() => {
            const b = [...document.querySelectorAll('div[role="button"],button')]
              .find(b => b.textContent?.trim() === '리포스트' || b.textContent?.trim() === 'Repost');
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          });
          if (confirmBox) {
            await this._mouseClick(confirmBox.x, confirmBox.y);
            repostClicked = true;
          } else {
            repostClicked = true; // 모달 없이 바로 완료된 경우
          }
          if (repostClicked) log('🔁', `리포스트: @${username}`);
          await wait(rand(4500, 12000));
        } else {
          log('⚠️', `리포스트 버튼 못 찾음: @${username}`);
        }
      };

      // ── 팔로우 클릭 (좌표 조회 → page.mouse.click) ──────────────────────
      const doFollow = async () => {
        const _clickFollow = async () => {
          const box = await this.page.evaluate(() => {
            const b = [...document.querySelectorAll('div[role="button"],button,[role="button"]')]
              .find(b => { const t = b.textContent?.trim(); return t === '팔로우' || t === 'Follow'; });
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          });
          if (!box) return false;
          await this._mouseClick(box.x, box.y);
          return true;
        };

        const ok = await _clickFollow();
        if (ok) {
          followed = true;
          log('➕', `팔로우: @${username}`);
        } else {
          // 프로필 페이지에서 재시도
          try {
            await this._goto(`https://www.threads.com/@${username}`);
            await wait(rand(3000, 7500));
            const ok2 = await _clickFollow();
            followed = ok2;
            if (ok2) log('➕', `팔로우 (프로필): @${username}`);
            else log('⏭️', `이미 팔로우 중: @${username}`);
          } catch (err) {
            if (err.message === 'MY_ACCOUNT_SUSPENDED') throw err; // 상위로 전파
          }
        }
        await wait(rand(4500, 12000));
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
      if (err.message === 'MY_ACCOUNT_SUSPENDED') throw err; // doShari로 전파
      log('⚠️', `_shariPost 오류 @${username}: ${err.message}`);
      return false;
    }
  }

  // ── 댓글 남기기 (keyboard.type 전용 — execCommand/clipboard evaluate 금지) ─
  async _leaveComment(commentText) {
    try {
      // 1) Playwright locator로 댓글 입력창 클릭 (mouse simulation)
      let clickedInput = false;
      const commentSelectors = [
        '[aria-label*="댓글"]', '[aria-label*="reply"]', '[aria-label*="Reply"]',
        '[aria-label*="답글"]', '[aria-label*="Add a comment"]',
        '[placeholder*="댓글"]', '[data-placeholder*="댓글"]',
      ];
      for (const sel of commentSelectors) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.count() > 0 && await loc.isVisible({ timeout: 2000 })) {
            await loc.click({ timeout: 3000 });
            clickedInput = true;
            break;
          }
        } catch {}
      }

      if (!clickedInput) {
        // 텍스트 기반: 좌표 조회 → page.mouse.click
        const box = await this.page.evaluate(() => {
          const keywords = ['댓글 달기', '댓글 추가', '답글 달기', 'Add a comment', 'Reply...'];
          const all = [...document.querySelectorAll('p, div, span, [role="textbox"]')];
          const found = all.find(el => keywords.some(kw => el.textContent?.trim().startsWith(kw)));
          if (found) {
            const r = found.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          // 마지막 contenteditable (댓글 영역)
          const edits = [...document.querySelectorAll('[contenteditable="true"]')];
          if (edits.length > 1) {
            const r = edits[edits.length - 1].getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          return null;
        });
        if (box) {
          await this._mouseClick(box.x, box.y, 2);
          clickedInput = true;
        }
      }

      if (!clickedInput) {
        // 최후 수단: 'r' 단축키
        await this.page.keyboard.press('r');
        await wait(1800);
        clickedInput = true;
      }

      await wait(rand(2100, 4200));

      // 텍스트 입력: keyboard.type (human delay 180~360ms — execCommand 완전 금지)
      await this.page.keyboard.type(commentText, { delay: rand(180, 360) });
      await wait(rand(1500, 3000));

      // 댓글 게시 버튼: 좌표 조회 → page.mouse.click
      const postBox = await this.page.evaluate(() => {
        const btns = [...document.querySelectorAll('div[role="button"], button')];
        const postBtns = btns.filter(b => b.textContent?.trim() === '게시');
        if (postBtns.length === 0) return null;
        const b = postBtns[postBtns.length - 1];
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (postBox) {
        await this._mouseClick(postBox.x, postBox.y);
      } else {
        await this.page.keyboard.press('Control+Enter');
      }

      await wait(rand(6000, 12000));
      log('💬', `댓글 남김: "${commentText}"`);
      return true;
    } catch (err) {
      log('⚠️', `댓글 실패: ${err.message}`);
      return false;
    }
  }

  async close() {
    try { await this.page?.close(); } catch {}
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

  // 게시할 포스팅: 아직 Threads에 올리지 않은 것 중 첫 번째 (순서 유지)
  const tlogForSelect = loadThreadsLog();
  const isFirstPostToday = !posts.some(p => tlogForSelect[p.url]);
  const selectedPost = posts.find(p => !tlogForSelect[p.url]);
  if (!selectedPost) {
    log('✅', `오늘 포스팅 ${posts.length}개 모두 Threads에 게시 완료`);
    process.exit(0);
  }

  log('🚀', `threads_poster 시작 — [${posts.indexOf(selectedPost) + 1}/${posts.length}] "${selectedPost.title}" | 오늘 첫 게시=${isFirstPostToday}`);

  let successPost = 0;
  let totalShari  = 0;
  const results   = [];

  // ── ① 블로그 홍보글 게시 — 공식 API (봇 탐지 없음) ──────────────────────
  if (!shariOnly) {
    log('', '─'.repeat(55));
    log('📰', `오늘의 포스팅: ${selectedPost.title}`);
    log('🌐', 'Threads 공식 API로 게시 중...');

    const mdPath = path.join(
      __dirname, '..', 'content', 'posts',
      selectedPost.sectionDir, selectedPost.slug, 'index.md'
    );
    const blogContent = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';

    try {
      const versions = await generateThreadsText(selectedPost, blogContent);
      const text     = `${versions[0]}\n${selectedPost.url}`;
      await postToThreads(text);
      successPost++;
      results.push({ title: selectedPost.title, url: selectedPost.url, posted: true });
      log('✅', `API 게시 완료: ${selectedPost.title}`);
    } catch (err) {
      log('❌', `API 게시 실패: ${err.message}`);
      results.push({ title: selectedPost.title, url: selectedPost.url, posted: false });
    }
  }

  // ── ② 스하리 — 하루 첫 게시(10:00)일 때만 실행 (반복 실행 시 스킵) ──────
  if (!postOnly && isFirstPostToday) {
    log('', '─'.repeat(55));
    const poster = new ThreadsPoster();
    try {
      await poster.init();
      await humanWait(); // 게시 후 자연스러운 간격
      const count = await poster.doShari(5);
      totalShari  = count;
    } catch (err) {
      log('❌', `스하리 실패: ${err.message}`);
    } finally {
      await poster.close();
    }
  } else if (!postOnly && !isFirstPostToday) {
    log('⏭️', '스하리 스킵 — 오늘 첫 게시가 아님 (10:00 실행분에서 이미 처리)');
  }

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

main().catch(async err => {
  log('❌', `threads_poster 치명적 오류: ${err.message}`);
  await sendTelegram(`❌ threads_poster 실행 실패!\n${err.message}`).catch(() => {});
  process.exit(1);
});
