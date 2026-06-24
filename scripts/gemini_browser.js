/**
 * gemini_browser.js — Playwright 자체 세션으로 Gemini 웹/Gem 멀티턴 대화 자동화
 *
 * GeminiSession:
 *   init()             — 저장된 세션으로 Gemini 접속 (첫 실행 시 로그인 대기)
 *   send(text)         — 새 대화 시작 or 현재 대화에 메시지 추가
 *   newConversation()  — 명시적으로 새 대화 시작
 *   close()            — 브라우저 종료 및 세션 저장
 *
 * Chrome CDP 불필요 — 세션 경로: ~/.gemini-blog-session
 */

import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR  = path.join(os.homedir(), '.gemini-blog-session');
const GEMINI_HOME  = 'https://gemini.google.com/app';

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
    log('🌐', 'Gemini 브라우저 시작... (저장된 세션 사용)');
    this.context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: this.headless,
      viewport: { width: 1280, height: 900 },
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    this.page = this.context.pages()[0] ?? await this.context.newPage();
    await this.page.goto(GEMINI_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await this.page.waitForLoadState('domcontentloaded');

    // 로그인 상태 간단 확인 (계정 인덱스 추출용)
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
    // 페이지 로딩 여유 시간
    await wait(5000);

    // 로그인 판단: URL 기반 + 입력창 존재 여부 (아바타 셀렉터는 Gemini UI 버전마다 달라서 신뢰 불가)
    const isLoggedIn = async () => {
      try {
        const url = this.page.url();
        // Google 로그인 페이지로 리다이렉트된 경우
        if (url.includes('accounts.google.com') || url.includes('/signin')) return false;
        // accounts.google.com 리다이렉트 없이 Gemini 페이지에 있으면 로그인 상태
        if (url.includes('gemini.google.com')) {
          // 입력창이 존재하면 확실히 로그인됨
          const hasInput = await this.page.evaluate(() => {
            return !!(
              document.querySelector('rich-textarea') ||
              document.querySelector('.ql-editor') ||
              document.querySelector('[contenteditable="true"]')
            );
          }).catch(() => false);
          if (hasInput) return true;
          // 입력창 없어도 Gemini 페이지면 로딩 중일 수 있으므로 true 반환 (추가 대기로 해소)
          const hasSignIn = await this.page.evaluate(() =>
            !!document.querySelector('a[href*="accounts.google.com/o/oauth"]')
          ).catch(() => false);
          return !hasSignIn;
        }
        return false;
      } catch {
        return false;
      }
    };

    if (await isLoggedIn()) return; // 세션 유효 → 바로 통과

    // 로그인 필요 — 텔레그램 알림 + 최대 10분 대기
    log('🔐', '구글 계정 로그인이 필요합니다. Chrome 창에서 paydma 계정으로 로그인해 주세요.');
    log('⏳', '로그인 완료를 자동으로 감지합니다 (최대 10분)...');
    sendTelegram('🔐 Gemini 로그인 필요!\n트렌드줌 자동화 Chrome 창에서 paydma 계정으로 로그인해주세요.\n로그인하면 자동으로 재개됩니다.').catch(() => {});

    const deadline = Date.now() + 600_000; // 10분
    while (Date.now() < deadline) {
      await wait(4000);
      if (await isLoggedIn()) {
        log('✅', '로그인 확인 완료');
        const target = this.gemUrl ?? GEMINI_HOME;
        await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await wait(3000);
        return;
      }
    }
    // 10분 초과해도 로그인 안 된 경우 — 오류 throw 대신 최후 시도 후 계속
    log('⚠️', '로그인 감지 10분 초과 — 세션 강제 재시도');
    throw new Error('Gemini 로그인 타임아웃 (10분)');
  }

  // ── 세션 살아있는지 확인 ───────────────────────────────────────────────────
  async isSessionAlive() {
    try {
      const url = this.page.url();
      if (url.includes('accounts.google.com') || url.includes('/signin')) return false;
      const hasInput = await this.page.evaluate((sels) =>
        sels.some((s) => !!document.querySelector(s)), SEL.input
      ).catch(() => false);
      return hasInput;
    } catch {
      return false;
    }
  }

  // ── 새 대화 시작 ─────────────────────────────────────────────────────────────
  async newConversation() {
    const target = this.gemUrl ?? GEMINI_HOME;

    // 세션 죽었으면 재로그인 시도
    if (!(await this.isSessionAlive())) {
      log('⚠️', '세션 만료 감지 → 재이동 시도');
      await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await wait(3000);
      await this._ensureLoggedIn();
    } else {
      await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    await wait(2500);

    // Gem URL에서 "새 채팅" 버튼을 클릭하여 이전 대화 오염 방지
    try {
      const newChatEl = await this._tryFind(SEL.newChat);
      if (newChatEl) {
        await newChatEl.click();
        await wait(1500);
        log('💬', '새 채팅 버튼 클릭 → 대화 초기화');
      }
    } catch { /* 버튼 없으면 URL 이동만으로 초기화된 것으로 간주 */ }

    // 입력창이 실제로 로드될 때까지 대기 (최대 30초)
    // 20분 대기 후 페이지 상태가 불안정한 경우 대응
    const inputDeadline = Date.now() + 30000;
    let inputReady = false;
    while (Date.now() < inputDeadline) {
      inputReady = await this.page.evaluate((sels) =>
        sels.some(s => {
          const el = document.querySelector(s);
          return el && el.getBoundingClientRect().height > 0;
        }), SEL.input
      ).catch(() => false);
      if (inputReady) break;
      await wait(1500);
    }

    if (!inputReady) {
      // 입력창 미로드 → 페이지 새로고침 후 재시도
      log('⚠️', '입력창 미로드 → 새로고침 후 재시도');
      await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await wait(5000);
      await this._ensureLoggedIn();
    }

    this._turnCount = 0;
    log('💬', '새 대화 시작');
  }

  // ── 메시지 전송 (새 대화 or 이어서) ─────────────────────────────────────────
  async send(text, opts = {}) {
    const { timeout = 600000 } = opts; // 10분 기본 타임아웃 (Gemini 검색 그라운딩 대응)

    // 첫 턴이면 새 대화부터 시작
    if (this._turnCount === 0) {
      await this.newConversation();
    }

    this._turnCount++;
    log('📤', `Turn ${this._turnCount} 전송 중... (${text.slice(0, 60).replace(/\n/g, ' ')}...)`);

    // 입력창 찾기
    const inputEl = await this._findEl(SEL.input, '입력창');
    await inputEl.click();
    await wait(500);

    // 텍스트 삽입: execCommand → clipboard+paste → fill 순서로 폴백
    let inserted = false;

    // 1단계: document.execCommand (contenteditable에서 가장 안정적)
    try {
      await this.page.evaluate((t) => {
        const el = document.querySelector('rich-textarea .ql-editor')
          || document.querySelector('[contenteditable="true"][aria-multiline="true"]')
          || document.querySelector('div[role="textbox"][contenteditable="true"]');
        if (el) { el.focus(); document.execCommand('insertText', false, t); }
      }, text);
      await wait(400);
      const len = await inputEl.evaluate((el) => (el.innerText ?? '').trim().length);
      if (len > 5) inserted = true;
    } catch {}

    // 2단계: clipboard + Ctrl+V
    if (!inserted) {
      try {
        await this.page.evaluate((t) => navigator.clipboard.writeText(t), text);
        await inputEl.click();
        await this.page.keyboard.press('Control+v');
        await wait(500);
        const len = await inputEl.evaluate((el) => (el.innerText ?? '').trim().length);
        if (len > 5) inserted = true;
      } catch {}
    }

    // 3단계: Playwright fill (최후 수단)
    if (!inserted) {
      try {
        await inputEl.fill(text);
        await wait(300);
      } catch {}
    }

    await wait(400);

    // 전송 버튼이 활성화될 때까지 최대 5초 대기
    await this.page.waitForFunction(
      (sels) => sels.some((s) => {
        const btn = document.querySelector(s);
        return btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
      }),
      SEL.send,
      { timeout: 5000 }
    ).catch(() => {});

    // 전송
    const sendBtn = await this._tryFind(SEL.send);
    if (sendBtn) {
      const isDisabled = await sendBtn.evaluate(
        (el) => el.disabled || el.getAttribute('aria-disabled') === 'true'
      ).catch(() => false);
      if (!isDisabled) {
        await sendBtn.click();
      } else {
        log('⚠️', '전송 버튼 비활성 → Enter 키로 전송');
        await this.page.keyboard.press('Enter');
      }
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
        // 페이지 닫힘 감지 → 루프 중단 (호출자가 빈 응답 처리)
        if (cur === -1) {
          log('⚠️', '응답 폴링 중 브라우저 오류 감지 → 대기 중단');
          break;
        }
        stable = (cur === prev && cur > 50) ? stable + 1 : 0;
        prev = cur;
      }
    }

    await wait(1500); // 렌더링 여유
  }

  async _getLatestResponseLength() {
    try {
      return await this.page.evaluate((sels) => {
        for (const s of sels) {
          const all = document.querySelectorAll(s);
          const last = all[all.length - 1];
          if (last) return last.innerText?.length ?? 0;
        }
        return 0;
      }, SEL.response);
    } catch {
      return -1; // 페이지 닫힘 신호
    }
  }

  // ── 마지막 응답 추출 ─────────────────────────────────────────────────────────
  async _extractLatestResponse() {
    // 셀렉터 순서대로 시도, 마지막 요소만 추출
    for (const sel of SEL.response) {
      try {
        const all = await this.page.locator(sel).all();
        if (all.length > 0) {
          const last = all[all.length - 1];

          // 1순위: <pre code> textContent 우선 — innerText는 ## 마크다운 기호를 손실시킴
          // (Gemini가 ```markdown``` 코드블록으로 응답 시 <pre><code>에 ## 보존됨)
          const codeText = await last.evaluate((el) => {
            const preCode = el.querySelector('pre code');
            const pre     = el.querySelector('pre');
            const target  = preCode || pre;
            if (target) {
              const t = (target.textContent || '').trim();
              // 코드블록 내용이 충분히 길면 우선 반환
              if (t.length > 300) return t;
            }
            return null;
          }).catch(() => null);

          if (codeText && codeText.length > 300) return codeText;

          // 2순위: innerText 폴백 (코드블록 없는 응답)
          const text = await last.innerText({ timeout: 5000 });
          if (text.trim().length > 20) return text.trim();
        }
      } catch {}
    }

    // 최후 수단: JS로 추출 (페이지 전체에서 가장 긴 <pre> 블록 탐색)
    try {
      return await this.page.evaluate(() => {
        // <pre><code> 안의 긴 콘텐츠 우선 (마크다운 ## 보존)
        const pres = document.querySelectorAll('pre code, pre');
        for (let i = pres.length - 1; i >= 0; i--) {
          const t = (pres[i].textContent || '').trim();
          if (t.length > 300) return t;
        }
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
    } catch {
      return '';
    }
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
    log('🔒', 'Gemini 세션 종료');
  }
}
