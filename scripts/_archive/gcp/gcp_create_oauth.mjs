/**
 * gcp_create_oauth.mjs — 새 OAuth 2.0 데스크톱 클라이언트 생성 + .env 저장
 * 기존 credential에서 secret을 볼 수 없어서 새로 생성
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
  await p.screenshot({ path: `data/oauth_${name}.png` });
  console.log(`📸 ${name}`);
};

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // 1. 사용자 인증 정보 페이지 이동
  console.log('1️⃣ 사용자 인증 정보 페이지...');
  await p.goto('https://console.cloud.google.com/apis/credentials?project=gws-workspace-60127', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(3000);
  await snap(p, '01_start');

  // 2. "+ 사용자 인증 정보 만들기" 버튼 클릭
  console.log('2️⃣ CREATE CREDENTIALS 클릭...');
  // 버튼은 여러 형태로 나올 수 있음
  const createBtnSelectors = [
    'button:has-text("사용자 인증 정보 만들기")',
    'a:has-text("사용자 인증 정보 만들기")',
    'button:has-text("CREATE CREDENTIALS")',
  ];
  let clicked = false;
  for (const sel of createBtnSelectors) {
    try {
      await p.click(sel, { timeout: 3000 });
      clicked = true;
      console.log(`  ✅ 클릭: ${sel}`);
      break;
    } catch {}
  }
  if (!clicked) {
    console.log('  ⚠️ 버튼 못 찾음, 스크린샷 확인');
    await snap(p, '02_error');
    await wait(30000);
    await ctx.close();
    return;
  }
  await wait(2000);
  await snap(p, '02_dropdown');

  // 3. 드롭다운에서 "OAuth 클라이언트 ID" 선택
  console.log('3️⃣ OAuth 클라이언트 ID 선택...');
  // getByText가 가장 안정적
  try {
    await p.getByText('OAuth 클라이언트 ID').first().click({ timeout: 5000 });
    console.log('  ✅ OAuth 클라이언트 ID 클릭 성공');
  } catch {
    // 영어 폴백
    try {
      await p.getByText('OAuth client ID').first().click({ timeout: 5000 });
      console.log('  ✅ OAuth client ID (영어) 클릭 성공');
    } catch (e2) {
      console.log('  ❌ 선택 실패:', e2.message);
      await snap(p, '03_error');
      await wait(30000);
      await ctx.close();
      return;
    }
  }
  await wait(3000);
  await snap(p, '03_oauth_form');

  // 4. 앱 유형 선택: 데스크톱 앱
  console.log('4️⃣ 앱 유형 → 데스크톱 앱...');
  try {
    // mat-select 클릭
    const typeSelect = p.locator('mat-select').first();
    await typeSelect.click({ timeout: 5000 });
    await wait(1500);
    await snap(p, '04_type_dropdown');

    // 데스크톱 옵션 클릭
    try {
      await p.getByText('데스크톱 앱').first().click({ timeout: 3000 });
    } catch {
      await p.getByText('Desktop app').first().click({ timeout: 3000 });
    }
    await wait(1000);
    console.log('  ✅ 데스크톱 앱 선택');
  } catch (e) {
    console.log('  ⚠️ 앱 유형 선택 실패 (기본값 사용):', e.message);
  }

  // 5. 이름 입력
  console.log('5️⃣ 이름 입력: BlogAuto Desktop');
  try {
    // 이름 필드 찾기
    const nameInput = p.locator('input[formcontrolname]').first();
    await nameInput.clear();
    await nameInput.fill('BlogAuto Desktop');
    console.log('  ✅ 이름 입력 완료');
  } catch (e) {
    console.log('  ⚠️ 이름 입력 실패:', e.message);
  }
  await wait(500);
  await snap(p, '05_filled');

  // 6. 만들기 버튼
  console.log('6️⃣ 만들기 클릭...');
  try {
    await p.getByRole('button', { name: /만들기|Create/i }).last().click({ timeout: 5000 });
    console.log('  ✅ 만들기 클릭');
  } catch (e) {
    console.log('  ❌ 만들기 버튼 실패:', e.message);
    await snap(p, '06_error');
    await wait(30000);
    await ctx.close();
    return;
  }
  await wait(4000);
  await snap(p, '06_created_dialog');

  // 7. 대화상자에서 client_id / client_secret 추출
  console.log('7️⃣ credentials 추출...');
  const pageContent = await p.evaluate(() => document.body.innerText);

  // client_id: 숫자-랜덤.apps.googleusercontent.com
  const clientId = pageContent.match(/(\d{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
  // client_secret: GOCSPX-...
  const clientSecret = pageContent.match(/(GOCSPX-[A-Za-z0-9_-]+)/)?.[1];

  console.log('Client ID:', clientId ?? '⚠️ 없음');
  console.log('Client Secret:', clientSecret ? '✅ 찾음 (길이: ' + clientSecret.length + ')' : '⚠️ 없음');

  if (!clientId || !clientSecret) {
    // HTML에서도 시도
    const html = await p.content();
    const cidHtml = html.match(/(\d{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
    const secHtml = html.match(/(GOCSPX-[A-Za-z0-9_-]+)/)?.[1];
    console.log('HTML Client ID:', cidHtml ?? '없음');
    console.log('HTML Secret:', secHtml ? '✅ 찾음' : '없음');

    if (cidHtml || secHtml) {
      await saveToEnv(cidHtml, secHtml, ENV_FILE);
    } else {
      console.log('\n⚠️ 자동 추출 실패');
      console.log('→ data/oauth_06_created_dialog.png 열어서 값 확인 후 수동으로 .env에 입력하세요');
      console.log('  YOUTUBE_CLIENT_ID=...');
      console.log('  YOUTUBE_CLIENT_SECRET=...');
    }
  } else {
    await saveToEnv(clientId, clientSecret, ENV_FILE);
  }

  console.log('\n창이 열려 있습니다. 30초 후 자동 닫힘.');
  await wait(30000);
  await ctx.close();
}

async function saveToEnv(clientId, clientSecret, envFile) {
  let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';
  if (clientId) {
    if (env.match(/^YOUTUBE_CLIENT_ID=/m)) {
      env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${clientId}`);
    } else {
      env += `\nYOUTUBE_CLIENT_ID=${clientId}\n`;
    }
    console.log('\n✅ YOUTUBE_CLIENT_ID 저장:', clientId);
  }
  if (clientSecret) {
    if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
      env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${clientSecret}`);
    } else {
      env += `YOUTUBE_CLIENT_SECRET=${clientSecret}\n`;
    }
    console.log('✅ YOUTUBE_CLIENT_SECRET 저장 (GOCSPX-...)');
  }
  fs.writeFileSync(envFile, env, 'utf-8');
  console.log('✅ .env 저장 완료!');
  console.log('\n다음 단계: node scripts/yt_auth.mjs 실행해서 OAuth 인증 완료');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
