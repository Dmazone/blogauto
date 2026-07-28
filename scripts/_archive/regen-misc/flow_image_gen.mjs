/**
 * flow_image_gen.mjs
 * Google Flow(ImageFX) 자동 이미지 생성 스크립트
 *
 * 첫 실행: headless=false 로 브라우저가 열림 → Google 로그인 후 Flow 페이지 확인되면 Enter
 * 이후: 저장된 세션(.flow-session/session.json)으로 headless 실행
 *
 * 사용법:
 *   node scripts/flow_image_gen.mjs "프롬프트" /path/to/output.webp
 * 또는 ESM import:
 *   import { generateFlowImage } from './flow_image_gen.mjs';
 */

import { chromium } from 'playwright';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSION_DIR = path.join(__dirname, '..', '.flow-session');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const FLOW_PROJECT_URL = 'https://labs.google/fx/ko/tools/flow/project/228363f6-dbaa-46ec-9adc-deb1125ec90d';

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadUrl(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} from ${url.substring(0, 80)}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (e) => { file.close(); fs.unlink(destPath, () => {}); reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
  });
}

async function waitForEnter(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(msg, () => { rl.close(); resolve(); }));
}

async function setupSession() {
  console.log('🔑 첫 실행: 브라우저가 열립니다. Google 계정(paydma)으로 로그인 후');
  console.log('   Flow 페이지(labs.google/fx/ko/tools/flow/...)가 보이면 터미널에서 Enter를 누르세요.\n');

  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://labs.google/fx/ko/tools/flow', { waitUntil: 'load', timeout: 30000 });

  await waitForEnter('\n✅ Flow 페이지 확인 후 Enter를 누르세요: ');

  const state = await context.storageState();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
  console.log('💾 세션 저장 완료:', SESSION_FILE);

  await browser.close();
}

export async function generateFlowImage(prompt, outputPath, retryCount = 0) {
  if (!fs.existsSync(SESSION_FILE)) {
    await setupSession();
  }

  const storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    // Track CDN URLs: separate "pre-existing" from "newly generated"
    const knownCdnUrls = new Set();
    let newCdnUrl = null;

    context.on('response', (response) => {
      const url = response.url();
      if (url.includes('flow-content.google/image/')) {
        const uuid = url.match(/\/image\/([a-f0-9-]+)/)?.[1];
        if (uuid && !knownCdnUrls.has(uuid) && pageLoaded) {
          newCdnUrl = url;
          console.log('📡 새 이미지 CDN URL 감지됨');
        } else if (uuid) {
          knownCdnUrls.add(uuid);
        }
      }
    });

    let pageLoaded = false;
    console.log('🌐 Flow 페이지 로딩 중...');
    await page.goto(FLOW_PROJECT_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Record all existing image UUIDs so we ignore them later
    const existingUuids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .map(i => i.src)
        .filter(s => s.includes('getMediaUrlRedirect'))
        .map(s => { const m = s.match(/name=([a-f0-9-]+)/); return m ? m[1] : null; })
        .filter(Boolean)
    );
    existingUuids.forEach(uuid => knownCdnUrls.add(uuid));
    pageLoaded = true; // now start tracking new URLs

    // Check for login redirect
    const currentUrl = page.url();
    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
      if (retryCount === 0) {
        console.log('⚠️  세션 만료. 재로그인 필요...');
        fs.unlinkSync(SESSION_FILE);
        await browser.close();
        const { execSync } = await import('child_process');
        console.log('🔑 세션 재설정 중... (setup_flow_session.mjs 실행)');
        execSync('node scripts/setup_flow_session.mjs', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
        return generateFlowImage(prompt, outputPath, 1);
      }
      throw new Error('로그인 실패');
    }

    // Find prompt input (contenteditable div with "무엇을 만들고 싶으신가요?" placeholder)
    console.log('⌨️  프롬프트 입력 중...');
    let input = null;
    const inputSelectors = [
      'div[contenteditable="true"][class*="sc-439ac1d3"]',
      'div[contenteditable="true"][class*="sc-a8ba1f43"]',
      'div[contenteditable="true"]',
      '[role="textbox"]',
    ];

    for (const sel of inputSelectors) {
      try {
        // Use last() since there may be two identical inputs; target the visible one
        const loc = page.locator(sel).last();
        await loc.waitFor({ timeout: 8000, state: 'visible' });
        input = loc;
        console.log(`  입력창 발견: ${sel}`);
        break;
      } catch (_) {}
    }

    if (!input) throw new Error('프롬프트 입력창을 찾을 수 없음');

    // Clear and fill the contenteditable div
    await input.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(prompt, { delay: 20 });

    // Find and click the generate button ("arrow_forward만들기")
    // The generate button has class *sc-439ac1d3 and type=submit with text containing 만들기
    const btnSelectors = [
      'button[class*="sc-439ac1d3"][type="submit"]',
      'button[type="submit"]:has-text("만들기")',
      'button:has-text("arrow_forward만들기")',
      'button:has-text("만들기")',
    ];

    let clicked = false;
    for (const sel of btnSelectors) {
      try {
        const loc = page.locator(sel).last();
        const count = await loc.count();
        if (count > 0) {
          await loc.click({ timeout: 3000 });
          clicked = true;
          console.log(`🖱️  생성 버튼 클릭 (${sel})`);
          break;
        }
      } catch (_) {}
    }

    if (!clicked) {
      await page.keyboard.press('Enter');
      console.log('↩️  Enter 키로 생성 시도');
    }

    // Wait for a NEW CDN URL (up to 90 seconds)
    console.log('⏳ 새 이미지 생성 대기 중 (최대 90초)...');
    const timeout = 90000;
    const start = Date.now();

    while (!newCdnUrl && Date.now() - start < timeout) {
      await page.waitForTimeout(2000);

      if (!newCdnUrl) {
        // DOM fallback: look for NEW UUIDs not in our known set
        const allUuids = await page.evaluate(() =>
          Array.from(document.querySelectorAll('img'))
            .map(i => i.src)
            .filter(s => s.includes('getMediaUrlRedirect'))
            .map(s => { const m = s.match(/name=([a-f0-9-]+)/); return m ? m[1] : null; })
            .filter(Boolean)
        );

        const freshUuids = allUuids.filter(uuid => !knownCdnUrls.has(uuid));

        if (freshUuids.length > 0) {
          const uuid = freshUuids[freshUuids.length - 1];
          const redirectPage2 = await context.newPage();
          try {
            let finalUrl = null;
            redirectPage2.on('response', (r) => {
              if (r.url().includes('flow-content.google')) finalUrl = r.url();
            });
            await redirectPage2.goto(
              `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${uuid}`,
              { waitUntil: 'load', timeout: 10000 }
            );
            if (finalUrl) {
              newCdnUrl = finalUrl;
              console.log('📡 새 CDN URL (리다이렉트 방식) 감지됨');
            }
          } catch (_) {}
          await redirectPage2.close();
        }
      }
    }

    if (!newCdnUrl) throw new Error('이미지 생성 타임아웃 (90초 초과)');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    console.log('⬇️  이미지 다운로드 중...');
    await downloadUrl(newCdnUrl, outputPath);

    const size = (fs.statSync(outputPath).size / 1024).toFixed(0);
    console.log(`✅ Flow 이미지 저장: ${path.basename(outputPath)} (${size}KB)`);

    return outputPath;

  } finally {
    if (browser) await browser.close();
  }
}

// CLI 실행
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , prompt, outputPath] = process.argv;

  if (!prompt || !outputPath) {
    console.error('사용법: node scripts/flow_image_gen.mjs "프롬프트 텍스트" /path/to/output.webp');
    process.exit(1);
  }

  generateFlowImage(prompt, outputPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ 실패:', err.message);
      process.exit(1);
    });
}
