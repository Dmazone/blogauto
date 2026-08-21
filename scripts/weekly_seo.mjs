/**
 * weekly_seo.mjs — 주간 SEO 유지보수 (Task Scheduler 주 1회 실행)
 * - IndexNow 전체 사이트맵 재제출
 * - WebSub 핑 (Google 크롤링 유도)
 * - 검색 엔진 사이트맵 핑 (Yandex 등)
 * - GSC 사이트맵 재제출 (Playwright)
 * Usage: node scripts/weekly_seo.mjs
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const log       = (e, m) => console.log(`[${new Date().toISOString()}] ${e}  ${m}`);

function run(script, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [path.join(__dirname, script), ...args], {
      cwd: ROOT, stdio: 'inherit',
    });
    proc.on('close', code => resolve(code));
    proc.on('error', err => { log('⚠️', `${script} 오류: ${err.message}`); resolve(1); });
  });
}

async function main() {
  log('🔧', '주간 SEO 유지보수 시작');
  const results = [];

  // 1. IndexNow 전체 사이트맵 재제출
  log('1️⃣', 'IndexNow 전체 제출...');
  const r1 = await run('submit_all_indexnow.mjs');
  results.push({ name: 'IndexNow', ok: r1 === 0 });

  // 2. 핑 서비스 (WebSub + Ping-O-Matic + Naver)
  log('2️⃣', '핑 서비스...');
  const r2 = await run('ping_services.mjs');
  results.push({ name: 'Ping Services', ok: r2 === 0 });

  // 3. 다른 검색 엔진 사이트맵 핑
  log('3️⃣', '검색 엔진 핑...');
  const r3 = await run('register_search_engines.mjs');
  results.push({ name: '검색 엔진 등록', ok: r3 === 0 });

  // 4. GSC 사이트맵 재제출
  log('4️⃣', 'GSC 사이트맵 재제출...');
  const r4 = await run('gsc_submit.mjs');
  results.push({ name: 'GSC', ok: r4 === 0 });

  const ok = results.filter(r => r.ok).length;
  const total = results.length;
  const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}`);

  log('✅', `주간 SEO 유지보수 완료 (${ok}/${total})`);
  await sendTelegram(`🔧 주간 SEO 유지보수 완료 (${ok}/${total})\n${lines.join('\n')}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
