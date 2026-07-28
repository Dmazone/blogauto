/**
 * gcp_add_secret.mjs — gws CLI credential에 새 보안 비밀번호 추가
 * 기존 client_id는 이미 알고 있음: 796897570385-b0efsjirfrnplh7sgjkc8tpiel02cgvd.apps.googleusercontent.com
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
  await p.screenshot({ path: `data/secret_${name}.png`, fullPage: true });
  console.log(`📸 ${name}`);
};

const KNOWN_CLIENT_ID = '796897570385-b0efsjirfrnplh7sgjkc8tpiel02cgvd.apps.googleusercontent.com';

async function main() {
  // .env에 client_id 먼저 저장
  let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
  if (env.match(/^YOUTUBE_CLIENT_ID=/m)) {
    env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${KNOWN_CLIENT_ID}`);
  } else {
    env += `\nYOUTUBE_CLIENT_ID=${KNOWN_CLIENT_ID}\n`;
  }
  fs.writeFileSync(ENV_FILE, env, 'utf-8');
  console.log('✅ YOUTUBE_CLIENT_ID .env 저장 완료');

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 1000 },
  });
  const p = await ctx.newPage();

  // gws CLI credential 상세 페이지로 이동
  const credUrl = `https://console.cloud.google.com/auth/clients/${KNOWN_CLIENT_ID.replace('.apps.googleusercontent.com', '')}?project=gws-workspace-60127`;
  console.log('\n1️⃣ gws CLI 상세 페이지로 이동...');
  await p.goto(credUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);
  await snap(p, '01_detail');

  // 페이지 스크롤 - 하단 비밀번호 섹션 확인
  console.log('2️⃣ 페이지 스크롤...');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(2000);
  await snap(p, '02_bottom');

  // 보안 비밀번호 추가 버튼 찾기
  console.log('3️⃣ "보안 비밀번호 추가" 버튼 탐색...');
  const bodyText = await p.evaluate(() => document.body.innerText);
  console.log('하단 텍스트 (일부):', bodyText.slice(-800));

  // 버튼 목록
  const buttons = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a[role="button"]')).map(b => ({
      text: b.textContent.trim().slice(0, 60),
      type: b.type
    })).filter(b => b.text);
  });
  console.log('버튼 목록:', JSON.stringify(buttons));

  // "보안 비밀번호 추가" 또는 "Add new secret" 버튼 클릭
  const addSecretTexts = ['보안 비밀번호 추가', 'Add new secret', '새 보안 비밀번호', 'Add secret'];
  let secretAdded = false;

  for (const text of addSecretTexts) {
    try {
      await p.getByText(text, { exact: false }).first().click({ timeout: 3000 });
      await wait(3000);
      await snap(p, '03_after_add_secret');
      console.log(`  ✅ "${text}" 클릭 성공`);
      secretAdded = true;
      break;
    } catch {}
  }

  if (!secretAdded) {
    console.log('  ⚠️ 버튼 못 찾음, JSON 다운로드 시도...');
    // JSON 다운로드 버튼 시도
    try {
      await p.getByText('JSON 다운로드', { exact: false }).first().click({ timeout: 3000 });
      await wait(2000);
      console.log('  ✅ JSON 다운로드 클릭');
    } catch {
      // alt text
      try {
        await p.getByText('Download JSON', { exact: false }).first().click({ timeout: 3000 });
        await wait(2000);
        console.log('  ✅ Download JSON 클릭');
      } catch {}
    }
    await snap(p, '03_json_download');
  }

  // 새 secret이 나타났는지 확인
  const newText = await p.evaluate(() => document.body.innerText);
  const newSecret = newText.match(/(GOCSPX-[A-Za-z0-9_-]+)/)?.[1];

  if (newSecret) {
    console.log('\n✅ 새 Client Secret 발견!');
    let envNew = fs.readFileSync(ENV_FILE, 'utf-8');
    if (envNew.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
      envNew = envNew.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${newSecret}`);
    } else {
      envNew += `YOUTUBE_CLIENT_SECRET=${newSecret}\n`;
    }
    fs.writeFileSync(ENV_FILE, envNew, 'utf-8');
    console.log('✅ YOUTUBE_CLIENT_SECRET .env 저장 완료!');
    console.log('\n다음 단계: node scripts/yt_auth.mjs');
  } else {
    console.log('\n⚠️ Secret 자동 추출 실패');
    console.log('스크린샷 확인: data/secret_03_*.png');
  }

  console.log('\n창 유지 (30초)...');
  await wait(30000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
