/**
 * gcp_setup.mjs — Google Cloud Console 자동 설정
 * YouTube Data API v3 활성화 + OAuth2 클라이언트 생성 + .env 저장
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
const snap = async (p, name) => { await p.screenshot({ path: `data/gcp_${name}.png` }); console.log(`📸 ${name}`); };

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const p = await ctx.newPage();

  // ── 1. GCP 콘솔 메인 ─────────────────────────────────────────────────────
  console.log('🌐 GCP 콘솔 접속...');
  await p.goto('https://console.cloud.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(4000);
  await snap(p, '01_main');

  // ── 2. 새 프로젝트 생성 ────────────────────────────────────────────────────
  console.log('📁 새 프로젝트 생성...');
  // 프로젝트 선택 드롭다운 클릭
  try {
    await p.click('[data-testid="project-selector-button"], .cfc-switcher-button, button[aria-label*="project"], #cloud-shell-toolbar-button ~ * button', { timeout: 5000 });
  } catch {
    // 이미 프로젝트가 있을 수 있음 - 직접 URL로 이동
    console.log('⚠️ 프로젝트 선택기 못 찾음 - 스크린샷 확인');
    await snap(p, '02_project_select_fail');
  }
  await wait(2000);
  await snap(p, '02_project_dialog');

  // "새 프로젝트" 버튼 클릭
  try {
    await p.click('button:has-text("새 프로젝트"), a:has-text("새 프로젝트"), button:has-text("New Project")', { timeout: 5000 });
    await wait(2000);
    await snap(p, '03_new_project');

    // 프로젝트 이름 입력
    const nameInput = await p.$('input[id*="project"], input[placeholder*="프로젝트"], input[aria-label*="name"]');
    if (nameInput) {
      await nameInput.triple_click();
      await nameInput.fill('BlogAuto');
      console.log('✅ 프로젝트 이름: BlogAuto');
    }
    await wait(1000);
    await snap(p, '04_project_name');

    // 만들기 버튼
    await p.click('button:has-text("만들기"), button:has-text("Create")', { timeout: 5000 });
    await wait(5000);
    await snap(p, '05_project_created');
    console.log('✅ 프로젝트 생성 완료');
  } catch (e) {
    console.log('⚠️ 프로젝트 생성 단계 오류:', e.message);
    console.log('현재 상태를 스크린샷으로 확인해주세요: data/gcp_02_project_dialog.png');
  }

  // ── 3. YouTube Data API v3 활성화 ─────────────────────────────────────────
  console.log('🔌 YouTube Data API v3 활성화...');
  await p.goto('https://console.cloud.google.com/apis/library/youtube.googleapis.com', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(4000);
  await snap(p, '06_yt_api');

  try {
    const enableBtn = await p.$('button:has-text("사용"), button:has-text("Enable"), button:has-text("ENABLE")');
    if (enableBtn) {
      await enableBtn.click();
      await wait(5000);
      console.log('✅ YouTube Data API v3 활성화 완료');
    } else {
      console.log('ℹ️ 이미 활성화된 상태일 수 있음');
    }
    await snap(p, '07_yt_api_enabled');
  } catch (e) {
    console.log('⚠️ API 활성화 오류:', e.message);
    await snap(p, '07_yt_api_error');
  }

  // ── 4. OAuth 동의 화면 설정 ─────────────────────────────────────────────────
  console.log('🔐 OAuth 동의 화면 설정...');
  await p.goto('https://console.cloud.google.com/apis/credentials/consent', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(4000);
  await snap(p, '08_consent');

  try {
    // 외부 선택 후 만들기
    const externalBtn = await p.$('input[value="EXTERNAL"], label:has-text("외부"), label:has-text("External")');
    if (externalBtn) {
      await externalBtn.click();
      await wait(1000);
      await p.click('button:has-text("만들기"), button:has-text("Create")', { timeout: 5000 });
      await wait(3000);
      await snap(p, '09_consent_form');

      // 앱 이름 입력
      const appNameInput = await p.$('input[id*="app-name"], input[aria-label*="앱 이름"], input[aria-label*="App name"]');
      if (appNameInput) {
        await appNameInput.fill('BlogAuto YouTube');
      }
      // 이메일 선택
      const emailSelect = await p.$('mat-select[formcontrolname*="email"], select[name*="email"]');
      if (emailSelect) await emailSelect.click();
      await wait(1000);
      await snap(p, '10_consent_fill');

      // 저장 후 계속
      await p.click('button:has-text("저장 후 계속"), button:has-text("SAVE AND CONTINUE"), button:has-text("Save and Continue")', { timeout: 5000 });
      await wait(3000);

      // 나머지 단계 건너뛰기 (스코프, 테스트 사용자)
      for (let i = 0; i < 3; i++) {
        try {
          await p.click('button:has-text("저장 후 계속"), button:has-text("SAVE AND CONTINUE")', { timeout: 3000 });
          await wait(2000);
        } catch {}
      }
      await snap(p, '11_consent_done');
      console.log('✅ OAuth 동의 화면 설정 완료');
    }
  } catch (e) {
    console.log('⚠️ 동의 화면 설정 오류:', e.message);
    await snap(p, '09_consent_error');
  }

  // ── 5. OAuth 클라이언트 ID 생성 ────────────────────────────────────────────
  console.log('🔑 OAuth 클라이언트 ID 생성...');
  await p.goto('https://console.cloud.google.com/apis/credentials', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(4000);
  await snap(p, '12_credentials');

  try {
    await p.click('button:has-text("사용자 인증 정보 만들기"), button:has-text("CREATE CREDENTIALS"), button:has-text("+ CREATE CREDENTIALS")', { timeout: 5000 });
    await wait(2000);
    await snap(p, '13_create_cred');

    await p.click('text=OAuth 클라이언트 ID, text=OAuth client ID', { timeout: 5000 });
    await wait(2000);
    await snap(p, '14_oauth_type');

    // 앱 유형: 데스크톱 앱
    const typeSelect = await p.$('mat-select[formcontrolname*="applicationType"], select[name*="type"]');
    if (typeSelect) {
      await typeSelect.click();
      await wait(1000);
      await p.click('mat-option:has-text("데스크톱"), mat-option:has-text("Desktop"), option:has-text("Desktop")', { timeout: 3000 });
    }
    await wait(1000);

    // 이름 입력
    const clientNameInput = await p.$('input[formcontrolname*="name"], input[aria-label*="이름"]');
    if (clientNameInput) await clientNameInput.fill('BlogAuto Desktop');

    await snap(p, '15_oauth_config');

    // 만들기
    await p.click('button:has-text("만들기"), button:has-text("CREATE")', { timeout: 5000 });
    await wait(3000);
    await snap(p, '16_oauth_created');

    // 클라이언트 ID/Secret 추출
    const dlgText = await p.textContent('mat-dialog-content, .cdk-overlay-container, body');
    console.log('\n📋 대화상자 텍스트 (일부):');
    console.log(dlgText?.slice(0, 500));

    // ID/Secret 파싱 시도
    const clientId     = dlgText?.match(/클라이언트 ID[\s\S]*?(\d{20,}-\w+\.apps\.googleusercontent\.com)/)?.[1]
                      || dlgText?.match(/([\d]{20,}-\w+\.apps\.googleusercontent\.com)/)?.[1];
    const clientSecret = dlgText?.match(/클라이언트 보안 비밀[\s\S]*?([A-Za-z0-9_-]{20,})/)?.[1]
                      || dlgText?.match(/GOCSPX-([A-Za-z0-9_-]+)/)?.[1]?.replace(/^/, 'GOCSPX-');

    if (clientId) {
      console.log('\n✅ 클라이언트 ID 발견:', clientId);
      // .env에 저장
      let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
      if (env.match(/^YOUTUBE_CLIENT_ID=/m)) {
        env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${clientId}`);
      } else {
        env += `\nYOUTUBE_CLIENT_ID=${clientId}\n`;
      }
      if (clientSecret) {
        console.log('✅ 클라이언트 Secret 발견');
        if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
          env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${clientSecret}`);
        } else {
          env += `YOUTUBE_CLIENT_SECRET=${clientSecret}\n`;
        }
      }
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('✅ .env 저장 완료');
    } else {
      console.log('⚠️ 자동 추출 실패 — 스크린샷(data/gcp_16_oauth_created.png)에서 확인 후 수동 입력 필요');
    }
  } catch (e) {
    console.log('⚠️ OAuth 클라이언트 생성 오류:', e.message);
    await snap(p, '16_oauth_error');
  }

  console.log('\n=== 완료 ===');
  console.log('스크린샷: data/gcp_*.png 에서 단계별 확인 가능');
  // 창 유지 (사용자가 확인할 수 있도록)
  await wait(60000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
