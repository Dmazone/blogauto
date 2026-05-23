/**
 * telegram.js — 텔레그램 메시지 전송 공통 헬퍼
 */
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TOKEN   = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegram(text) {
  if (!TOKEN || !CHAT_ID) {
    console.warn('⚠️  TELEGRAM_TOKEN / TELEGRAM_CHAT_ID 미설정 — 알림 건너뜀');
    return;
  }
  const body = JSON.stringify({ chat_id: CHAT_ID, text });
  return new Promise((resolve) => {
    const req = https.request(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', (err) => { console.warn('텔레그램 전송 오류:', err.message); resolve(); });
    req.write(body);
    req.end();
  });
}
