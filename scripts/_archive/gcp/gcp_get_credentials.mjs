/**
 * gcp_get_credentials.mjs — 기존 gws CLI OAuth credential에서 client_id/secret 추출
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
  await p.screenshot({ path: `data/gcp_cred_${name}.png` });
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

  console.log('🔑 GCP 사용자 인증 정보 페이지 접속...');
  await p.goto('https://console.cloud.google.com/apis/credentials?project=gws-workspace-60127', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(4000);
  await snap(p, '01_credentials_page');

  // "gws CLI" 링크 클릭
  console.log('📋 gws CLI credential 클릭...');
  try {
    await p.click('a:has-text("gws CLI")', { timeout: 8000 });
    await wait(4000);
    await snap(p, '02_gws_cli_detail');

    // 페이지 전체 텍스트 읽기
    const pageText = await p.content();
    console.log('\n--- 페이지 HTML 일부 ---');
    // client_id 패턴: 숫자-문자열.apps.googleusercontent.com
    const clientIdMatch = pageText.match(/([\d]{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/);
    // client_secret 패턴: GOCSPX-...
    const clientSecretMatch = pageText.match(/GOCSPX-[A-Za-z0-9_-]+/);

    console.log('Client ID 매치:', clientIdMatch?.[1] ?? '없음');
    console.log('Client Secret 매치:', clientSecretMatch?.[0] ?? '없음');

    // 화면에서 직접 텍스트 읽기 시도
    const allText = await p.evaluate(() => document.body.innerText);
    const cidFromInner = allText.match(/([\d]{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
    const secFromInner = allText.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];
    console.log('innerText Client ID:', cidFromInner ?? '없음');
    console.log('innerText Secret:', secFromInner ?? '없음');

    const clientId     = clientIdMatch?.[1] || cidFromInner;
    const clientSecret = clientSecretMatch?.[0] || secFromInner;

    if (clientId) {
      console.log('\n✅ Client ID:', clientId);
      let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
      if (env.match(/^YOUTUBE_CLIENT_ID=/m)) {
        env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${clientId}`);
      } else {
        env += `\nYOUTUBE_CLIENT_ID=${clientId}\n`;
      }
      if (clientSecret) {
        console.log('✅ Client Secret:', clientSecret);
        if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
          env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${clientSecret}`);
        } else {
          env += `YOUTUBE_CLIENT_SECRET=${clientSecret}\n`;
        }
      }
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('\n✅ .env 저장 완료!');
    } else {
      console.log('\n⚠️ 자동 추출 실패 - 스크린샷 확인 필요');
      console.log('  → data/gcp_cred_02_gws_cli_detail.png 확인');

      // "클라이언트 ID 보기" 같은 버튼이 있을 수 있음
      const showBtn = await p.$('button:has-text("표시"), button:has-text("보기"), button:has-text("Show"), [aria-label*="copy"], button:has-text("복사")');
      if (showBtn) {
        console.log('📋 표시/복사 버튼 발견, 클릭...');
        await showBtn.click();
        await wait(2000);
        await snap(p, '03_after_show');
      }
    }

  } catch (e) {
    console.log('❌ 오류:', e.message);
    await snap(p, '02_error');
  }

  // 잠시 유지
  console.log('\n창이 열려 있습니다. 확인 후 닫으세요.');
  await wait(30000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
