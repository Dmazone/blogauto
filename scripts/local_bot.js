/**
 * local_bot.js — PC에서 실행하는 Telegram 폴링 봇
 *
 * 역할:
 *   /prorun 명령을 감지해 Gemini Pro 브라우저 자동화 실행
 *   실행 중에는 Cloudflare Worker 웹훅이 일시 중지됨
 *
 * 실행:
 *   node scripts/local_bot.js
 *
 * 종료:
 *   Ctrl+C → 웹훅 자동 복원
 */

import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID);
const WORKER_URL = 'https://trendzoom-bot.ekaledma.workers.dev';

if (!TOKEN || !CHAT_ID) {
  console.error('❌ TELEGRAM_TOKEN, TELEGRAM_CHAT_ID 환경변수가 필요합니다.');
  console.error('   .env 파일에 설정하거나 직접 export 해주세요.');
  process.exit(1);
}

async function tgApi(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function send(text) {
  await tgApi('sendMessage', { chat_id: CHAT_ID, text, parse_mode: 'Markdown' });
}

async function deleteWebhook() {
  await tgApi('deleteWebhook');
  console.log('✅ 웹훅 비활성화 — 로컬 폴링 시작');
}

async function restoreWebhook() {
  await tgApi('setWebhook', { url: WORKER_URL });
  console.log('✅ 웹훅 복원 완료');
}

function runDailyRunner(sections) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/daily_runner.js'];
    if (sections) args.push('--only', sections);

    const proc = spawn('node', args, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env },
    });

    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`종료 코드: ${code}`)));
  });
}

async function main() {
  await deleteWebhook();
  await send('🖥 *로컬 봇 시작됨*\n/prorun 명령을 기다리고 있습니다.');

  let offset = 0;

  process.on('SIGINT', async () => {
    console.log('\n종료 중...');
    await restoreWebhook();
    await send('🔌 로컬 봇 종료 — 클라우드 봇으로 복원됐습니다.');
    process.exit(0);
  });

  while (true) {
    try {
      const data = await tgApi('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });

      for (const update of data.result ?? []) {
        offset = update.update_id + 1;
        const text = (update.message?.text ?? '').trim();
        const chatId = String(update.message?.chat?.id ?? '');

        if (chatId !== CHAT_ID) continue;

        if (text.startsWith('/prorun')) {
          const sections = text.replace('/prorun', '').trim();
          const label = sections ? `"${sections}" 섹션` : '전체 10개 섹션';
          await send(`🚀 *${label} Pro 실행 시작!*\n\nGemini Pro 브라우저 자동화 중...\n완료되면 알림 드릴게요.`);

          try {
            await runDailyRunner(sections);
            await send(`✅ *${label} Pro 실행 완료!*`);
          } catch (err) {
            await send(`❌ 실행 실패: ${err.message}`);
          }
        } else if (text.startsWith('/softrun')) {
          await send('☁️ /softrun은 클라우드 봇에서 처리됩니다.\n로컬 봇 종료(Ctrl+C) 후 사용하세요.');
        } else if (text === '/status') {
          await send('📊 /status는 클라우드 봇에서 확인하세요.\n로컬 봇 종료(Ctrl+C) 후 사용하세요.');
        }
      }
    } catch (err) {
      console.error('polling 오류:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main();
