#!/usr/bin/env node
/**
 * daily_runner.js — 10개 섹션 하루 1개씩 5분 간격 자동 발행
 *
 * 사용법:
 *   node scripts/daily_runner.js              # 전체 10개 섹션
 *   node scripts/daily_runner.js --from 3     # 3번째 섹션부터 재개
 *   node scripts/daily_runner.js --only economy,health  # 특정 섹션만
 */

import { runForSection } from './agent_core.js';
import { SECTIONS, getSectionById, getHealthSubtopic } from './sections.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DELAY_MS = 5 * 60 * 1000; // 5분

const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 오늘 KST 09:00 기준으로 섹션 index * 5분 오프셋 적용한 ISO 날짜 반환 */
function getPublishDate(sectionIndex) {
  const now = new Date();
  // KST = UTC+9, 오전 9시 기준
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) // UTC 0:00 = KST 9:00
  );
  base.setMinutes(base.getMinutes() + sectionIndex * 5);
  // ISO 형태로 +09:00 변환
  const offsetMs  = 9 * 60 * 60 * 1000;
  const kstDate   = new Date(base.getTime() + offsetMs);
  const pad       = (n) => String(n).padStart(2, '0');
  return (
    `${kstDate.getUTCFullYear()}-${pad(kstDate.getUTCMonth() + 1)}-${pad(kstDate.getUTCDate())}` +
    `T${pad(kstDate.getUTCHours())}:${pad(kstDate.getUTCMinutes())}:00+09:00`
  );
}

async function main() {
  const args = process.argv.slice(2);

  // --from N : N번째 인덱스(0-based)부터 시작
  const fromIdx = (() => {
    const i = args.indexOf('--from');
    return i >= 0 ? Math.max(0, Number(args[i + 1]) - 1) : 0;
  })();

  // --only a,b,c : 특정 섹션 ID만 실행
  const onlyIds = (() => {
    const i = args.indexOf('--only');
    return i >= 0 ? args[i + 1].split(',').map((s) => s.trim()) : null;
  })();

  const targetSections = onlyIds
    ? onlyIds.map((id) => getSectionById(id)).filter(Boolean)
    : SECTIONS.slice(fromIdx);

  log('🚀', `daily_runner 시작 — ${targetSections.length}개 섹션 처리`);
  log('⏱️', `섹션 간 대기: 5분`);
  console.log('');

  const healthSubtopic = getHealthSubtopic();
  let successCount = 0;
  let failCount    = 0;

  for (let i = 0; i < targetSections.length; i++) {
    const section    = targetSections[i];
    const globalIdx  = SECTIONS.findIndex((s) => s.id === section.id);
    const dateStr    = getPublishDate(globalIdx);
    const subtopic   = section.id === 'health' ? healthSubtopic : null;

    log('📰', `[${i + 1}/${targetSections.length}] ${section.name}${subtopic ? ` (${subtopic})` : ''}`);
    log('📅', `발행 시각: ${dateStr}`);

    try {
      await runForSection(section, {
        subtopic,
        dateOverride: dateStr,
        skipSns: false,
      });
      successCount++;
    } catch (err) {
      failCount++;
      log('❌', `${section.name} 실패: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }

    // 마지막 섹션이 아니면 5분 대기
    if (i < targetSections.length - 1) {
      log('⏳', `다음 섹션까지 5분 대기... (${new Date().toLocaleTimeString('ko-KR')})`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n' + '='.repeat(60));
  log('🎉', `daily_runner 완료 — 성공 ${successCount}개 / 실패 ${failCount}개`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('❌ daily_runner 치명적 오류:', err.message);
  process.exit(1);
});
