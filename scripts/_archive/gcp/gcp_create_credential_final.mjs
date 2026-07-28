/**
 * gcp_create_credential_final.mjs — cfc-select 처리 + 신규 OAuth credential 생성
 * client_id + client_secret을 생성 직후 다이얼로그에서 추출
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION   = path.join(os.homedir(), '.gemini-blog-session');
const ENV_FILE  = path.join(__dirname, '..', '.env');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/final_${name}.png` });
  console.log(`📸 ${name}`);
};

async function main() {
  // 네트워크 인터셉트 설정
  let networkSecret = null;

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 1000 },
  });
  const p = await ctx.newPage();

  // 모든 API 응답 감시
  p.on('response', async (res) => {
    if (!res.url().includes('googleapis') && !res.url().includes('cloud.google.com')) return;
    try {
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const text = await res.text().catch(() => '');
      const m = text.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/);
      if (m) {
        networkSecret = m[1];
        console.log('\n🎯 네트워크 secret:', networkSecret);
      }
    } catch {}
  });

  // 1. OAuth 클라이언트 생성 폼으로 이동
  console.log('1️⃣ OAuth 클라이언트 생성 폼...');
  await p.goto(
    'https://console.cloud.google.com/auth/clients/create?project=gws-workspace-60127',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '01_form');

  // 2. cfc-select 클릭 (애플리케이션 유형 드롭다운)
  console.log('2️⃣ cfc-select 드롭다운 클릭...');
  const cfcClicked = await p.evaluate(() => {
    const cfc = document.querySelector('cfc-select');
    if (cfc) {
      cfc.click();
      cfc.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      cfc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      cfc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return `cfc-select found: id=${cfc.id}`;
    }
    // div[role=combobox] 시도
    const combo = document.querySelector('[role="combobox"]');
    if (combo) {
      combo.click();
      return `combobox div found`;
    }
    return null;
  });
  console.log('  cfc-select 클릭:', cfcClicked);
  await wait(2000);
  await snap(p, '02_dropdown_open');

  // 3. 드롭다운 옵션 확인 및 선택
  console.log('3️⃣ 옵션 탐색 및 선택...');
  const optionInfo = await p.evaluate(() => {
    // 가능한 option 셀렉터들
    const selectors = ['[role="option"]', 'li[role="option"]', 'cfc-option', '.cfc-option', 'mat-option'];
    const found = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        found.push({ sel, text: el.textContent?.trim(), visible: el.offsetParent !== null });
      }
    }
    return found;
  });
  console.log('  옵션들:', JSON.stringify(optionInfo));

  // Desktop 옵션 선택
  let desktopSelected = false;
  for (const opt of optionInfo) {
    if (opt.text?.includes('Desktop') || opt.text?.includes('데스크톱')) {
      const clicked = await p.evaluate((sel) => {
        for (const el of document.querySelectorAll(sel)) {
          if (el.textContent?.includes('Desktop') || el.textContent?.includes('데스크톱')) {
            el.click();
            return true;
          }
        }
        return false;
      }, opt.sel);
      if (clicked) {
        desktopSelected = true;
        console.log('  ✅ Desktop 선택:', opt.text);
        break;
      }
    }
  }

  if (!desktopSelected) {
    // 키보드로 시도: 드롭다운 이후 Tab + Down arrow
    console.log('  ⚠️ 옵션 못 찾음, 키보드 시도...');
    await p.keyboard.press('Tab');
    await wait(500);
    await p.keyboard.press('ArrowDown');
    await wait(500);
    await snap(p, '03_keyboard');

    const optAfterKey = await p.evaluate(() => {
      const opts = [];
      ['[role="option"]', 'cfc-option', 'li'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.textContent?.trim()) opts.push(el.textContent.trim().slice(0, 40));
        });
      });
      return opts;
    });
    console.log('  키보드 후 옵션:', optAfterKey.slice(0, 10));

    // Enter로 선택
    await p.keyboard.press('Enter');
    await wait(500);
  }

  await wait(1000);
  await snap(p, '04_type_selected');

  // 4. 이름 입력 필드 탐색
  console.log('4️⃣ 이름 입력...');
  // cfc-text-field 또는 input
  const nameInputted = await p.evaluate(() => {
    // cfc 컴포넌트 내부 탐색
    function findInput(root) {
      for (const inp of root.querySelectorAll('input[type="text"], input:not([type])')) {
        if (!inp.readOnly && inp.offsetParent !== null) {
          inp.focus();
          inp.value = 'BlogAuto Desktop';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return inp.id || inp.name || 'unnamed input';
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const r = findInput(el.shadowRoot);
          if (r) return r;
        }
      }
      return null;
    }
    return findInput(document.body);
  });
  console.log('  이름 입력 결과:', nameInputted ?? '없음');
  await wait(500);
  await snap(p, '05_name');

  // 5. 만들기 버튼
  console.log('5️⃣ 만들기 버튼 클릭...');
  const createClicked = await p.evaluate(() => {
    function findCreate(root) {
      for (const btn of root.querySelectorAll('button[type="submit"], button')) {
        const t = btn.textContent?.trim();
        if (t === '만들기' || t === 'Create' || t === 'CREATE') {
          btn.click();
          return t;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const r = findCreate(el.shadowRoot);
          if (r) return r;
        }
      }
      return null;
    }
    return findCreate(document.body);
  });
  console.log('  만들기 클릭:', createClicked ?? '버튼 없음');
  await wait(5000);
  await snap(p, '06_after_create');

  // 6. 결과 추출 (다이얼로그 또는 네트워크)
  console.log('6️⃣ credential 추출...');

  if (networkSecret) {
    console.log('✅ 네트워크에서 발견:', networkSecret);
  }

  const pageText = await p.evaluate(() => {
    // 전체 DOM (shadow 포함)
    const parts = [];
    function extract(root) {
      for (const n of root.childNodes) {
        if (n.nodeType === 3) parts.push(n.textContent);
        if (n.shadowRoot) extract(n.shadowRoot);
        for (const c of (n.childNodes || [])) {
          if (c !== n) extract(c);
        }
      }
    }
    extract(document.body);
    return parts.join(' ');
  });

  const clientId = pageText.match(/(\d{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
  const clientSecret = networkSecret || pageText.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/)?.[1];

  console.log('Client ID:', clientId ?? '없음');
  console.log('Client Secret:', clientSecret ? '✅ 발견' : '없음');

  if (clientId || clientSecret) {
    let env = fs.readFileSync(ENV_FILE, 'utf-8');
    if (clientId) {
      if (env.match(/^YOUTUBE_CLIENT_ID=/m)) {
        env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${clientId}`);
      } else {
        env += `\nYOUTUBE_CLIENT_ID=${clientId}\n`;
      }
    }
    if (clientSecret) {
      if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
        env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${clientSecret}`);
      } else {
        env += `YOUTUBE_CLIENT_SECRET=${clientSecret}\n`;
      }
    }
    fs.writeFileSync(ENV_FILE, env, 'utf-8');
    console.log('✅ .env 저장 완료!');
    console.log('다음: node scripts/yt_auth.mjs');
  } else {
    console.log('\n❌ 자동 추출 실패');
    console.log('스크린샷: data/final_06_after_create.png 확인');
  }

  await wait(30000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
