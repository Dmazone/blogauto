/**
 * gcp_inspect_form.mjs — OAuth 폼 DOM 구조 파악 + 인터랙션 테스트
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
  await p.screenshot({ path: `data/inspect_${name}.png` });
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

  // OAuth 클라이언트 만들기 페이지로 바로 이동
  console.log('1️⃣ OAuth 클라이언트 만들기 페이지...');
  await p.goto(
    'https://console.cloud.google.com/apis/credentials/oauthclient?project=gws-workspace-60127',
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(5000);
  await snap(p, '01_form');

  // DOM 구조 파악
  console.log('\n--- DOM 구조 ---');
  const structure = await p.evaluate(() => {
    const result = [];
    // select 요소
    document.querySelectorAll('select').forEach((el, i) => {
      result.push(`select[${i}]: id="${el.id}" name="${el.name}" options=${el.options.length}`);
    });
    // mat-select
    document.querySelectorAll('mat-select').forEach((el, i) => {
      result.push(`mat-select[${i}]: id="${el.id}" aria-label="${el.getAttribute('aria-label')}"`);
    });
    // mat-mdc-select
    document.querySelectorAll('.mat-mdc-select').forEach((el, i) => {
      result.push(`.mat-mdc-select[${i}]: aria-label="${el.getAttribute('aria-label')}"`);
    });
    // combobox role
    document.querySelectorAll('[role="combobox"]').forEach((el, i) => {
      result.push(`[role=combobox][${i}]: tag=${el.tagName} id="${el.id}" aria-label="${el.getAttribute('aria-label')}"`);
    });
    // listbox role
    document.querySelectorAll('[role="listbox"]').forEach((el, i) => {
      result.push(`[role=listbox][${i}]: visible=${el.offsetParent !== null}`);
    });
    // buttons
    document.querySelectorAll('button').forEach((el, i) => {
      if (el.textContent.trim()) {
        result.push(`button[${i}]: "${el.textContent.trim().slice(0, 50)}" type="${el.type}"`);
      }
    });
    // inputs
    document.querySelectorAll('input').forEach((el, i) => {
      result.push(`input[${i}]: id="${el.id}" type="${el.type}" placeholder="${el.placeholder}" formcontrolname="${el.getAttribute('formcontrolname')}"`);
    });
    return result;
  });
  structure.forEach(s => console.log(' ', s));

  // 드롭다운 클릭 시도 (select 요소라면)
  console.log('\n2️⃣ 애플리케이션 유형 드롭다운 클릭 시도...');

  // 먼저 select 시도
  const selectCount = await p.locator('select').count();
  console.log('  select 요소 수:', selectCount);

  if (selectCount > 0) {
    try {
      await p.selectOption('select', { label: /데스크톱/i });
      console.log('  ✅ select로 데스크톱 선택!');
    } catch (e) {
      console.log('  ⚠️ select 옵션 없음:', e.message.slice(0, 80));
      // 값으로 시도
      try {
        const opts = await p.evaluate(() => {
          const sel = document.querySelector('select');
          return sel ? Array.from(sel.options).map(o => `${o.value}: ${o.text}`) : [];
        });
        console.log('  select 옵션:', opts);
        if (opts.some(o => o.toLowerCase().includes('desktop') || o.includes('데스크톱'))) {
          await p.selectOption('select', opts.find(o => o.toLowerCase().includes('desktop') || o.includes('데스크톱')).split(':')[0]);
        }
      } catch {}
    }
  }

  // role=combobox 시도
  const comboCount = await p.locator('[role="combobox"]').count();
  console.log('  combobox 수:', comboCount);
  if (comboCount > 0) {
    try {
      await p.locator('[role="combobox"]').first().click({ timeout: 3000 });
      await wait(1500);
      await snap(p, '02_combo_open');

      // 옵션 목록
      const options = await p.evaluate(() => {
        const items = [];
        document.querySelectorAll('[role="option"], mat-option, .mat-option').forEach(el => {
          items.push(el.textContent.trim());
        });
        return items;
      });
      console.log('  옵션 목록:', options);

      // 데스크톱 앱 선택
      const desktopOpt = options.find(o => o.includes('데스크톱') || o.toLowerCase().includes('desktop'));
      if (desktopOpt) {
        await p.getByRole('option', { name: desktopOpt }).click({ timeout: 3000 });
        console.log('  ✅ 데스크톱 앱 선택:', desktopOpt);
      }
    } catch (e) {
      console.log('  ⚠️ combobox 클릭 실패:', e.message.slice(0, 80));
    }
  }

  await wait(2000);
  await snap(p, '03_after_type');

  // 이름 입력 필드 찾기
  console.log('\n3️⃣ 이름 입력 필드 탐색...');
  const inputInfo = await p.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(i => ({
      id: i.id,
      type: i.type,
      placeholder: i.placeholder,
      formcontrolname: i.getAttribute('formcontrolname'),
      'aria-label': i.getAttribute('aria-label'),
      value: i.value
    }));
  });
  console.log('  입력 필드:', JSON.stringify(inputInfo, null, 2));

  // 이름 필드에 값 입력
  if (inputInfo.length > 0) {
    try {
      const nameInput = p.locator('input').last();
      await nameInput.click();
      await nameInput.fill('BlogAuto Desktop');
      console.log('  ✅ 이름 입력 완료');
    } catch (e) {
      console.log('  ⚠️ 이름 입력 실패:', e.message.slice(0, 60));
    }
  }

  await wait(1000);
  await snap(p, '04_name_filled');

  // 만들기 버튼 클릭
  console.log('\n4️⃣ 만들기 버튼...');
  const buttons = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(),
      type: b.type,
      disabled: b.disabled
    }));
  });
  console.log('  버튼 목록:', JSON.stringify(buttons.filter(b => b.text)));

  try {
    // CREATE 또는 만들기 버튼 (submit 타입)
    await p.locator('button[type="submit"], button:has-text("만들기"), button:has-text("CREATE")').last().click({ timeout: 5000 });
    await wait(4000);
    await snap(p, '05_after_create');
    console.log('  ✅ 만들기 클릭 성공');

    // credentials 추출
    const bodyText = await p.evaluate(() => document.body.innerText);
    const clientId = bodyText.match(/(\d{15,}-[a-z0-9]+\.apps\.googleusercontent\.com)/)?.[1];
    const clientSecret = bodyText.match(/(GOCSPX-[A-Za-z0-9_-]+)/)?.[1];

    console.log('\n클라이언트 ID:', clientId ?? '없음');
    console.log('클라이언트 Secret:', clientSecret ? '✅ 발견!' : '없음');

    if (clientId) {
      let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
      if (env.match(/^YOUTUBE_CLIENT_ID=/m)) {
        env = env.replace(/^YOUTUBE_CLIENT_ID=.*/m, `YOUTUBE_CLIENT_ID=${clientId}`);
      } else {
        env += `\nYOUTUBE_CLIENT_ID=${clientId}\n`;
      }
      if (clientSecret) {
        if (env.match(/^YOUTUBE_CLIENT_SECRET=/m)) {
          env = env.replace(/^YOUTUBE_CLIENT_SECRET=.*/m, `YOUTUBE_CLIENT_SECRET=${clientSecret}`);
        } else {
          env += `YOUTUBE_CLIENT_SECRET=${clientSecret}\n`;
        }
      }
      fs.writeFileSync(ENV_FILE, env, 'utf-8');
      console.log('\n✅ .env 저장 완료!');
    }
  } catch (e) {
    console.log('  ⚠️ 만들기 버튼 실패:', e.message.slice(0, 80));
  }

  console.log('\n창 유지 (30초)...');
  await wait(30000);
  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
