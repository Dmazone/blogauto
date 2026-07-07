#!/usr/bin/env node
/**
 * daily_runner.js — 12개 섹션 하루 6개씩 예약발행 (홀/짝 그룹 교대)
 *
 * 사용법:
 *   node scripts/daily_runner.js                    # 브라우저 모드 (제미나이 웹, Gem)
 *   node scripts/daily_runner.js --from 3           # 3번째 섹션부터 재개
 *   node scripts/daily_runner.js --only economy,health  # 특정 섹션만
 *
 * 예약발행 원리:
 *   - 그룹 1(홀수날): latest-tech, economy, society, humanities, entertainment, japan-trends
 *   - 그룹 2(짝수날): health, it-devices, kr-realestate, world-travel, sports, us-trends
 *   - 각 글의 publishDate = 07:00, 07:30, ..., 09:30 KST (30분 간격 × 6개)
 *   - Hugo 빌드 시 publishDate가 지난 글만 포함
 *   - scheduled-deploy.yml 이 30분마다 재빌드 → 글 하나씩 공개
 */

import { runForSection, setGeminiBrowserSession } from './agent_core.js';
import { SECTIONS, getSectionById, getHealthSubtopic } from './sections.js';
import { sendTelegram } from './telegram.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ── 파일 로그 (Task Scheduler 실행 시 콘솔 출력이 사라지므로 파일에도 기록) ──
const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, `runner-${new Date().toISOString().slice(0, 10)}.log`);
mkdirSync(LOG_DIR, { recursive: true });

const log = (emoji, msg) => {
  const line = `[${new Date().toISOString()}] ${emoji}  ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch {}
};

/**
 * 오늘 날짜 기준 홀/짝으로 발행 그룹 결정
 * 홀수 날 → 그룹 1 (latest-tech, economy, society, humanities, entertainment)
 * 짝수 날 → 그룹 2 (health, it-devices, kr-realestate, world-travel, sports)
 */
function getTodayGroup() {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = kstDate.getUTCDate();
  return day % 2 === 1 ? 1 : 2;
}

/**
 * 다음날 KST 07:00 기준 + index * 30분 오프셋 ISO 날짜
 * 5개 기준: 07:00, 07:30, 08:00, 08:30, 09:00
 */
function getPublishDate(sectionIndex) {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  // KST 07:00 = UTC 전날 22:00 → UTC 00:00 기준 -120분
  const offsetMinutes = -120 + sectionIndex * 30;
  tomorrow.setMinutes(tomorrow.getMinutes() + offsetMinutes);
  const kst = new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000);
  const p   = (n) => String(n).padStart(2, '0');
  return (
    `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}` +
    `T${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:00+09:00`
  );
}

/**
 * 즉시 발행용: 현재 시각 + index * 30분 오프셋 ISO 날짜 (오늘 날짜, 과거 시각도 Hugo가 즉시 공개)
 */
function getNowPublishDate(sectionIndex) {
  const now = new Date(Date.now() + sectionIndex * 30 * 60 * 1000);
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p   = (n) => String(n).padStart(2, '0');
  return (
    `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}` +
    `T${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:00+09:00`
  );
}

async function main() {
  const args    = process.argv.slice(2);
  const publishNow = args.includes('--now'); // 예약 없이 즉시 발행 (재발행/복구용)

  // --from N : N번째(1-based)부터 재개
  const fromIdx = (() => {
    const i = args.indexOf('--from');
    return i >= 0 ? Math.max(0, Number(args[i + 1]) - 1) : 0;
  })();

  // --only a,b : 특정 섹션만
  const onlyIds = (() => {
    const i = args.indexOf('--only');
    return i >= 0 ? args[i + 1].split(',').map((s) => s.trim()) : null;
  })();

  // 그룹 자동 선택 (홀수 날=1, 짝수 날=2) — --only 또는 --from 시 무시
  const todayGroup = getTodayGroup();
  const targetSections = onlyIds
    ? onlyIds.map((id) => getSectionById(id)).filter(Boolean)
    : fromIdx > 0
      ? SECTIONS.filter(s => s.group === todayGroup).slice(fromIdx)
      : SECTIONS.filter(s => s.group === todayGroup);

  // ── 브라우저 모드 초기화 ────────────────────────────────────────────────
  const { GeminiSession } = await import('./gemini_browser.js');
  const gemUrl = process.env.GEMINI_GEM_URL || null;
  const geminiSession = new GeminiSession({ headless: false, gemUrl });
  await geminiSession.init();
  setGeminiBrowserSession(geminiSession);
  if (gemUrl) {
    log('💎', `Gem 모드: ${gemUrl}`);
  } else {
    log('⚠️', 'GEMINI_GEM_URL 미설정 → 일반 채팅 사용');
  }

  log('🚀', `daily_runner 시작 — 그룹 ${todayGroup} / ${targetSections.length}개 섹션`);
  log('📅', publishNow ? `즉시 발행 모드 (30분 간격)` : `예약 발행: 07:00~09:30 KST (다음날, 30분 간격)`);
  console.log('');

  // ── 텔레그램 시작 알림 ──────────────────────────────────────────────────
  const startDate = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const tomorrowStr = (() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return t.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  })();
  await sendTelegram(
    `🚀 트렌드줌 ${publishNow ? '즉시발행' : '예약발행'} 작업 시작!\n` +
    `📅 작업일: ${startDate}\n` +
    `📂 그룹 ${todayGroup} (${targetSections.map(s=>s.name).join(', ')})\n` +
    `⏰ ${publishNow ? '즉시 발행 (30분 간격)' : `발행 예정: ${tomorrowStr} 07:00~09:30 KST`}\n` +
    `📝 총 ${targetSections.length}개 고품질 포스팅 진행합니다.`
  );

  const healthSubtopic = getHealthSubtopic();
  let successCount = 0, failCount = 0;
  const publishedPosts = []; // 성공한 포스트 목록 (텔레그램 알림용)

  for (let i = 0; i < targetSections.length; i++) {
    const section   = targetSections[i];
    const globalIdx = targetSections.findIndex((s) => s.id === section.id);
    const dateStr   = publishNow ? getNowPublishDate(i) : getPublishDate(globalIdx);
    const subtopic  = section.id === 'health' ? healthSubtopic : null;

    log('📰', `[${i + 1}/${targetSections.length}] ${section.name}${subtopic ? ` (${subtopic})` : ''}`);
    log('📅', `발행 예약: ${dateStr}`);

    let sectionSuccess = false;
    // 최대 3회 시도 (첫 실패 시 3분 후 재시도)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await runForSection(section, { subtopic, dateOverride: dateStr, skipSns: false });
        successCount++;
        if (result?.title && result?.slug) {
          publishedPosts.push({ ...result, sectionId: section.id });
        } else if (result === undefined) {
          // 이미 존재하는 포스팅 스킵 — 성공으로 간주
          log('⏭️', `${section.name}: 이미 발행된 포스팅 스킵`);
        }
        sectionSuccess = true;
        break;
      } catch (err) {
        log('❌', `${section.name} 실패 (시도 ${attempt}/2): ${err.message}`);
        if (process.env.DEBUG) appendFileSync(LOG_FILE, err.stack + '\n', 'utf8');
        if (attempt < 2) {
          log('⏳', '3분 후 재시도...');
          await new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000));
        }
      }
    }

    if (!sectionSuccess) failCount++;

    // 마지막 섹션이 아니면 20분 대기 (이미지 생성 API 부하 분산)
    if (i < targetSections.length - 1) {
      log('⏸️', '다음 섹션까지 20분 대기...');
      await new Promise((resolve) => setTimeout(resolve, 20 * 60 * 1000));
    }
  }

  // ── 브라우저 정리 ────────────────────────────────────────────────────────
  if (geminiSession) {
    await geminiSession.close();
    log('🔒', '브라우저 세션 종료');
  }

  console.log('\n' + '='.repeat(60));
  log('🎉', `완료 — 성공 ${successCount}개 / 실패 ${failCount}개`);
  console.log('='.repeat(60));

  // ── posts_log.json 저장 (verify_posts.js가 다음날 읽음) ─────────────────
  savePostsLog(publishedPosts, targetSections.length);

  // ── 텔레그램 완료 알림 ──────────────────────────────────────────────────
  await sendTelegramDailyReport(publishedPosts, successCount, failCount, publishNow);

  // ── 스레드 자동 연동 ────────────────────────────────────────────────────
  // --now 모드(즉시 발행)일 때만 자동 실행. 예약 발행 모드에서는 포스팅이
  // 07:00~09:00 KST에 공개되므로 threads_poster는 /threads-post 스킬(10:00 KST)로 실행.
  if (successCount > 0 && publishNow) {
    log('🧵', '스레드 게시 + 스하리 자동 시작 (--now 모드)...');
    const threadsProc = spawn(process.execPath, [path.join(__dirname, 'threads_poster.js')], {
      cwd:   path.join(__dirname, '..'),
      stdio: 'inherit',
      detached: false,
    });
    await new Promise((resolve) => threadsProc.on('close', resolve));
    log('✅', '스레드 게시 + 스하리 완료');
  } else if (successCount > 0) {
    log('📌', '예약 발행 모드 — threads_poster는 10:00 KST /threads-post 스킬로 별도 실행');
  }
}

function savePostsLog(posts, totalCount) {
  try {
    const baseUrl  = (process.env.BLOG_BASE_URL ?? 'https://dmazone.github.io/blogauto').replace(/\/$/, '');
    const tomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); })();
    const dataDir  = path.join(__dirname, '..', 'data');
    mkdirSync(dataDir, { recursive: true });
    const logData = {
      date:         tomorrow,
      generatedAt:  new Date().toISOString(),
      publishWindow: `${tomorrow} 07:00~09:30 KST`,
      totalCount,
      posts: posts.map((p, i) => ({
        title:      p.title,
        slug:       p.slug,
        sectionDir: p.sectionDir,
        url:        `${baseUrl}/posts/${p.sectionDir}/${p.slug}/`,
        publishTime: `0${7 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'} KST`,
      })),
    };
    writeFileSync(path.join(dataDir, 'posts_log.json'), JSON.stringify(logData, null, 2), 'utf8');
    log('💾', 'posts_log.json 저장 완료');
  } catch (err) {
    log('⚠️', `posts_log 저장 실패: ${err.message}`);
  }
}

async function sendTelegramDailyReport(posts, successCount, failCount, publishNow = false) {
  const baseUrl  = (process.env.BLOG_BASE_URL ?? 'https://dmazone.github.io/blogauto').replace(/\/$/, '');
  const tomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return t.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }); })();
  const todayStr = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  const lines = [
    `✅ 트렌드줌 ${publishNow ? '즉시발행' : '예약발행'} 완료!`,
    `📅 ${publishNow ? `발행 완료: ${todayStr} (즉시 공개)` : `발행 예정: ${tomorrow} 07:00~09:30 KST`}`,
    `성공 ${successCount}개 / 실패 ${failCount}개`,
    '',
  ];

  posts.forEach((p, i) => {
    const url = `${baseUrl}/posts/${p.sectionDir}/${p.slug}/`;
    lines.push(`${i + 1}. ${p.title}`);
    lines.push(`   ${url}`);
  });

  lines.push('', `🔗 블로그: ${baseUrl}/`);

  await sendTelegram(lines.join('\n'));
  log('📱', '텔레그램 완료 알림 전송');
}

main().catch((err) => {
  console.error('❌ daily_runner 치명적 오류:', err.message);
  process.exit(1);
});
