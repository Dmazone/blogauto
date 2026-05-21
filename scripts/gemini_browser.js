/**
 * gemini_browser.js — Playwright로 Gemini 웹 UI 자동화
 *
 * - chromium.launchPersistentContext() 사용 → 로그인 세션 자동 저장
 * - 첫 실행 시 브라우저에서 구글 계정 로그인 → 이후 자동
 * - 매 프롬프트마다 새 대화(New Chat) 시작
 */

import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(os.homedir(), '.gemini-blog-session');
const GEMINI_URL  = 'https://gemini.google.com/app';
const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

// Gemini 웹 UI 셀렉터 (구조 변경 시 여기만 수정)
const SEL = {
  // 입력창 — rich-textarea 안의 Quill 에디터
  input: [
    'rich-textarea .ql-editor',
    'div.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][aria-multiline="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ],
  // 전송 버튼
  send: [
    'button[aria-label="Send message"]',
    'button[mattooltip="Send message"]',
    '[data-test-id="send-button"]',
    'button.send-button',
  ],
  // 생성 중단 버튼 (스트리밍 중에만 보임)
  stop: [
    'button[aria-label="Stop generating"]',
    'button[aria-label="Stop response"]',
    '[data-test-id="stop-button"]',
  ],
  // 새 대화 버튼
  newChat: [
    'a[href="/app"]',
    'button[aria-label="New chat"]',
    '[data-test-id="new-chat-button"]',
    'span:has-text("New chat")',
  ],
  // 응답 텍스트 컨테이너
  response: [
    '.model-response-text',
    'model-response .response-content',
    '[data-message-author-role="model"] .markdown-container',
    '.conversation-turn:last-of-type .model-response',
    'message-content model-response',
  ],
};

export class GeminiSession {
  constructor({ headless = false } = {}) {
    this.headless = headless;
    this.context  = null;
    this.page     = null;
  }

  // ── 초기화 ────────────────────────────────────────────────────────────────
  async init() {
    log('🌐', '브라우저 초기화 중...');
    this.context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless:      this.headless,
      viewport:      { width: 1280, height: 900 },
      locale:        'ko-KR',
      timezoneId:    'Asia/Seoul',
    });

    this.page = await this.context.newPage();
    await this.page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this._ensureLoggedIn();
    log('✅', '제미나이 세션 준비 완료');
  }

  async _ensureLoggedIn() {
    // 로그인 페이지로 리다이렉트됐는지 확인
    await this.page.waitForTimeout(2500);
    const url = this.page.url();

    if (url.includes('accounts.google.com') || url.includes('/signin')) {
      console.log('\n');
      log('🔐', '제미나이 로그인이 필요합니다.');
      log('📋', `열린 브라우저에서 구글 계정으로 로그인하세요.`);
      log('⌨️', `로그인 완료 후 이 터미널에서 Enter를 누르세요.\n`);
      await this._waitForEnter();
      await this.page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(3000);
    }
  }

  async _waitForEnter() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question('  → Enter를 누르면 계속합니다... ', () => {
        rl.close();
        resolve();
      });
    });
  }

  // ── 핵심: 프롬프트 전송 → 응답 반환 ─────────────────────────────────────
  async call(prompt, opts = {}) {
    const { timeout = 240000 } = opts; // 4분 기본 타임아웃

    // 새 대화 시작
    await this._startNewChat();

    // 입력창 찾기
    const inputEl = await this._findElement(SEL.input, '입력창');
    await inputEl.click();
    await this.page.waitForTimeout(300);

    // 긴 프롬프트는 클립보드 붙여넣기 (keyboard.type은 느림)
    await this.page.evaluate((text) => {
      const item = new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }) });
      return navigator.clipboard.write([item]);
    }, prompt).catch(async () => {
      // 클립보드 API 실패 시 타입으로 대체
      await inputEl.fill('');
      await inputEl.type(prompt, { delay: 0 });
    });

    // Ctrl+V 붙여넣기
    await this.page.keyboard.press('Control+v');
    await this.page.waitForTimeout(400);

    // 전송
    const sendEl = await this._tryFindElement(SEL.send);
    if (sendEl) {
      await sendEl.click();
    } else {
      await this.page.keyboard.press('Enter');
    }

    // 스트리밍 완료 대기
    await this._waitForResponseComplete(timeout);

    // 응답 추출
    const text = await this._extractResponse();
    if (!text || text.length < 30) {
      throw new Error(`제미나이 응답이 너무 짧습니다 (${text?.length ?? 0}자)`);
    }
    return text;
  }

  async _startNewChat() {
    try {
      const btn = await this._tryFindElement(SEL.newChat);
      if (btn) {
        await btn.click();
        await this.page.waitForTimeout(1500);
      } else {
        await this.page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(1500);
      }
    } catch {
      await this.page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1500);
    }
  }

  async _waitForResponseComplete(timeout) {
    // 1) 응답 시작 대기 (최대 15초)
    await this.page.waitForTimeout(2000);

    // 2) 정지 버튼이 나타날 때까지 잠시 대기
    let stopVisible = false;
    try {
      for (const sel of SEL.stop) {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          stopVisible = true;
          break;
        }
      }
    } catch {}

    // 3) 정지 버튼이 사라질 때까지 대기 (= 스트리밍 완료)
    if (stopVisible) {
      await this.page.waitForFunction(
        (selectors) => {
          for (const s of selectors) {
            if (document.querySelector(s)) return false; // 아직 생성 중
          }
          return true;
        },
        SEL.stop,
        { timeout, polling: 1000 }
      );
    } else {
      // 정지 버튼을 못 찾은 경우 — 응답 길이 안정화 대기
      let prevLen = 0, stableCount = 0;
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline && stableCount < 3) {
        await this.page.waitForTimeout(3000);
        const curLen = await this._getResponseLength();
        if (curLen === prevLen && curLen > 50) {
          stableCount++;
        } else {
          stableCount = 0;
          prevLen = curLen;
        }
      }
    }

    await this.page.waitForTimeout(1200); // 최종 렌더링 여유
  }

  async _getResponseLength() {
    return await this.page.evaluate((selectors) => {
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el.innerText.length;
      }
      return 0;
    }, SEL.response);
  }

  async _extractResponse() {
    // 여러 셀렉터 순서대로 시도
    for (const sel of SEL.response) {
      try {
        const els = await this.page.locator(sel).all();
        if (els.length > 0) {
          const texts = await Promise.all(els.map((e) => e.innerText().catch(() => '')));
          const joined = texts.join('\n').trim();
          if (joined.length > 30) return joined;
        }
      } catch {}
    }

    // 최후 수단: 페이지 전체에서 마지막 모델 응답 블록 추출
    return await this.page.evaluate(() => {
      // 코드블록 보존을 위해 markdown 컨테이너 우선
      const all = document.querySelectorAll(
        '[data-message-author-role="model"], .model-response, .response-container'
      );
      if (all.length === 0) return '';
      return all[all.length - 1]?.innerText?.trim() ?? '';
    });
  }

  // ── 헬퍼 ─────────────────────────────────────────────────────────────────
  async _findElement(selectors, label = '요소') {
    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 4000 })) return el;
      } catch {}
    }
    throw new Error(`${label}을(를) 찾지 못했습니다. 셀렉터: ${selectors.join(' | ')}`);
  }

  async _tryFindElement(selectors) {
    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) return el;
      } catch {}
    }
    return null;
  }

  // ── 종료 ─────────────────────────────────────────────────────────────────
  async close() {
    try { await this.context?.close(); } catch {}
  }
}
