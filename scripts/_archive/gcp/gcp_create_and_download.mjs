/**
 * gcp_create_and_download.mjs
 * OAuth credential 생성 즉시 Playwright download 이벤트로 JSON 캡처
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION   = path.join(os.homedir(), '.gemini-blog-session');
const ENV_FILE  = path.join(__dirname, '..', '.env');
const SAVE_PATH = path.join(__dirname, '..', 'data', 'blogauto_secret.json');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/cad_${name}.png` });
  console.log(`📸 ${name}`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    // Playwright download 이벤트 활성화
    acceptDownloads: true,
  });
  const p = await ctx.newPage();

  // 1. 생성 폼
  console.log('1️⃣ 생성 폼 이동...');
  await p.goto(
    'https://console.cloud.google.com/auth/clients/create?project=gws-workspace-60127',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '01_form');

  // 2. cfc-select 드롭다운 열기
  console.log('2️⃣ 드롭다운 클릭...');
  try {
    await p.locator('cfc-select').first().click({ timeout: 5000 });
    console.log('  ✅ cfc-select 클릭');
  } catch {
    await p.evaluate(() => {
      const el = document.querySelector('cfc-select') || document.querySelector('[role="combobox"]');
      if (el) el.click();
    });
  }
  await wait(1500);

  // 3. 데스크톱 앱 선택
  console.log('3️⃣ 데스크톱 앱 선택...');
  const selected = await p.evaluate(() => {
    const opts = [...document.querySelectorAll('[role="option"], mat-option, cfc-option')];
    for (const o of opts) {
      if (o.textContent?.includes('데스크톱') || o.textContent?.includes('Desktop')) {
        o.click();
        return o.textContent?.trim();
      }
    }
    return null;
  });
  console.log('  선택:', selected);
  await wait(1000);
  await snap(p, '02_type_selected');

  // 4. 이름 입력
  console.log('4️⃣ 이름 입력...');
  const ts = Date.now().toString().slice(-4);
  const credName = `BlogAutoYT${ts}`;
  const filled = await p.evaluate((name) => {
    function fill(root) {
      for (const inp of root.querySelectorAll('input')) {
        if (!inp.readOnly && inp.type !== 'search' && inp.offsetParent !== null) {
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (niv) { niv.call(inp, name); inp.dispatchEvent(new Event('input', { bubbles: true })); }
          else { inp.value = name; inp.dispatchEvent(new InputEvent('input', { bubbles: true })); }
          return inp.id || 'ok';
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = fill(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return fill(document.body);
  }, credName);
  console.log('  이름:', credName, '→', filled);
  await wait(500);

  // 5. 만들기 + download 이벤트 동시 대기
  console.log('5️⃣ 만들기 클릭 + download 이벤트 대기...');

  // download 이벤트를 먼저 설정
  const downloadPromise = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);

  // 만들기 클릭
  await p.evaluate(() => {
    function find(root) {
      for (const btn of root.querySelectorAll('button')) {
        const t = btn.textContent?.trim();
        if (t === '만들기' || t === 'Create') { btn.click(); return t; }
      }
      for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) find(el.shadowRoot); }
    }
    find(document.body);
  });
  await wait(4000);
  await snap(p, '03_dialog');

  // 6. JSON 다운로드 버튼 클릭
  console.log('6️⃣ JSON 다운로드 클릭...');
  const dlClicked = await p.evaluate(() => {
    function scan(root) {
      for (const el of root.querySelectorAll('button, a, [role="button"]')) {
        const t = el.textContent?.trim() || '';
        const l = el.getAttribute('aria-label') || '';
        if (t.includes('JSON 다운로드') || t.includes('Download JSON') ||
            t.includes('다운로드') || l.includes('JSON') || l.includes('다운로드')) {
          el.click();
          return t || l || 'ok';
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const r = scan(el.shadowRoot);
          if (r) return r;
        }
      }
      return null;
    }
    return scan(document.body);
  });
  console.log('  클릭:', dlClicked);

  // 7. 다운로드 파일 저장
  const download = await downloadPromise;
  if (download) {
    console.log('\n✅ 다운로드 이벤트 감지!', download.suggestedFilename());
    await download.saveAs(SAVE_PATH);
    console.log('저장:', SAVE_PATH);

    const json = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
    const inst = json.installed || json.web || {};
    console.log('\nClient ID:', inst.client_id);
    console.log('Secret:', inst.client_secret?.slice(0, 12) + '...');

    if (inst.client_id && inst.client_secret) {
      let env = fs.readFileSync(ENV_FILE, 'utf-8');
      env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${inst.client_id}`)
               .replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${inst.client_secret}`);
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('✅ .env 업데이트 완료!');
      console.log('\n다음 단계:');
      console.log('  1. node scripts/gcp_add_testuser_gws.mjs  ← 테스트 사용자 추가');
      console.log('  2. node scripts/yt_auth.mjs               ← OAuth 인증');
    }
  } else {
    console.log('⚠️ download 이벤트 없음 → 스크린샷 확인');
    await snap(p, '04_no_download');

    // 페이지에서 secret 텍스트 추출 시도
    const txt = await p.evaluate(() => document.body.innerText);
    const cid = txt.match(/(\d{12,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
    const sec = txt.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/)?.[1];
    console.log('페이지 CID:', cid ?? '없음');
    console.log('페이지 SECRET:', sec ?? '없음');

    if (cid) {
      let env = fs.readFileSync(ENV_FILE, 'utf-8');
      env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${cid}`);
      if (sec) env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${sec}`);
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('.env CLIENT_ID 업데이트 (secret은 여전히 필요)');
    }
  }

  await wait(10000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
