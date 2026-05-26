#!/usr/bin/env node
/**
 * verify_posts.js — 예약발행 확인 + 텔레그램 보고
 *
 * 매일 KST 09:20 (UTC 00:20) Windows 작업 스케줄러로 자동 실행.
 * 실행 순서:
 *   1. data/posts_log.json 에서 어제 작업 목록 로드
 *   2. gh workflow run deploy.yml 로 즉시 배포 트리거
 *   3. 2분 대기 후 전체 URL 상태 확인 (실패 시 30초 후 재시도)
 *   4. 결과를 텔레그램으로 전송
 */

import https from 'https';
import { readFileSync, existsSync } from 'fs';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const LOG_PATH = path.join(ROOT, 'data', 'posts_log.json');
const REPO     = 'dmazone/blogauto';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 12000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function triggerDeploy() {
  try {
    execSync(`gh workflow run deploy.yml --repo ${REPO}`, { stdio: 'pipe' });
    console.log('🚀 배포 트리거 완료 — 2분 대기...');
    await sleep(120_000);
  } catch (err) {
    console.warn('⚠️  배포 트리거 실패:', err.message);
    await sleep(30_000);
  }
}

async function main() {
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  if (!existsSync(LOG_PATH)) {
    await sendTelegram(`⚠️ 트렌드줌 발행 확인 (${today})\nposts_log.json 없음 — 어제 예약발행 작업 기록이 없어요.`);
    return;
  }

  const log   = JSON.parse(readFileSync(LOG_PATH, 'utf8'));
  const posts = log.posts ?? [];

  if (posts.length === 0) {
    await sendTelegram(`⚠️ 트렌드줌 발행 확인 (${today})\n로그에 포스팅 목록이 비어 있어요.`);
    return;
  }

  // 1. 배포 트리거
  await triggerDeploy();

  // 2. URL 확인 (실패 시 30초 후 1회 재시도)
  const results = [];
  for (const post of posts) {
    let ok = await checkUrl(post.url);
    if (!ok) {
      await sleep(30_000);
      ok = await checkUrl(post.url);
    }
    results.push({ ...post, ok });
    console.log(`${ok ? '✅' : '❌'} ${post.title}`);
  }

  const okCount   = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  // 3. 텔레그램 보고
  const lines = [
    `📊 트렌드줌 발행 확인 완료 (${today})`,
    `✅ 정상 ${okCount}개 / ❌ 미게재 ${failCount}개`,
    '',
  ];

  results.forEach((r, i) => {
    lines.push(`${r.ok ? '✅' : '❌'} ${i + 1}. ${r.title}`);
    if (!r.ok) lines.push(`   ${r.url}`);
  });

  if (failCount > 0) {
    lines.push('');
    lines.push('⚠️ 미게재 항목이 있습니다. 수동 확인이 필요해요.');
  } else {
    lines.push('');
    lines.push('🎉 10개 모두 정상 게재됐어요!');
  }

  await sendTelegram(lines.join('\n'));
  console.log('📱 텔레그램 발행 확인 보고 전송 완료');

  // 포스팅이 1개 이상 정상이면 Threads 홍보 자동 시작
  if (okCount > 0) {
    console.log('🧵 Threads 홍보 자동 시작...');
    const child = spawn(
      process.execPath,
      [path.join(__dirname, 'threads_poster.js')],
      { detached: true, stdio: 'ignore', cwd: ROOT }
    );
    child.unref();
    console.log(`🧵 threads_poster.js 실행됨 (PID: ${child.pid})`);
  }
}

main().catch(async (err) => {
  console.error('❌ verify_posts 오류:', err.message);
  await sendTelegram(`❌ 발행 확인 스크립트 오류: ${err.message}`);
  process.exit(1);
});
