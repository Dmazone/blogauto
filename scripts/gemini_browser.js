/**
 * gemini_browser.js — Playwright로 Gemini 웹/Gem 멀티턴 대화 자동화
 *
 * GeminiSession:
 *   init()             — 브라우저 시작, 로그인 확인, Gem 이동
 *   send(text)         — 새 대화 시작 or 현재 대화에 메시지 추가
 *   newConversation()  — 명시적으로 새 대화 시작
 *   close()            — 브라우저 종료
 *
 * 세션 저장: ~/.gemini-blog-session/  (로그인 자동 유지)
 */

import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(os.homedir(), '.gemini-blog-session');
const GEMINI_HOME = 'https://gemini.google.com/app';

const log  = (e, m) => console.log(`${e}  ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DOM 셀렉터 ────────────────────────────────────────────────────────────────
const SEL = {
  // 입력창 (여러 버전 대응)
  input: [
    'rich-textarea .ql-editor',
    'div.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][aria-multiline="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea.input-area',
  ],
  // 전송 버튼
  send: [
    'button[aria-label="Send message"]',
    'button[mattooltip="Send message"]',
    '[data-test-id="send-button"]',
    'button.send-button',
    'button[aria-label="메시지 보내기"]',
  ],
  // 생성 중단 버튼 (스트리밍 중에만 표시됨)
  stop: [
    'button[aria-label="Stop generating"]',
    'button[aria-label="Stop response"]',
    'button[aria-label="생성 중지"]',
    '[data-test-id="stop-button"]',
  ],
  // 새 대화 버튼
  newChat: [
    'a[href="/app"]',
    'button[aria-label="New chat"]',
    'button[aria-label="새 채팅"]',
    '[data-test-id="new-chat-button"]',
    'a[href*="/app"]:not([href*="gem"])',
  ],
  // 모델 응답 컨테이너 (마지막 것만 추출)
  response: [
    'message-content',
    '.model-response-text',
    'model-response .response-content',
    'message-content .markdown',
    '[data-message-author-role="model"] .markdown-container',
    '.response-container .markdown',
  ],
};

export class GeminiSession {
  constructor({ headless = false, gemUrl = null } = {}) {
    this.headless  = headless;
    this.gemUrl    = gemUrl;     // 특정 Gem URL (없으면 일반 채팅)
    this.context   = null;
    this.page      = null;
    this._turnCount = 0;         // 현재 대화 턴 수
  }

  // ── 초기화 ──────────────────────────────────────────────────────────────────
  async init() {
    log('🌐', '브라우저 시작 중...');
    this.context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless:   this.headless,
      viewport:   { width: 1280, height: 900 },
      locale:     'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    this.page = await this.context.newPage();

    // 먼저 홈으로 이동해서 로그인 확인
    await this.page.goto(GEMINI_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this._ensureLoggedIn();

    // 로그인 후 현재 URL에서 계정 인덱스 추출 → Gem URL 재구성
    if (this.gemUrl) {
      const currentUrl = this.page.url();
      const accountMatch = currentUrl.match(/\/u\/(\d+)\//);
      const gemIdMatch   = this.gemUrl.match(/\/gem\/([a-z0-9]+)/i);
      if (accountMatch && gemIdMatch) {
        const newUrl = `https://gemini.google.com/u/${accountMatch[1]}/gem/${gemIdMatch[1]}`;
        if (newUrl !== this.gemUrl) {
          log('🔄', `Gem URL 재구성: ${newUrl}`);
          this.gemUrl = newUrl;
        }
      }
      await this.page.goto(this.gemUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    }

    this._turnCount = 0;
    log('✅', `제미나이 세션 준비 완료${this.gemUrl ? ' (Gem 모드)' : ''}`);
  }

  async _ensureLoggedIn() {
    await wait(3000);
    const url = this.page.url();

    // 로그인 페이지로 리다이렉트된 경우
    const needsLogin =
      url.includes('accounts.google.com') ||
      url.includes('/signin') ||
      // Gemini가 로그인 없이 랜딩 페이지를 보여주는 경우도 감지
      (await this.page.evaluate(() => {
        // "로그인" 또는 "Sign in" 버튼이 있으면 미로그인
        const signInEl = document.querySelector(
          'a[href*="accounts.google.com"], button[aria-label*="sign in"], button[aria-label*="Sign in"], a[aria-label*="sign in"]'
        );
        // 계정 아바타(사용자 메뉴)가 없으면 미로그인
        const avatar = document.querySelector(
          'img[alt*="profile"], img[alt*="Profile"], [aria-label*="Google Account"]'
        );
        return !!signInEl || !avatar;
      }).catch(() => false));

    if (needsLogin) {
      console.log('\n');
      log('🔐', '구글 계정 로그인이 필요합니다.');
      log('📋', 'paydma 계정으로 로그인한 뒤 Enter를 누르세요.\n');
      await this._waitForEnter();
      const target = this.gemUrl ?? GEMINI_HOME;
      await this.page.goto(target, { waitUntil: 'domcontentloaded' });
      await wait(3000);
    }
  }

  async _waitForEnter() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question('  → Enter를 누르면 계속합니다... ', () => {
      rl.close(); resolve();
    }));
  }

  // ── 새 대화 시작 ─────────────────────────────────────────────────────────────
  async newConversation() {
    if (this.gemUrl) {
      // Gem: 해당 Gem URL로 재이동 (새 대화 시작)
      await this.page.goto(this.gemUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      // 일반: 새 채팅 버튼 or 홈으로
      const btn = await this._tryFind(SEL.newChat);
      if (btn) {
        await btn.click();
      } else {
        await this.page.goto(GEMINI_HOME, { waitUntil: 'domcontentloaded' });
      }
    }
    await wait(2000);
    this._turnCount = 0;
    log('💬', '새 대화 시작');
  }

  // ── 메시지 전송 (새 대화 or 이어서) ─────────────────────────────────────────
  async send(text, opts = {}) {
    const { timeout = 300000 } = opts; // 5분 기본 타임아웃

    // 첫 턴이면 새 대화부터 시작
    if (this._turnCount === 0) {
      await this.newConversation();
    }

    this._turnCount++;
    log('📤', `Turn ${this._turnCount} 전송 중... (${text.slice(0, 60).replace(/\n/g, ' ')}...)`);

    // 입력창 찾기
    const inputEl = await this._findEl(SEL.input, '입력창');
    await inputEl.click();
    await wait(300);

    // 클립보드로 붙여넣기 (긴 프롬프트)
    try {
      await this.page.evaluate((t) => navigator.clipboard.writeText(t), text);
      await this.page.keyboard.press('Control+v');
    } catch {
      // 클립보드 실패 시 직접 입력
      await inputEl.fill(text);
    }
    await wait(400);

    // 전송
    const sendBtn = await this._tryFind(SEL.send);
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }

    // 응답 대기
    await this._waitForCompletion(timeout);

    // 응답 추출
    const response = await this._extractLatestResponse();
    log('📥', `Turn ${this._turnCount} 응답 완료 (${response.length}자)`);
    return response;
  }

  // ── 응답 완료 대기 ───────────────────────────────────────────────────────────
  async _waitForCompletion(timeout) {
    // 1) 약간 기다려서 스트리밍 시작 확인
    await wait(2500);

    // 2) 정지 버튼이 보이면 사라질 때까지 대기
    let stopFound = false;
    for (const sel of SEL.stop) {
      try {
        if (await this.page.locator(sel).first().isVisible({ timeout: 5000 })) {
          stopFound = true;
          await this.page.waitForFunction(
            (selectors) => !selectors.some((s) => document.querySelector(s)),
            SEL.stop,
            { timeout, polling: 1500 }
          );
          break;
        }
      } catch {}
    }

    if (!stopFound) {
      // 정지 버튼 못 찾으면 응답 길이 안정화로 판단
      let prev = 0, stable = 0;
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline && stable < 4) {
        await wait(3000);
        const cur = await this._getLatestResponseLength();
        stable = (cur === prev && cur > 50) ? stable + 1 : 0;
        prev = cur;
      }
    }

    await wait(1500); // 렌더링 여유
  }

  async _getLatestResponseLength() {
    return await this.page.evaluate((sels) => {
      for (const s of sels) {
        const all = document.querySelectorAll(s);
        const last = all[all.length - 1];
        if (last) return last.innerText?.length ?? 0;
      }
      return 0;
    }, SEL.response);
  }

  // ── 마지막 응답 추출 ─────────────────────────────────────────────────────────
  async _extractLatestResponse() {
    // 셀렉터 순서대로 시도, 마지막 요소만 추출
    for (const sel of SEL.response) {
      try {
        const all = await this.page.locator(sel).all();
        if (all.length > 0) {
          const last = all[all.length - 1];
          const text = await last.innerText({ timeout: 5000 });
          if (text.trim().length > 20) return text.trim();
        }
      } catch {}
    }

    // 최후 수단: JS로 추출
    return await this.page.evaluate(() => {
      const candidates = [
        '[data-message-author-role="model"]',
        '.model-response',
        '.response-container',
      ];
      for (const s of candidates) {
        const all = document.querySelectorAll(s);
        const last = all[all.length - 1];
        if (last?.innerText?.trim().length > 20) return last.innerText.trim();
      }
      return '';
    });
  }

  // ── 내부 유틸 ────────────────────────────────────────────────────────────────
  async _findEl(selectors, label) {
    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) return el;
      } catch {}
    }
    throw new Error(`${label} 찾기 실패: ${selectors.join(', ')}`);
  }

  async _tryFind(selectors) {
    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) return el;
      } catch {}
    }
    return null;
  }

  async close() {
    try { await this.context?.close(); } catch {}
    log('🔒', '브라우저 세션 종료');
  }
}
