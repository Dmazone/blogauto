/**
 * threads_api.js — Threads 공식 API 클라이언트
 *
 * 포스팅 전용 (스하리/팔로우는 API 미지원 → 브라우저 자동화 유지).
 * 토큰 만료(60일) 시 자동 갱신.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = path.join(__dirname, '..', '.env');
dotenv.config({ path: ENV_PATH });

const API_BASE = 'https://graph.threads.net/v1.0';

function getEnv(key) {
  return process.env[key] ?? '';
}

async function apiFetch(endpoint, opts = {}) {
  const res  = await fetch(`${API_BASE}${endpoint}`, opts);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Threads API 오류: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

/**
 * 단기 토큰 → 장기 토큰(60일) 교환.
 * 토큰이 이미 장기 토큰이면 그대로 반환.
 */
export async function refreshLongLivedToken() {
  const token     = getEnv('THREADS_ACCESS_TOKEN');
  const appSecret = getEnv('THREADS_APP_SECRET');

  const data = await apiFetch(
    `/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${token}`
  ).catch(() => null);

  if (!data?.access_token || data.access_token === token) return token;

  // .env 파일에 갱신된 토큰 저장
  let envContent = readFileSync(ENV_PATH, 'utf8');
  envContent = envContent.replace(
    /^THREADS_ACCESS_TOKEN=.*/m,
    `THREADS_ACCESS_TOKEN=${data.access_token}`
  );
  writeFileSync(ENV_PATH, envContent, 'utf8');
  process.env.THREADS_ACCESS_TOKEN = data.access_token;

  return data.access_token;
}

/**
 * Threads에 텍스트 게시 (2단계: 컨테이너 생성 → 발행).
 * @param {string} text 게시할 텍스트 (URL 포함)
 * @returns {string} 발행된 포스트 ID
 */
export async function postToThreads(text) {
  const token  = getEnv('THREADS_ACCESS_TOKEN');
  const userId = getEnv('META_THREADS_USER_ID');

  if (!token || !userId) {
    throw new Error('THREADS_ACCESS_TOKEN 또는 META_THREADS_USER_ID가 .env에 없습니다');
  }

  // 1단계: 미디어 컨테이너 생성
  const container = await apiFetch(`/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'TEXT',
      text,
      access_token: token,
    }),
  });

  // API 권고 대기 (컨테이너 준비 시간)
  await new Promise(r => setTimeout(r, 5000));

  // 2단계: 발행
  const result = await apiFetch(`/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: token,
    }),
  });

  return result.id;
}
