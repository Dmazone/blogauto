/**
 * gcp_copy_secret.mjs — 최신 secret 옆 복사 아이콘 클릭 → 클립보드에서 추출
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
  await p.screenshot({ path: `data/copy_${name}.png` });
  console.log(`📸 ${name}`);
};

const KNOWN_CLIENT_ID = '796897570385-b0efsjirfrnplh7sgjkc8tpiel02cgvd.apps.googleusercontent.com';
const CRED_PATH = KNOWN_CLIENT_ID.replace('.apps.googleusercontent.com', '');

async function main() {
  // clipboard-read 권한 부여
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--enable-clipboard-provider',
    ],
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 1000 },
  });
  const p = await ctx.newPage();

  // clipboard 권한 추가 부여
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://console.cloud.google.com' });

  const credUrl = `https://console.cloud.google.com/auth/clients/${CRED_PATH}?project=gws-workspace-60127`;
  console.log('1️⃣ credential 상세 페이지...');
  await p.goto(credUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(5000);

  // 하단으로 스크롤
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(2000);
  await snap(p, '01_bottom');

  // 복사 아이콘 버튼 목록 확인 (Shadow DOM 포함)
  console.log('2️⃣ 복사 버튼 탐색...');
  const copyBtns = await p.evaluate(() => {
    const result = [];
    function scan(root, depth = 0) {
      for (const btn of root.querySelectorAll('button, [role="button"]')) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const title = btn.getAttribute('title') || '';
        const text = btn.textContent?.trim() || '';
        const className = btn.className?.toString() || '';
        if (ariaLabel.toLowerCase().includes('copy') || ariaLabel.includes('복사') ||
            title.toLowerCase().includes('copy') || title.includes('복사') ||
            className.toLowerCase().includes('copy') || text === '📋') {
          result.push({ ariaLabel, title, text, className: className.slice(0, 50), depth });
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) scan(el.shadowRoot, depth + 1);
      }
    }
    scan(document.body);
    return result;
  });
  console.log('복사 버튼:', JSON.stringify(copyBtns));

  // Shadow DOM 포함 모든 버튼 탐색 (aria-label 기반)
  const allBtns = await p.evaluate(() => {
    const result = [];
    function scan(root) {
      for (const btn of root.querySelectorAll('button, [role="button"]')) {
        const label = btn.getAttribute('aria-label') || btn.title || '';
        const text = btn.textContent?.trim().slice(0, 30) || '';
        result.push({ label, text, tagName: btn.tagName });
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) scan(el.shadowRoot);
      }
    }
    scan(document.body);
    return result.filter(b => b.label || b.text);
  });
  console.log('모든 버튼:', JSON.stringify(allBtns));

  // ****KVpY 옆 복사 아이콘 클릭 시도
  // 새 secret (KVpY로 끝나는)은 가장 최근에 생성된 것
  console.log('3️⃣ 최신 secret 복사 아이콘 클릭...');

  // JS로 최신 secret 컨테이너 내의 copy 버튼 클릭
  const copyClicked = await p.evaluate(() => {
    function scan(root) {
      // ****KVpY 텍스트 근처의 버튼 찾기
      const textNodes = [];
      function findText(r) {
        for (const node of r.childNodes) {
          if (node.nodeType === 3 && node.textContent?.includes('KVpY')) {
            textNodes.push(node);
          }
          if (node.shadowRoot) findText(node.shadowRoot);
          if (node.childNodes) findText(node);
        }
      }
      findText(document.body);

      for (const tn of textNodes) {
        // 부모 컨테이너 탐색
        let parent = tn.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          // 같은 컨테이너 내의 버튼 찾기
          const btns = parent.querySelectorAll('button, [role="button"]');
          for (const btn of btns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('copy') || label.includes('복사')) {
              btn.click();
              return `clicked near KVpY: ${btn.getAttribute('aria-label')}`;
            }
          }
          parent = parent.parentElement;
        }
      }

      // 폴백: 마지막 copy 버튼 클릭
      let lastCopyBtn = null;
      function findCopyBtns(r) {
        for (const btn of r.querySelectorAll('button, [role="button"]')) {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('copy') || label.includes('복사')) {
            lastCopyBtn = btn;
          }
        }
        for (const el of r.querySelectorAll('*')) {
          if (el.shadowRoot) findCopyBtns(el.shadowRoot);
        }
      }
      findCopyBtns(document.body);
      if (lastCopyBtn) {
        lastCopyBtn.click();
        return `clicked last copy btn: ${lastCopyBtn.getAttribute('aria-label')}`;
      }
      return null;
    }
    return scan(document.body);
  });
  console.log('  클릭 결과:', copyClicked ?? '복사 버튼 없음');

  await wait(2000);
  await snap(p, '02_after_copy');

  // 클립보드 읽기
  console.log('4️⃣ 클립보드 읽기...');
  try {
    const clipText = await p.evaluate(() => navigator.clipboard.readText());
    console.log('  클립보드:', clipText ? `"${clipText.slice(0, 60)}..."` : '(비어있음)');

    const secret = clipText?.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/)?.[1] || clipText?.trim();
    if (secret && secret.length > 10) {
      let env = fs.readFileSync(ENV_FILE, 'utf-8');
      if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
        env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${secret}`);
      } else {
        env += `YOUTUBE_CLIENT_SECRET=${secret}\n`;
      }
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('\n✅ YOUTUBE_CLIENT_SECRET .env 저장!');
      console.log('다음: node scripts/yt_auth.mjs');
    }
  } catch (e) {
    console.log('  ❌ 클립보드 읽기 실패:', e.message.slice(0, 80));
    console.log('  (클립보드 접근 권한 필요)');
  }

  await wait(30000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
