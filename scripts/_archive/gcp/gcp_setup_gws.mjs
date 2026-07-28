/**
 * gcp_setup_gws.mjs
 * 1. Downloads에서 최신 client_secret JSON 찾아서 .env 업데이트
 * 2. gws-workspace 프로젝트에 paydma@gmail.com 테스트 사용자 추가
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION   = path.join(os.homedir(), '.gemini-blog-session');
const ENV_FILE  = path.join(__dirname, '..', '.env');
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/gws_${name}.png` });
  console.log(`📸 ${name}`);
};

// --- Step 1: Downloads에서 최신 JSON 읽기 ---
function readLatestSecret() {
  const files = fs.readdirSync(DOWNLOADS)
    .filter(f => f.startsWith('client_secret') && f.endsWith('.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DOWNLOADS, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  console.log('Downloads JSON 목록:', files.map(f => f.name));
  if (!files.length) { console.log('⚠️ client_secret JSON 없음'); return null; }

  const latestPath = path.join(DOWNLOADS, files[0].name);
  const json = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
  const inst = json.installed || json.web || {};
  return { client_id: inst.client_id, client_secret: inst.client_secret, file: files[0].name };
}

async function updateEnv(cid, sec) {
  let env = fs.readFileSync(ENV_FILE, 'utf-8');
  env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${cid}`)
           .replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${sec}`);
  fs.writeFileSync(ENV_FILE, env, 'utf-8');
  console.log('✅ .env 업데이트 완료');
  console.log('  CLIENT_ID:', cid);
  console.log('  SECRET:', sec?.slice(0, 12) + '...');
}

// --- Step 2: gws-workspace 테스트 사용자 추가 ---
async function addTestUser() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  console.log('\n2️⃣ gws-workspace 대상(Audience) 페이지...');
  await p.goto(
    'https://console.cloud.google.com/auth/audience?project=gws-workspace-60127',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '01_audience');

  const bodyText = await p.evaluate(() => document.body.innerText);
  console.log('페이지 확인:', bodyText.slice(0, 200));

  // 이미 paydma가 있는지 확인
  if (bodyText.includes('paydma@gmail.com')) {
    console.log('✅ paydma@gmail.com 이미 테스트 사용자로 등록됨');
    await ctx.close();
    return;
  }

  // "사용자 추가" 버튼 클릭
  console.log('사용자 추가 버튼 탐색...');
  const addBtn = await p.evaluate(() => {
    function scan(root) {
      for (const btn of root.querySelectorAll('button, [role="button"]')) {
        const t = btn.textContent?.trim() || '';
        const l = btn.getAttribute('aria-label') || '';
        if (t.includes('사용자 추가') || t.includes('Add users') || t.includes('Add test') ||
            l.includes('사용자 추가') || l.includes('Add')) {
          btn.scrollIntoView();
          btn.click();
          return t || l;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = scan(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return scan(document.body);
  });
  console.log('클릭:', addBtn);
  await wait(2000);
  await snap(p, '02_add_dialog');

  // 이메일 입력
  const emailFilled = await p.evaluate(() => {
    function fill(root) {
      for (const inp of root.querySelectorAll('input, textarea')) {
        const placeholder = inp.placeholder || '';
        const type = inp.type || '';
        if (type === 'email' || placeholder.includes('이메일') ||
            placeholder.toLowerCase().includes('email') || placeholder.includes('사용자')) {
          inp.focus();
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(inp, 'paydma@gmail.com');
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            inp.value = 'paydma@gmail.com';
            inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
          return `filled:${placeholder || type}`;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = fill(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return fill(document.body);
  });
  console.log('이메일 입력:', emailFilled);

  if (!emailFilled) {
    // Playwright 직접 입력 시도
    try {
      await p.locator('input[type="email"]').first().fill('paydma@gmail.com', { timeout: 3000 });
      console.log('  ✅ locator fill 성공');
    } catch {
      await p.keyboard.type('paydma@gmail.com');
      console.log('  ⌨️ keyboard type');
    }
  }
  await wait(1000);
  await snap(p, '03_email');

  // 추가/저장 버튼
  const saved = await p.evaluate(() => {
    function scan(root) {
      for (const btn of root.querySelectorAll('button')) {
        const t = btn.textContent?.trim() || '';
        if (t === '추가' || t === 'Add' || t === '저장' || t === 'Save') {
          btn.click();
          return t;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) { const r = scan(el.shadowRoot); if (r) return r; }
      }
      return null;
    }
    return scan(document.body);
  });
  console.log('저장 버튼:', saved);
  await wait(3000);
  await snap(p, '04_saved');

  const final = await p.evaluate(() => document.body.innerText);
  if (final.includes('paydma@gmail.com')) {
    console.log('\n✅ 테스트 사용자 추가 완료!');
  } else {
    console.log('\n페이지 상태:', final.slice(-400));
  }

  await wait(8000);
  await ctx.close();
}

// --- 메인 ---
async function main() {
  // 1. JSON에서 credential 읽기
  const creds = readLatestSecret();
  if (creds) {
    console.log(`\n파일: ${creds.file}`);
    console.log('Client ID:', creds.client_id);
    console.log('Secret:', creds.client_secret ? '✅' : '없음');
    if (creds.client_id && creds.client_secret) {
      await updateEnv(creds.client_id, creds.client_secret);
    }
  } else {
    console.log('⚠️ JSON 없음 — JSON 다운로드 후 재실행 필요');
  }

  // 2. 테스트 사용자 추가
  await addTestUser();
  console.log('\n완료! 이제 node scripts/yt_auth.mjs 실행 가능');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
