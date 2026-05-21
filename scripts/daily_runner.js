#!/usr/bin/env node
/**
 * daily_runner.js — 10개 섹션 하루 1개씩 예약발행
 *
 * 사용법:
 *   node scripts/daily_runner.js                    # 브라우저 모드 (제미나이 웹)
 *   node scripts/daily_runner.js --api              # API 모드 (Gemini API 키 필요)
 *   node scripts/daily_runner.js --from 3           # 3번째 섹션부터 재개
 *   node scripts/daily_runner.js --only economy,health  # 특정 섹션만
 *
 * 예약발행 원리:
 *   - 10개 글을 연속으로 생성
 *   - 각 글의 publishDate = 09:00, 09:05, ..., 09:45 KST
 *   - Hugo 빌드 시 publishDate가 지난 글만 포함
 *   - scheduled-deploy.yml 이 5분마다 재빌드 → 글 하나씩 공개
 */

import { runForSection, setGeminiBrowserSession } from './agent_core.js';
import { SECTIONS, getSectionById, getHealthSubtopic } from './sections.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

/** 오늘 KST 09:00 기준 + index * 5분 오프셋 ISO 날짜 */
function getPublishDate(sectionIndex) {
  const now  = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  base.setMinutes(base.getMinutes() + sectionIndex * 5);
  const kst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const p   = (n) => String(n).padStart(2, '0');
  return (
    `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}` +
    `T${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:00+09:00`
  );
}

async function main() {
  const args    = process.argv.slice(2);
  const useApi  = args.includes('--api');

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

  const targetSections = onlyIds
    ? onlyIds.map((id) => getSectionById(id)).filter(Boolean)
    : SECTIONS.slice(fromIdx);

  // ── 브라우저 모드 초기화 ────────────────────────────────────────────────
  let geminiSession = null;

  if (!useApi) {
    const { GeminiSession } = await import('./gemini_browser.js');
    geminiSession = new GeminiSession({ headless: false });
    await geminiSession.init();
    setGeminiBrowserSession(geminiSession);
  } else {
    log('🔑', 'API 모드 — Gemini API 키 사용');
  }

  log('🚀', `daily_runner 시작 — ${targetSections.length}개 섹션`);
  log('📅', `예약 발행: 09:00~09:${String((targetSections.length - 1) * 5).padStart(2, '0')} KST`);
  console.log('');

  const healthSubtopic = getHealthSubtopic();
  let successCount = 0, failCount = 0;

  for (let i = 0; i < targetSections.length; i++) {
    const section   = targetSections[i];
    const globalIdx = SECTIONS.findIndex((s) => s.id === section.id);
    const dateStr   = getPublishDate(globalIdx);
    const subtopic  = section.id === 'health' ? healthSubtopic : null;

    log('📰', `[${i + 1}/${targetSections.length}] ${section.name}${subtopic ? ` (${subtopic})` : ''}`);
    log('📅', `발행 예약: ${dateStr}`);

    try {
      await runForSection(section, { subtopic, dateOverride: dateStr, skipSns: false });
      successCount++;
    } catch (err) {
      failCount++;
      log('❌', `${section.name} 실패: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
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
}

main().catch((err) => {
  console.error('❌ daily_runner 치명적 오류:', err.message);
  process.exit(1);
});
