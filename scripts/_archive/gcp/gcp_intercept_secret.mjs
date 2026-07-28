/**
 * gcp_intercept_secret.mjs — 네트워크 인터셉트로 Add secret API 응답에서 GOCSPX- 추출
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
  await p.screenshot({ path: `data/intercept_${name}.png` });
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

  // 네트워크 응답 인터셉트 설정
  let foundSecret = null;
  p.on('response', async (response) => {
    const url = response.url();
    // googleapis 또는 cloud.google.com API 응답만 체크
    if (!url.includes('googleapis.com') && !url.includes('cloud.google.com') && !url.includes('accounts.google')) return;
    try {
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;
      const body = await response.text().catch(() => '');
      if (body.includes('GOCSPX-')) {
        const match = body.match(/(GOCSPX-[A-Za-z0-9_-]{10,})/);
        if (match) {
          foundSecret = match[1];
          console.log(`\n🎯 네트워크에서 Secret 발견!: ${foundSecret}`);
          console.log('  URL:', url);
        }
      }
    } catch {}
  });

  const credUrl = `https://console.cloud.google.com/auth/clients/${CRED_PATH}?project=gws-workspace-60127`;
  console.log('1️⃣ credential 상세 페이지...');
  await p.goto(credUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(5000);

  // 기존 secret 수 확인 (먼저 스크롤해서 전체 상태 보기)
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(2000);
  await snap(p, '01_before');

  const beforeText = await p.evaluate(() => document.body.innerText);
  const secretCount = (beforeText.match(/\*{4}/g) || []).length;
  console.log(`현재 보안 비밀번호 수: ${secretCount}개`);

  // "Add secret" JS 클릭
  console.log('2️⃣ Add secret 클릭 (네트워크 감시 중)...');
  const clicked = await p.evaluate(() => {
    function findAndClick(root) {
      for (const btn of root.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Add secret') {
          btn.click();
          return true;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot && findAndClick(el.shadowRoot)) return true;
      }
      return false;
    }
    return findAndClick(document.body);
  });
  console.log('  클릭 결과:', clicked ? '✅ 성공' : '❌ 버튼 없음');

  // 10초 대기 (네트워크 응답 수신)
  for (let i = 0; i < 10; i++) {
    await wait(1000);
    if (foundSecret) break;
    process.stdout.write(`  [${i+1}s] 대기 중...\r`);
  }
  console.log();

  if (!foundSecret) {
    // 페이지 하단으로 스크롤해서 새 secret 표시 확인
    console.log('3️⃣ 페이지 스크롤 + 새 secret 표시 확인...');
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(2000);
    await snap(p, '02_after_scroll');

    // 더 아래까지 스크롤
    await p.evaluate(() => {
      const panel = document.querySelector('.panel-content, main, [role="main"], .content-area');
      if (panel) panel.scrollTop = panel.scrollHeight;
    });
    await wait(1000);
    await snap(p, '03_panel_scroll');

    // 전체 body text
    const afterText = await p.evaluate(() => document.body.innerText);
    console.log('페이지 전체 텍스트 (마지막 1000자):');
    console.log(afterText.slice(-1000));
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
    console.log('\n⚠️ 네트워크 인터셉트 실패');
    console.log('GCP가 새 UI에서 secret 값을 클라이언트로 전달하지 않는 것 같습니다.');
    console.log('');
    console.log('수동으로 .env에 입력하는 방법:');
    console.log('1. GCP 콘솔 → 사용자 인증 정보 → gws CLI 클릭');
    console.log('2. "클라이언트 보안 비밀번호" 섹션에서 새로 추가된 secret 옆 📋 복사 아이콘 클릭');
    console.log('3. .env 파일에 YOUTUBE_CLIENT_SECRET=붙여넣은_값 추가');
  }

  await wait(20000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
