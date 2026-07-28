/**
 * gcp_download_blogauto_json.mjs
 * gws-workspace BlogAuto credential 상세 페이지에서 JSON 다운로드
 * 없으면 새 secret 생성 후 즉시 캡처
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
const CLIENT_ID = '796897570385-62jaahhns4nl0983vicmp5chcauj3ijv.apps.googleusercontent.com';
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (p, name) => {
  await p.screenshot({ path: `data/dl_${name}.png` });
  console.log(`📸 ${name}`);
};

async function findNewDownload(beforeFiles) {
  for (let i = 0; i < 10; i++) {
    await wait(1000);
    const after = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith('.json'));
    const newFile = after.find(f => !beforeFiles.includes(f) && f.includes('client_secret'));
    if (newFile) { console.log('📥 다운로드:', newFile); return path.join(DOWNLOADS, newFile); }
  }
  return null;
}

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
  p.on('response', async res => {
    if (!res.url().includes('cloud.google') && !res.url().includes('googleapis')) return;
    try {
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const text = await res.text().catch(() => '');
      const m = text.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/);
      if (m) { netSecret = m[1]; console.log('🎯 네트워크 secret:', netSecret); }
    } catch {}
  });

  const beforeDownloads = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith('.json'));

  // 1. credential 상세/편집 페이지
  const detailUrl = `https://console.cloud.google.com/auth/clients/${encodeURIComponent(CLIENT_ID)}?project=gws-workspace-60127`;
  console.log('1️⃣ credential 상세 페이지...');
  await p.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(5000);
  await snap(p, '01_detail');

  const bodyText = await p.evaluate(() => document.body.innerText);
  console.log('페이지(200자):', bodyText.slice(0, 200));

  // 2. 다운로드 버튼 탐색
  const dlBtn = await p.evaluate(() => {
    function scan(root) {
      for (const el of root.querySelectorAll('button, a, [role="button"], [role="menuitem"]')) {
        const t = el.textContent?.trim() || '';
        const l = el.getAttribute('aria-label') || '';
        if (t.includes('다운로드') || t.includes('Download') || t.includes('JSON') ||
            l.includes('다운로드') || l.includes('Download') || l.includes('JSON')) {
          return { text: t.slice(0, 60), label: l, tag: el.tagName };
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
  console.log('다운로드 버튼:', JSON.stringify(dlBtn));

  if (dlBtn) {
    const clicked = await p.evaluate(() => {
      function scan(root) {
        for (const el of root.querySelectorAll('button, a, [role="button"]')) {
          const t = el.textContent?.trim() || '';
          const l = el.getAttribute('aria-label') || '';
          if (t.includes('다운로드') || t.includes('Download') || t.includes('JSON') ||
              l.includes('다운로드') || l.includes('JSON')) {
            el.click();
            return t || l;
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
    console.log('클릭:', clicked);
    await wait(2000);
    await snap(p, '02_after_dl');

    const newFile = await findNewDownload(beforeDownloads);
    if (newFile) {
      const json = JSON.parse(fs.readFileSync(newFile, 'utf-8'));
      const inst = json.installed || json.web || {};
      console.log('\n✅ JSON 다운로드 성공!');
      console.log('Client ID:', inst.client_id);
      console.log('Secret:', inst.client_secret ? inst.client_secret.slice(0, 12) + '...' : '없음');

      if (inst.client_id && inst.client_secret) {
        let env = fs.readFileSync(ENV_FILE, 'utf-8');
        env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${inst.client_id}`)
                 .replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${inst.client_secret}`);
        fs.writeFileSync(ENV_FILE, env, 'utf-8');
        console.log('✅ .env 업데이트 완료');
      }
      await ctx.close();
      return;
    }
  }

  // 3. 다운로드 버튼 없음 → 새 credential 생성 (JSON 즉시 다운로드)
  console.log('\n3️⃣ 다운로드 버튼 없음 → 새 credential 생성 + 즉시 다운로드...');
  await p.goto(
    'https://console.cloud.google.com/auth/clients/create?project=gws-workspace-60127',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '03_create_form');

  // cfc-select 클릭
  try { await p.locator('cfc-select').first().click({ timeout: 5000 }); } catch {}
  await wait(1500);

  // 데스크톱 앱 선택
  await p.evaluate(() => {
    const opts = [...document.querySelectorAll('[role="option"], mat-option, cfc-option')];
    for (const o of opts) {
      if (o.textContent?.includes('데스크톱') || o.textContent?.includes('Desktop')) {
        o.click(); return;
      }
    }
  });
  await wait(1000);

  // 이름 입력
  await p.evaluate(() => {
    function fill(root) {
      for (const inp of root.querySelectorAll('input')) {
        if (!inp.readOnly && inp.type !== 'search' && inp.offsetParent !== null) {
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (niv) { niv.call(inp, 'BlogAuto2'); inp.dispatchEvent(new Event('input', { bubbles: true })); }
          else inp.value = 'BlogAuto2';
          return;
        }
      }
      for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) fill(el.shadowRoot); }
    }
    fill(document.body);
  });
  await wait(500);

  // 만들기 클릭
  await p.evaluate(() => {
    function find(root) {
      for (const btn of root.querySelectorAll('button')) {
        if (btn.textContent?.trim() === '만들기' || btn.textContent?.trim() === 'Create') {
          btn.click(); return;
        }
      }
      for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) find(el.shadowRoot); }
    }
    find(document.body);
  });
  await wait(3000);
  await snap(p, '04_after_create');

  // 즉시 JSON 다운로드 버튼 클릭
  const dlClicked = await p.evaluate(() => {
    function scan(root) {
      for (const el of root.querySelectorAll('button, a, [role="button"]')) {
        const t = el.textContent?.trim() || '';
        if (t.includes('JSON 다운로드') || t.includes('Download JSON') || t.includes('JSON')) {
          el.click();
          return t;
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
  console.log('JSON 다운로드 클릭:', dlClicked);
  await snap(p, '05_dl_click');
  await wait(3000);
  await snap(p, '06_dl_result');

  // 다운로드된 파일 확인
  const newFile2 = await findNewDownload(beforeDownloads);
  if (newFile2) {
    const json = JSON.parse(fs.readFileSync(newFile2, 'utf-8'));
    const inst = json.installed || json.web || {};
    console.log('\n✅ 다운로드 성공!', newFile2);
    console.log('Client ID:', inst.client_id);
    console.log('Secret:', inst.client_secret?.slice(0, 12) + '...');

    if (inst.client_id && inst.client_secret) {
      let env = fs.readFileSync(ENV_FILE, 'utf-8');
      env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${inst.client_id}`)
               .replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${inst.client_secret}`);
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('✅ .env 업데이트 완료! yt_auth.mjs 실행 준비');
    }
  } else if (netSecret) {
    // 네트워크에서 잡힌 경우
    let env = fs.readFileSync(ENV_FILE, 'utf-8');
    env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${netSecret}`);
    fs.writeFileSync(ENV_FILE, env, 'utf-8');
    console.log('✅ 네트워크 secret으로 .env 업데이트');
  } else {
    console.log('❌ secret 획득 실패 → data/dl_*.png 확인');
  }

  await wait(10000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
