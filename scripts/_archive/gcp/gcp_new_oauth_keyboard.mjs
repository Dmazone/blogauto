/**
 * gcp_new_oauth_keyboard.mjs — gws-workspace에 새 OAuth credential 생성
 * cfc-select 키보드 조작 + 네트워크 인터셉트로 secret 추출
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
  await p.screenshot({ path: `data/newcred_${name}.png` });
  console.log(`📸 ${name}`);
};

async function main() {
  let netSecret = null;

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // 네트워크 감시
  p.on('response', async (res) => {
    if (!res.url().includes('googleapis') && !res.url().includes('cloud.google')) return;
    try {
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const text = await res.text().catch(() => '');
      const m = text.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/);
      if (m) { netSecret = m[1]; console.log('\n🎯 네트워크 secret:', netSecret); }
    } catch {}
  });

  // 1. gws-workspace 프로젝트 credential 생성 폼
  console.log('1️⃣ OAuth 클라이언트 생성 폼...');
  await p.goto(
    'https://console.cloud.google.com/auth/clients/create?project=gws-workspace-60127',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '01_form');

  // 2. cfc-select 클릭 (여러 방법 시도)
  console.log('2️⃣ 드롭다운 클릭...');

  // 2a. cfc-select 직접 클릭
  try {
    await p.locator('cfc-select').first().click({ timeout: 5000 });
    console.log('  ✅ cfc-select 직접 클릭');
  } catch {
    // 2b. 화면 중앙 드롭다운 영역 클릭 (좌표)
    try {
      await p.click('xpath=//cfc-select', { timeout: 3000 });
    } catch {
      // 2c. JS로 클릭
      await p.evaluate(() => {
        const el = document.querySelector('cfc-select') || document.querySelector('[role="combobox"]');
        if (el) el.click();
      });
    }
  }
  await wait(2000);
  await snap(p, '02_dropdown');

  // 3. 옵션 확인 및 선택
  console.log('3️⃣ Desktop App 옵션 선택...');
  const opts = await p.evaluate(() => {
    const all = [];
    // overlay container에 옵션이 렌더링됨
    const overlayItems = [
      ...document.querySelectorAll('.cdk-overlay-container [role="option"]'),
      ...document.querySelectorAll('.cdk-overlay-container cfc-option'),
      ...document.querySelectorAll('.cdk-overlay-container li'),
      ...document.querySelectorAll('[role="listbox"] [role="option"]'),
      ...document.querySelectorAll('[role="option"]'),
      ...document.querySelectorAll('cfc-option'),
    ];
    overlayItems.forEach(el => all.push({ text: el.textContent?.trim(), tag: el.tagName }));
    return [...new Set(all.map(o => JSON.stringify(o)))].map(s => JSON.parse(s));
  });
  console.log('  옵션:', JSON.stringify(opts));

  if (opts.length === 0) {
    // 키보드 Enter로 다시 열기
    await p.keyboard.press('Enter');
    await wait(1000);
    await p.keyboard.press('Space');
    await wait(1000);
    await snap(p, '03_keyboard_open');

    const opts2 = await p.evaluate(() => {
      return [...document.querySelectorAll('[role="option"], cfc-option')].map(el => el.textContent?.trim());
    });
    console.log('  키보드 후 옵션:', opts2);
  }

  // Desktop 옵션 선택
  const desktopClicked = await p.evaluate(() => {
    const targets = [...document.querySelectorAll('[role="option"], cfc-option, li')];
    for (const el of targets) {
      const t = el.textContent?.trim() || '';
      if (t.includes('Desktop') || t.includes('데스크톱')) {
        el.click();
        return t;
      }
    }
    return null;
  });
  if (desktopClicked) {
    console.log('  ✅ 선택:', desktopClicked);
  } else {
    // 키보드 arrow down으로 선택
    console.log('  ⚠️ JS 선택 실패, 키보드 시도...');
    await p.keyboard.press('ArrowDown');
    await wait(300);
    await p.keyboard.press('ArrowDown');
    await wait(300);
    await snap(p, '03_arrow');
    await p.keyboard.press('Enter');
    await wait(500);
  }
  await wait(1000);
  await snap(p, '04_type_selected');

  // 4. 이름 입력 (Desktop 선택 후 name 필드 나타남)
  console.log('4️⃣ 이름 입력...');
  const nameOk = await p.evaluate(() => {
    function fill(root) {
      for (const inp of root.querySelectorAll('input')) {
        if (!inp.readOnly && inp.type !== 'search' && inp.offsetParent !== null) {
          inp.focus();
          inp.value = 'BlogAuto';
          inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
          return inp.id || 'ok';
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = fill(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return fill(document.body);
  });
  console.log('  이름 입력:', nameOk);
  await wait(500);
  await snap(p, '05_name');

  // 5. 만들기 버튼
  console.log('5️⃣ 만들기 클릭...');
  const createOk = await p.evaluate(() => {
    function find(root) {
      for (const btn of root.querySelectorAll('button')) {
        const t = btn.textContent?.trim();
        if (t === '만들기' || t === 'Create') { btn.click(); return t; }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = find(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return find(document.body);
  });
  console.log('  만들기 클릭:', createOk);
  await wait(6000);
  await snap(p, '06_result');

  // 6. 추출
  const pageText = await p.evaluate(() => {
    const parts = [];
    function ex(root) {
      for (const n of root.childNodes) {
        if (n.nodeType === 3) parts.push(n.textContent);
        if (n.shadowRoot) ex(n.shadowRoot);
        if (n.childNodes?.length) for (const c of n.childNodes) if (c !== n) ex(c);
      }
    }
    ex(document.body);
    return parts.join(' ');
  });

  const cid = pageText.match(/(\d{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
  const sec = netSecret || pageText.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/)?.[1];
  console.log('\nClient ID:', cid ?? '없음');
  console.log('Secret:', sec ? '✅ 발견' : '없음');

  if (cid || sec) {
    let env = fs.readFileSync(ENV_FILE, 'utf-8');
    if (cid) {
      env = env.match(/^YOUTUBE_CLIENT_ID=/m)
        ? env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${cid}`)
        : env + `\nYOUTUBE_CLIENT_ID=${cid}\n`;
    }
    if (sec) {
      env = env.match(/^YOUTUBE_CLIENT_SECRET=/m)
        ? env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${sec}`)
        : env + `YOUTUBE_CLIENT_SECRET=${sec}\n`;
    }
    fs.writeFileSync(ENV_FILE, env, 'utf-8');
    console.log('✅ .env 저장!');
  } else {
    console.log('→ data/newcred_06_result.png 확인');
  }

  await wait(25000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
