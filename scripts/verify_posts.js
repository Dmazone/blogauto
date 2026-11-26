#!/usr/bin/env node
/**
 * verify_posts.js — 발행 확인 + 누락 자동 복구 + YouTube 재업로드
 *
 * 매일 KST 09:30 (UTC 00:30) Windows 작업 스케줄러로 자동 실행.
 * 실행 순서:
 *   1. 오늘 날짜 포스팅 개수 확인 → 7개 미만이면 누락 섹션 자동 재발행
 *   2. pending_yt_upload.json 확인 → 실패한 YouTube 업로드 자동 재시도
 *   3. gh workflow run deploy.yml 로 즉시 배포 트리거
 *   4. 전체 URL 상태 확인 + 자동 수정
 *   5. 결과 텔레그램 보고
 */

import https from 'https';
import fs from 'fs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const LOG_PATH        = path.join(ROOT, 'data', 'posts_log.json');
const PENDING_YT_PATH = path.join(ROOT, 'data', 'pending_yt_upload.json');
const CONTENT_ROOT    = path.join(ROOT, 'content', 'posts');
const REPO            = 'dmazone/blogauto';

const GROUP1 = ['latest-tech', 'economy', 'society', 'humanities', 'entertainment', 'japan-trends'];
const GROUP2 = ['health', 'it-devices', 'kr-realestate', 'world-travel', 'sports', 'us-trends'];
const ALL_SECTIONS = [...GROUP1, ...GROUP2, 'trending-picks'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
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

// ── 특정 날짜(YYYY-MM-DD)에 예약된 포스팅을 섹션별로 반환 ─────────────────
function getPostedSectionsByDate(targetDate) {
  const found = new Set();
  for (const section of ALL_SECTIONS) {
    const sectionDir = path.join(CONTENT_ROOT, section);
    if (!existsSync(sectionDir)) continue;
    const slugs = fs.readdirSync(sectionDir).filter(d => {
      try { return fs.statSync(path.join(sectionDir, d)).isDirectory(); } catch { return false; }
    });
    for (const slug of slugs) {
      const mdPath = path.join(sectionDir, slug, 'index.md');
      if (!existsSync(mdPath)) continue;
      const content = readFileSync(mdPath, 'utf8');
      const m = content.match(/^date:\s*(.+)/m);
      if (m && m[1].trim().startsWith(targetDate)) {
        found.add(section);
        break;
      }
    }
  }
  return found;
}

// ── 누락 섹션 자동 재발행 ────────────────────────────────────────────────
async function repairMissingSections(missingSections, targetDate) {
  if (missingSections.length === 0) return 0;

  log('🔧', `누락 섹션 자동 복구: ${missingSections.join(', ')}`);
  await sendTelegram(
    `🔧 트렌드줌 포스팅 누락 감지!\n` +
    `📅 날짜: ${targetDate}\n` +
    `❌ 누락: ${missingSections.join(', ')}\n` +
    `→ 자동 복구 시작...`
  );

  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [
      path.join(__dirname, 'daily_runner.js'),
      '--only', missingSections.join(','),
      '--date', targetDate,
      '--now',
    ], { cwd: ROOT, stdio: 'inherit' });
    proc.on('close', code => {
      log(code === 0 ? '✅' : '⚠️', `누락 복구 완료 (exit ${code})`);
      resolve(code);
    });
    proc.on('error', err => {
      log('⚠️', `누락 복구 실행 오류: ${err.message}`);
      resolve(1);
    });
  });
}

// ── pending YouTube 재업로드 ──────────────────────────────────────────────
async function retryPendingYouTubeUploads() {
  if (!existsSync(PENDING_YT_PATH)) return 0;
  let pending;
  try { pending = JSON.parse(readFileSync(PENDING_YT_PATH, 'utf8')); } catch { return 0; }
  if (!pending || pending.length === 0) return 0;

  log('📤', `YouTube 재업로드 대기 목록: ${pending.length}개`);
  await sendTelegram(`📤 YouTube 누락 영상 재업로드 시작: ${pending.length}개`);

  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [
      path.join(__dirname, 'yt_upload_backlog.mjs'),
    ], { cwd: ROOT, stdio: 'inherit' });
    proc.on('close', code => {
      log(code === 0 ? '✅' : '⚠️', `YouTube 재업로드 완료 (exit ${code})`);
      resolve(code);
    });
    proc.on('error', err => {
      log('⚠️', `YouTube 재업로드 실행 오류: ${err.message}`);
      resolve(1);
    });
  });
}

// ── 404 발견 시 자동 수정 ────────────────────────────────────────────────
async function autoFix(post) {
  const mdPath = path.join(CONTENT_ROOT, post.sectionDir ?? post.sectionId, post.slug, 'index.md');
  if (!existsSync(mdPath)) { console.log(`⚠️ 파일 없음: ${mdPath}`); return false; }

  let content = readFileSync(mdPath, 'utf8');
  let changed = false;

  if (/^draft:\s*true/m.test(content)) {
    content = content.replace(/^draft:\s*true/m, 'draft: false');
    changed = true;
    console.log(`🔧 draft 수정: ${post.slug}`);
  }

  const dateMatch = content.match(/^date:\s*(.+)$/m);
  if (dateMatch) {
    const postDate = new Date(dateMatch[1].trim());
    if (!isNaN(postDate) && postDate > new Date()) {
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const p = n => String(n).padStart(2, '0');
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
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  const todayKST = `${kstNow.getUTCFullYear()}-${p(kstNow.getUTCMonth()+1)}-${p(kstNow.getUTCDate())}`;
  const today = kstNow.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const dayNum = kstNow.getUTCDate();

  log('🔍', `발행 점검 시작 — ${todayKST} (KST)`);

  // ── 1. 오늘 날짜 포스팅 개수 확인 → 누락 자동 복구 ──────────────────────
  const postedSections = getPostedSectionsByDate(todayKST);
  const group = dayNum % 2 === 1 ? 1 : 2;
  const expectedSections = [...(group === 1 ? GROUP1 : GROUP2), 'trending-picks'];
  const missingSections = expectedSections.filter(s => !postedSections.has(s));

  log('📊', `오늘(${todayKST}) 포스팅: ${postedSections.size}개 / 예상: ${expectedSections.length}개`);
  if (missingSections.length > 0) {
    log('❌', `누락 섹션: ${missingSections.join(', ')}`);
    await repairMissingSections(missingSections, todayKST);
    await sleep(5000);
  } else {
    log('✅', '포스팅 개수 정상');
  }

  // ── 2. pending YouTube 재업로드 ──────────────────────────────────────────
  await retryPendingYouTubeUploads();

  // ── 3. 배포 트리거 ───────────────────────────────────────────────────────
  await triggerDeploy();

  // ── 4. URL 확인 (posts_log.json 기반) ────────────────────────────────────
  if (!existsSync(LOG_PATH)) {
    await sendTelegram(`⚠️ 트렌드줌 발행 확인 (${today})\nposts_log.json 없음 — 어제 작업 기록 없음.`);
    return;
  }

  const logData = JSON.parse(readFileSync(LOG_PATH, 'utf8'));
  const posts   = logData.posts ?? [];
  if (posts.length === 0) {
    await sendTelegram(`⚠️ 트렌드줌 발행 확인 (${today})\n로그 포스팅 목록 비어 있음.`);
    return;
  }

  const results = [];
  let anyFixed = false;
  for (const post of posts) {
    let ok = await checkUrl(post.url);
    if (!ok) {
      console.log(`❌ 미게재 — 자동 수정 시도: ${post.title}`);
      const fixed = await autoFix(post);
      if (fixed) { anyFixed = true; await sleep(30_000); ok = await checkUrl(post.url); }
      else { await sleep(15_000); ok = await checkUrl(post.url); }
    }
    results.push({ ...post, ok });
    console.log(`${ok ? '✅' : '❌'} ${post.title}`);
  }

  if (anyFixed) { console.log('🔄 수정 건 재배포 트리거...'); await triggerDeploy(); }

  const okCount   = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;

  // ── 5. 텔레그램 보고 ─────────────────────────────────────────────────────
  const lines = [
    `📊 트렌드줌 발행 확인 완료 (${today})`,
    missingSections.length > 0
      ? `⚠️ 누락 복구: ${missingSections.join(', ')}`
      : `✅ 포스팅 정상 (${postedSections.size}개)`,
    `✅ URL 정상 ${okCount}개 / ❌ 미게재 ${failCount}개`,
    '',
  ];
  results.forEach((r, i) => {
    lines.push(`${r.ok ? '✅' : '❌'} ${i+1}. ${r.title}`);
    if (!r.ok) lines.push(`   ${r.url}`);
  });
  lines.push('', failCount > 0 ? `⚠️ 미게재 ${failCount}개 자동 수정 완료` : '🎉 전체 정상!');

  await sendTelegram(lines.join('\n'));
  log('📱', '텔레그램 발행 확인 보고 전송 완료');
}

main().catch(async (err) => {
  console.error('❌ verify_posts 오류:', err.message);
  await sendTelegram(`❌ 발행 확인 스크립트 오류: ${err.message}`);
  process.exit(1);
});
