#!/usr/bin/env node
/**
 * verify_posts.js — 예약발행 확인 + 자동 수정 + 텔레그램 보고
 *
 * 매일 KST 09:30 (UTC 00:30) Windows 작업 스케줄러로 자동 실행.
 * 실행 순서:
 *   1. data/posts_log.json 에서 어제 작업 목록 로드
 *   2. gh workflow run deploy.yml 로 즉시 배포 트리거
 *   3. 2분 대기 후 전체 URL 상태 확인 (실패 시 자동 수정 + 재확인)
 *   4. 결과를 텔레그램으로 전송
 */

import https from 'https';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const LOG_PATH     = path.join(ROOT, 'data', 'posts_log.json');
const CONTENT_ROOT = path.join(ROOT, 'content', 'posts');
const REPO         = 'dmazone/blogauto';

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

// ── 404 발견 시 자동 수정 (draft:true 또는 미래 날짜) ───────────────────────
async function autoFix(post) {
  const mdPath = path.join(CONTENT_ROOT, post.sectionDir ?? post.sectionId, post.slug, 'index.md');
  if (!existsSync(mdPath)) {
    console.log(`⚠️ 파일 없음: ${mdPath}`);
    return false;
  }

  let content = readFileSync(mdPath, 'utf8');
  let changed  = false;

  // draft: true → false
  if (/^draft:\s*true/m.test(content)) {
    content = content.replace(/^draft:\s*true/m, 'draft: false');
    changed = true;
    console.log(`🔧 draft 수정: ${post.slug}`);
  }

  // date가 현재보다 미래이면 현재 KST로 수정
  const dateMatch = content.match(/^date:\s*(.+)$/m);
  if (dateMatch) {
    const postDate = new Date(dateMatch[1].trim());
    if (!isNaN(postDate) && postDate > new Date()) {
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const p   = n => String(n).padStart(2, '0');
      const fix = `${now.getUTCFullYear()}-${p(now.getUTCMonth()+1)}-${p(now.getUTCDate())}T${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:00+09:00`;
      content = content.replace(/^date:\s*.+$/m, `date: ${fix}`);
      changed = true;
      console.log(`🔧 날짜 수정: ${post.slug} → ${fix}`);
    }
  }

  if (!changed) return false;

  writeFileSync(mdPath, content, 'utf8');
  try {
    execSync(`git -C "${ROOT}" add "${mdPath}"`, { stdio: 'pipe' });
    execSync(`git -C "${ROOT}" commit -m "fix: ${post.title ?? post.slug} 발행 오류 자동 수정"`, { stdio: 'pipe' });
    execSync(`git -C "${ROOT}" push`, { stdio: 'pipe' });
    console.log(`✅ 자동 수정 push 완료: ${post.slug}`);
    return true;
  } catch (err) {
    console.warn(`⚠️ git push 실패: ${err.message}`);
    return false;
  }
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

  // 2. URL 확인 → 실패 시 자동 수정 후 재확인
  const results = [];
  let anyFixed = false;
  for (const post of posts) {
    let ok = await checkUrl(post.url);
    if (!ok) {
      console.log(`❌ 미게재 — 자동 수정 시도: ${post.title}`);
      const fixed = await autoFix(post);
      if (fixed) {
        anyFixed = true;
        await sleep(30_000); // 30초 후 재확인
        ok = await checkUrl(post.url);
      } else {
        await sleep(15_000);
        ok = await checkUrl(post.url); // 단순 재시도
      }
    }
    results.push({ ...post, ok });
    console.log(`${ok ? '✅' : '❌'} ${post.title}`);
  }

  // 수정이 있었으면 배포 한 번 더 트리거
  if (anyFixed) {
    console.log('🔄 수정 건 재배포 트리거...');
    await triggerDeploy();
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
    lines.push(`⚠️ 미게재 ${failCount}개 — 자동 수정 처리 완료 (재확인 권장)`);
  } else {
    lines.push('');
    lines.push('🎉 전체 정상 게재 완료!');
  }

  await sendTelegram(lines.join('\n'));
  console.log('📱 텔레그램 발행 확인 보고 전송 완료');
}

main().catch(async (err) => {
  console.error('❌ verify_posts 오류:', err.message);
  await sendTelegram(`❌ 발행 확인 스크립트 오류: ${err.message}`);
  process.exit(1);
});
