/**
 * gcp_add_secret2.mjs — JS 직접 클릭으로 Add secret + 새 secret 캡처
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
  await p.screenshot({ path: `data/secret2_${name}.png` });
  console.log(`📸 ${name}`);
};

const KNOWN_CLIENT_ID = '796897570385-b0efsjirfrnplh7sgjkc8tpiel02cgvd.apps.googleusercontent.com';
const CRED_PATH = KNOWN_CLIENT_ID.replace('.apps.googleusercontent.com', '');

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 1000 },
  });
  const p = await ctx.newPage();

  const credUrl = `https://console.cloud.google.com/auth/clients/${CRED_PATH}?project=gws-workspace-60127`;
  console.log('1️⃣ credential 상세 페이지...');
  await p.goto(credUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(5000);

  // 전체 버튼 목록 확인
  const allBtns = await p.evaluate(() => {
    function getBtns(root, result = []) {
      for (const b of root.querySelectorAll('button')) {
        result.push({ text: b.textContent.trim(), type: b.type, disabled: b.disabled });
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) getBtns(el.shadowRoot, result);
      }
      return result;
    }
    return getBtns(document.body);
  });
  console.log('모든 버튼 (Shadow DOM 포함):', JSON.stringify(allBtns.filter(b => b.text)));

  // 하단 스크롤
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(1000);
  await snap(p, '01_before');

  // JavaScript로 "Add secret" 버튼 클릭 (Shadow DOM 포함 탐색)
  console.log('2️⃣ JS로 Add secret 버튼 클릭...');
  const clicked = await p.evaluate(() => {
    function findAndClick(root) {
      for (const btn of root.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Add secret') {
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          btn.click();
          return `clicked: ${btn.textContent.trim()}`;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const r = findAndClick(el.shadowRoot);
          if (r) return r;
        }
      }
      return null;
    }
    return findAndClick(document.body);
  });
  console.log('  JS 클릭 결과:', clicked ?? '버튼 없음');

  if (!clicked) {
    // 대안: mouse click on visible button position
    await snap(p, '01_no_button');
    console.log('⚠️ Add secret 버튼을 찾을 수 없습니다. 스크린샷을 확인하세요.');
    await wait(20000);
    await ctx.close();
    return;
  }

  // 새 secret 폴링 (2초마다 30초)
  console.log('3️⃣ 새 secret 폴링 (30초)...');
  let foundSecret = null;
  for (let i = 0; i < 15; i++) {
    await wait(2000);
    if (i % 3 === 0) await snap(p, `scan_${String(i).padStart(2,'0')}`);

    // 전체 DOM 텍스트 (shadow DOM 포함)
    const allText = await p.evaluate(() => {
      const parts = [];
      function extract(root) {
        for (const node of root.childNodes) {
          if (node.nodeType === 3) parts.push(node.textContent);
          if (node.shadowRoot) extract(node.shadowRoot);
          if (node.childNodes) extract(node);
        }
      }
      extract(document.body);
      return parts.join(' ');
    });

    const match = allText.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/);
    if (match) {
      foundSecret = match[1];
      console.log(`  ✅ [${i}s] Secret 발견: ${foundSecret}`);
      await snap(p, 'found_secret');
      break;
    } else {
      console.log(`  [${i * 2}s] 아직 없음`);
    }
  }

  if (foundSecret) {
    let env = fs.readFileSync(ENV_FILE, 'utf-8');
    if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
      env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${foundSecret}`);
    } else {
      env += `YOUTUBE_CLIENT_SECRET=${foundSecret}\n`;
    }
    fs.writeFileSync(ENV_FILE, env, 'utf-8');
    console.log('\n✅ YOUTUBE_CLIENT_SECRET .env 저장 완료!');
    console.log('다음: node scripts/yt_auth.mjs');
  } else {
    console.log('\n⚠️ Secret 자동 추출 실패');
    console.log('→ data/secret2_scan_*.png 확인');
    console.log('→ 또는 GCP 콘솔에서 직접 확인 후 .env에 수동 입력:');
    console.log('   YOUTUBE_CLIENT_SECRET=GOCSPX-...');
  }

  await wait(15000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
