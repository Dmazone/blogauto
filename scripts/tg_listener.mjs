/**
 * tg_listener.mjs — 텔레그램 봇 수신 리스너
 *
 * 용도: 텔레그램에서 사용자 명령을 수신하여 스크립트 실행 or Claude CLI 처리
 * 실행: node scripts/tg_listener.mjs
 * 상시: pm2 start scripts/tg_listener.mjs --name tg-listener
 */

import https from 'https';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const TOKEN   = process.env.TELEGRAM_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID);

if (!TOKEN || !CHAT_ID) {
  console.error('❌ TELEGRAM_TOKEN / TELEGRAM_CHAT_ID 미설정');
  process.exit(1);
}

// ── Telegram API ──────────────────────────────────────────────
function tgRequest(method, body = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TOKEN}/${method}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function send(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 4096) chunks.push(text.slice(i, i + 4096));
  for (const chunk of chunks) {
    await tgRequest('sendMessage', { chat_id: CHAT_ID, text: chunk });
  }
}

// ── 프로세스 실행 ─────────────────────────────────────────────
function runProc(cmd, args = [], timeoutMs = 300000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: ROOT, shell: true, timeout: timeoutMs });
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (out += d.toString()));
    proc.on('close', (code) => resolve({ code, out: out.trim() || '(출력 없음)' }));
    proc.on('error', (e) => resolve({ code: -1, out: e.message }));
  });
}

// ── Claude CLI 비대화형 실행 ──────────────────────────────────
function runClaude(prompt) {
  return new Promise((resolve) => {
    const proc = spawn(
      'claude',
      ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'text'],
      { cwd: ROOT, shell: true, timeout: 180000 }
    );
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (out += d.toString()));
    proc.on('close', () => resolve(out.trim() || '(응답 없음)'));
    proc.on('error', (e) => resolve(`오류: ${e.message}`));
  });
}

// ── 명령어 처리 ───────────────────────────────────────────────
const HELP = `📋 트렌드줌 봇 명령어

/post — 오늘 포스팅 7개 발행
/post-from N — N번째 섹션부터 재개
/post-only 섹션,섹션 — 특정 섹션만
/verify — 발행 상태 검증
/fiximg — 누락 이미지 복구
/indexnow — Bing/Yahoo IndexNow 제출
/status — 최신 로그 요약
/help — 이 도움말

💬 그 외 자유 텍스트 → Claude가 직접 처리 및 조치`;

async function handleText(text) {
  const t = text.trim();

  if (t === '/help' || t === '/start') return HELP;

  // /post — 전체 발행
  if (t === '/post') {
    await send('⏳ 포스팅 시작... (완료까지 수분 소요)');
    const { code, out } = await runProc('node', ['scripts/daily_runner.js'], 600000);
    return `${code === 0 ? '✅' : '❌'} 포스팅 ${code === 0 ? '완료' : '실패'}\n\n${out.slice(-800)}`;
  }

  // /post-from N
  const fromM = t.match(/^\/post[-\s]from\s+(\d+)$/i);
  if (fromM) {
    await send(`⏳ ${fromM[1]}번부터 재개 중...`);
    const { code, out } = await runProc('node', ['scripts/daily_runner.js', '--from', fromM[1]], 600000);
    return `${code === 0 ? '✅' : '❌'} 완료\n\n${out.slice(-800)}`;
  }

  // /post-only 섹션,...
  const onlyM = t.match(/^\/post[-\s]only\s+(.+)$/i);
  if (onlyM) {
    await send(`⏳ [${onlyM[1]}] 발행 중...`);
    const { code, out } = await runProc('node', ['scripts/daily_runner.js', '--only', onlyM[1]], 600000);
    return `${code === 0 ? '✅' : '❌'} 완료\n\n${out.slice(-800)}`;
  }

  if (t === '/verify') {
    const { code, out } = await runProc('node', ['scripts/verify_posts.js'], 60000);
    return `${code === 0 ? '✅' : '❌'} 검증 결과\n\n${out.slice(-1000)}`;
  }

  if (t === '/fiximg') {
    await send('⏳ 이미지 복구 중...');
    const { code, out } = await runProc('node', ['scripts/fix_missing_images.mjs'], 600000);
    return `${code === 0 ? '✅' : '❌'} 이미지 복구\n\n${out.slice(-800)}`;
  }

  if (t === '/indexnow') {
    const { code, out } = await runProc('node', ['scripts/submit_all_indexnow.mjs'], 60000);
    return `${code === 0 ? '✅' : '❌'} IndexNow\n\n${out.slice(-500)}`;
  }

  if (t === '/status') {
    const { out } = await runProc('node', ['-e',
      `import('./scripts/telegram.js').then(()=>{});` +
      `const fs = await import('fs');` +
      `const logs = fs.readdirSync('logs').filter(f=>f.endsWith('.log')||f.endsWith('.md')).slice(-1);` +
      `if(logs[0]){const c=fs.readFileSync('logs/'+logs[0],'utf8');console.log(c.slice(-1500));}`,
    ], 10000);
    return `📊 최신 로그\n\n${out.slice(-1500)}`;
  }

  // 자유 텍스트 → Claude CLI
  await send('🤖 Claude 처리 중... (최대 3분)');
  const result = await runClaude(t);
  return result.slice(0, 3800);
}

// ── Long polling 루프 ─────────────────────────────────────────
let offset = 0;
let running = false;

async function poll() {
  try {
    const res = await tgRequest('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
    if (!res.ok || !Array.isArray(res.result)) return;

    for (const update of res.result) {
      offset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text) continue;

      // 인증된 CHAT_ID만 처리
      if (String(msg.chat.id) !== CHAT_ID) {
        console.log(`⚠️  미인증 발신자 무시: ${msg.chat.id}`);
        continue;
      }

      if (running) {
        await send('⏳ 이전 명령 처리 중입니다. 완료 후 재시도해주세요.');
        continue;
      }

      console.log(`📩 [${new Date().toLocaleString('ko-KR')}] 수신: ${msg.text}`);
      running = true;
      handleText(msg.text)
        .then((reply) => send(reply))
        .catch((e) => send(`❌ 처리 오류: ${e.message}`))
        .finally(() => { running = false; });
    }
  } catch (e) {
    if (!e.message?.includes('ECONNRESET') && !e.message?.includes('timeout')) {
      console.error('polling 오류:', e.message);
    }
  }
}

// ── 시작 ─────────────────────────────────────────────────────
console.log(`🤖 트렌드줌 텔레그램 봇 시작 (CHAT_ID: ${CHAT_ID})`);
await send('🤖 트렌드줌 봇 온라인\n/help 로 명령어 확인');

while (true) {
  await poll();
  await new Promise((r) => setTimeout(r, 500));
}
