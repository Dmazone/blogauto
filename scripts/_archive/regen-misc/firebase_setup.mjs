/**
 * firebase_setup.mjs — Firebase Realtime Database 설정 자동화
 * DMaru 프로젝트(dmaru-7148b)에 Realtime DB 추가
 */

import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
import { sendTelegram } from './telegram.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(os.homedir(), '.gemini-blog-session');
const CONFIG_PATH = path.join(__dirname, '..', 'config.toml');

const PROJECT_ID  = 'dmaru-7148b';
const DB_NAME     = `${PROJECT_ID}-default-rtdb`;
const FALLBACK_DB = `https://${DB_NAME}.firebaseio.com`;

const wait = ms => new Promise(r => setTimeout(r, ms));
const log  = (e, m) => console.log(`${e}  ${m}`);
const snap = async (page, name) => {
  await page.screenshot({ path: `data/fb_${name}.png` });
  log('📸', name);
};

function updateConfig(dbUrl) {
  let toml = readFileSync(CONFIG_PATH, 'utf-8');
  toml = toml.replace(/firebaseDbUrl\s*=\s*"[^"]*"/, `firebaseDbUrl = "${dbUrl}"`);
  writeFileSync(CONFIG_PATH, toml, 'utf-8');
  log('📝', `config.toml → ${dbUrl}`);
}

// 텍스트로 버튼 찾아 클릭 (children 무관)
async function evalClickByText(page, re) {
  return page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    const found = [...document.querySelectorAll('button, a[role="button"], mat-button, [role="button"]')]
      .find(el => re.test(el.textContent.trim()) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    if (found) { found.click(); return found.textContent.trim().slice(0, 30); }
    return null;
  }, re.source || String(re).replace(/^\/|\/[gimsuy]*$/g, ''));
}

async function main() {
  log('🚀', `Firebase DB 설정 시작 (${PROJECT_ID})`);

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // ── 1. Realtime Database 페이지 이동 ────────────────────────────
    await page.goto(
      `https://console.firebase.google.com/project/${PROJECT_ID}/database`,
      { waitUntil: 'networkidle', timeout: 30000 }
    );
    await wait(3000);
    await snap(page, '01_start');

    // ── 2. 기존 DB 확인 ─────────────────────────────────────────────
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const existingUrl = bodyText.match(/https:\/\/[\w-]+-default-rtdb[^\s"'\n]*/);
    if (existingUrl) {
      const url = existingUrl[0].replace(/\/+$/, '');
      log('✅', `DB 이미 존재: ${url}`);
      updateConfig(url);
      await setupRules(page);
      await sendTelegram(`✅ Firebase DB 이미 존재 — 규칙 갱신 완료\n${url}`).catch(() => {});
      return;
    }

    // ── 3. "데이터베이스 만들기" 버튼 클릭 ──────────────────────────
    log('🆕', '"데이터베이스 만들기" 클릭');

    // 방법 A: Playwright locator
    let clicked = false;
    try {
      await page.locator('button', { hasText: '데이터베이스 만들기' }).first().click({ timeout: 5000 });
      clicked = true;
      log('✅', 'locator 클릭 성공');
    } catch {}

    if (!clicked) {
      // 방법 B: getByText
      try {
        await page.getByText('데이터베이스 만들기', { exact: true }).first().click({ timeout: 3000 });
        clicked = true;
        log('✅', 'getByText 클릭 성공');
      } catch {}
    }

    if (!clicked) {
      // 방법 C: evaluate (children 무관)
      const res = await evalClickByText(page, /데이터베이스 만들기/i);
      if (res) { clicked = true; log('✅', `evaluate 클릭: ${res}`); }
    }

    if (!clicked) {
      // 방법 D: 좌표 클릭 (스크린샷 기준 버튼 위치 약 355,323)
      log('⚠️', '좌표 클릭 시도 (355, 323)');
      await page.mouse.click(355, 323);
      clicked = true;
    }

    await wait(2000);
    await snap(page, '02_dialog');

    // ── 4. 위치 선택 다이얼로그 → "다음" ────────────────────────────
    let nextRes = null;
    try {
      await page.locator('button', { hasText: '다음' }).first().click({ timeout: 4000 });
      nextRes = '다음';
    } catch {
      nextRes = await evalClickByText(page, /^다음$/i);
    }
    log('🖱️', `다음: ${nextRes}`);
    await wait(1000);
    await snap(page, '03_security');

    // ── 5. 보안 규칙: 테스트 모드 선택 ─────────────────────────────
    const testClicked = await page.evaluate(() => {
      // mat-radio-group 안에서 "테스트 모드" 라디오 찾기
      const all = [...document.querySelectorAll('*')];
      for (const el of all) {
        if (/테스트 모드|test mode/i.test(el.textContent) && !el.textContent.includes('잠긴 모드')) {
          // mat-radio-button 조상 찾기
          let t = el;
          for (let i = 0; i < 8; i++) {
            const tag = t.tagName.toLowerCase();
            if (tag === 'mat-radio-button') {
              t.querySelector('input[type="radio"]')?.click();
              t.click();
              return true;
            }
            if (!t.parentElement) break;
            t = t.parentElement;
          }
          el.click();
          return true;
        }
      }
      return false;
    });
    log('🔘', `테스트 모드: ${testClicked}`);
    await wait(500);

    // ── 6. "사용 설정" / "완료" 클릭 ────────────────────────────────
    let enableRes = null;
    try {
      await page.locator('button', { hasText: '사용 설정' }).first().click({ timeout: 4000 });
      enableRes = '사용 설정';
    } catch {
      try {
        await page.locator('button', { hasText: '완료' }).first().click({ timeout: 2000 });
        enableRes = '완료';
      } catch {
        enableRes = await evalClickByText(page, /사용 설정|사용설정|enable/i);
      }
    }
    log('🖱️', `사용 설정: ${enableRes}`);
    await wait(8000); // DB 생성 대기

    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await wait(2000);
    await snap(page, '04_db_ready');

    // ── 7. 생성된 DB URL 추출 ────────────────────────────────────────
    const afterText = await page.locator('body').innerText().catch(() => '');
    const urlMatch  = afterText.match(/https:\/\/[\w-]+-default-rtdb[^\s"'\n]*/);
    const finalUrl  = urlMatch ? urlMatch[0].replace(/\/+$/, '') : FALLBACK_DB;
    log('🔗', `DB URL: ${finalUrl}`);
    updateConfig(finalUrl);

    // ── 8. 보안 규칙 설정 ────────────────────────────────────────────
    await setupRules(page);

    // ── 9. 완료 ─────────────────────────────────────────────────────
    const msg = [
      '✅ Firebase Realtime DB 설정 완료!',
      `프로젝트: ${PROJECT_ID}`,
      `DB URL: ${finalUrl}`,
      '각 포스팅에 👁 조회수 카운터가 활성화됩니다.',
    ].join('\n');
    log('🎉', msg);
    await sendTelegram(msg).catch(() => {});

  } catch (err) {
    log('❌', err.stack || err.message);
    await snap(page, 'error').catch(() => {});
    await sendTelegram(`❌ Firebase 오류: ${err.message}`).catch(() => {});
  } finally {
    await wait(2000);
    await context.close();
  }
}

async function setupRules(page) {
  log('🔒', '보안 규칙 설정 시작');
  await page.goto(
    `https://console.firebase.google.com/project/${PROJECT_ID}/database/${DB_NAME}/rules`,
    { waitUntil: 'networkidle', timeout: 20000 }
  ).catch(() => {});
  await wait(3000);
  await snap(page, '05_rules_page');

  const publicRules = '{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}';

  const injected = await page.evaluate((rules) => {
    // 방법 1: CodeMirror
    const cms = document.querySelectorAll('.CodeMirror');
    for (const cm of cms) {
      if (cm.CodeMirror) {
        cm.CodeMirror.setValue(rules);
        return 'CodeMirror';
      }
    }
    // 방법 2: Monaco editor
    if (window.monaco) {
      const models = window.monaco.editor.getModels();
      if (models.length > 0) {
        models[0].setValue(rules);
        return 'Monaco';
      }
    }
    // 방법 3: contenteditable
    const editors = document.querySelectorAll('[contenteditable="true"]');
    for (const ed of editors) {
      ed.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, rules);
      return 'contenteditable';
    }
    // 방법 4: textarea
    const ta = document.querySelector('textarea');
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, rules);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      return 'textarea';
    }
    return null;
  }, publicRules);

  log(injected ? '✅' : '⚠️', `규칙 에디터: ${injected}`);
  await wait(800);

  // 게시 버튼
  let publishRes = null;
  try {
    await page.locator('button', { hasText: '게시' }).first().click({ timeout: 3000 });
    publishRes = '게시 버튼';
  } catch {
    publishRes = await evalClickByText(page, /^게시$|^publish$/i);
  }
  log('📤', `게시: ${publishRes}`);
  await wait(1500);

  // 확인 다이얼로그
  await page.evaluate(() => {
    const ok = [...document.querySelectorAll('button')]
      .find(b => /게시|publish|확인|ok/i.test(b.textContent.trim()) && !b.disabled);
    if (ok) ok.click();
  });
  await wait(2000);
  await snap(page, '06_rules_done');
  log('✅', '규칙 게시 완료');
}

main();
