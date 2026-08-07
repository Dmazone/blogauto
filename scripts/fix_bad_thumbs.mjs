#!/usr/bin/env node
/**
 * fix_bad_thumbs.mjs — 잘못 저장된 Gemini UI 캐시 이미지 전체 재생성
 *
 * 원인: "이미지 만들기" 버튼 클릭 시 Gemini UI 캐시 이미지(고딕 서재 남자 등)가
 *       인터셉터에 먼저 잡혀 크기 정렬 후 최상위로 선택됨.
 * 수정: gemini_browser.js에서 preSendCount 방식으로 버튼 클릭 캐시 제거 완료.
 *       이 스크립트는 항상 재생성 (스킵 없음).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

// 8/7 포스팅 — 이미지 미생성 (runner에서 Gemini 이미지 생성 안 됨)
const TARGETS = [
  // health
  {
    slug: 'nogak-detox-diet-heatwave-bloating-2026',
    section: 'health',
    title: '노각 해독 식단, 폭염 속 부기 싹 빼는 진짜 비밀',
    p1: 'Fresh large Korean old cucumber (norak) sliced open on wooden board, summer vegetables with water droplets, bright natural light, no text, 16:9',
    p2: 'Refreshing green detox salad bowl with sliced old cucumber and fresh mint herbs, overhead view, bright kitchen background, no text, 16:9',
    p3: 'Summer heat relief food spread, cucumbers and green vegetables on ice, cool wellness diet concept, no text, 16:9',
  },
  // it-devices
  {
    slug: 'legion-go-bios-update-brick-issue-2026',
    section: 'it-devices',
    title: '리전고 BIOS 먹통 긴급 복구 3가지 진짜 방법',
    p1: 'Lenovo Legion Go handheld gaming PC with dark error screen on desk, USB recovery cable connected, technical repair concept, no text, 16:9',
    p2: 'Gaming handheld device recovery setup with USB hub and laptop, blue tech LED ambient lighting, no text, 16:9',
    p3: 'Computer screen showing BIOS recovery interface, circuit board detail in background, dark blue tech aesthetic, no text, 16:9',
  },
  // kr-realestate
  {
    slug: 'seoul-apartment-price-surge-august-2026',
    section: 'kr-realestate',
    title: '서울 아파트값 또 급등! 상승 폭 키운 핵심 지역 3곳',
    p1: 'Seoul skyline with dense modern apartment towers reflected in Han River at golden hour, no text, 16:9',
    p2: 'Aerial panoramic view of Seoul apartment complex district packed with high-rise buildings, summer haze, no text, 16:9',
    p3: 'Korean real estate market concept with upward rising arrow over city skyline at night, no text, 16:9',
  },
  // sports
  {
    slug: 'kbo-heatwave-cancellation-2026-schedule-change',
    section: 'sports',
    title: '프로야구 폭염 취소 사태! KBO 주말 경기 취소 3가지 파장',
    p1: 'Korean baseball stadium under intense blazing summer sun, scorching heat haze shimmering above the infield, dramatic sky, no people, no text, 16:9',
    p2: 'Empty professional baseball field under extreme summer heat, heat waves visible over home plate, no text, 16:9',
    p3: 'Baseball diamond under harsh sunlight with abandoned equipment, game cancelled atmosphere, no text, 16:9',
  },
  // trending-picks
  {
    slug: 'magsafe-powerbank-top3-20260807',
    section: 'trending-picks',
    title: '2026 맥세이프 보조배터리 TOP3 비교 추천',
    p1: 'MagSafe wireless power bank magnetically snapped onto iPhone back, clean minimal white background, product photography, no text, 16:9',
    p2: 'Three different MagSafe Qi2 power banks arranged side by side for comparison, clean studio lighting, no text, 16:9',
    p3: 'Compact MagSafe battery pack in outdoor lifestyle setting, phone being charged wirelessly, no face closeup, no text, 16:9',
  },
  // us-trends
  {
    slug: '2026-anthropic-custom-ai-chips-in-house-silicon',
    section: 'us-trends',
    title: 'Why Anthropic Is Building Custom AI Chips in 2026',
    p1: 'Futuristic custom AI semiconductor chip concept art, silicon wafer with neural network circuit pattern, blue cyan tech glow, no people, 16:9',
    p2: 'High-tech semiconductor chip design laboratory visualization, clean room environment concept, circuit blueprints, 16:9',
    p3: 'Abstract AI computing infrastructure concept, data center server racks with glowing blue circuit patterns, 16:9',
  },
  // world-travel
  {
    slug: '2026-august-fuel-surcharge-flight-price-guide',
    section: 'world-travel',
    title: '8월 항공 유류할증료 25% 인하, 진짜 이득일까?',
    p1: 'Commercial airplane flying over dramatic golden sunset clouds, travel concept, no text, 16:9',
    p2: 'International airport departure hall with traveler silhouettes and flight board, summer travel season, no text, 16:9',
    p3: 'Fuel price reduction concept with airplane wing above blue sky, declining price graph overlay, no text, 16:9',
  },
];

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;

  console.log(`🔄 잘못된 이미지 전체 재생성 — 총 ${TARGETS.length}개 포스팅`);
  const session = new GeminiSession({ headless: false });
  await session.init();

  let fixed = 0;
  let failed = 0;
  const failedList = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    console.log(`\n[${i + 1}/${TARGETS.length}] 📁 ${t.section}/${t.slug}`);
    const bundleDir = path.join(ROOT, 'content', 'posts', t.section, t.slug);

    if (!fs.existsSync(bundleDir)) {
      console.warn(`  ⚠️  디렉토리 없음 — 건너뜀`);
      failed++;
      failedList.push(t.slug);
      continue;
    }

    const img01Path = path.join(bundleDir, `${t.slug}-01.webp`);
    const img02Path = path.join(bundleDir, `${t.slug}-02.webp`);
    const thumbPath = path.join(bundleDir, `${t.slug}-thumb.webp`);

    try {
      await session.newConversation();

      // 중립 워밍업 후 새 대화로 컨텍스트 초기화
      await session.send('이미지를 만들어줘.').catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
      await session.newConversation();
      await new Promise(r => setTimeout(r, 1500));

      await session.useImageMaker(
        `이미지 3장 생성:\n\n[1] ${t.p1}\n\n[2] ${t.p2}\n\n[3] ${t.p3}\n\n규칙: 텍스트·로고 없음, 얼굴 클로즈업 없음, 16:9 가로`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 10000);
      const realImages = buffers.filter(b => b.length >= 30000);

      if (realImages.length === 0) {
        console.warn(`  ⚠️  생성 이미지 없음 (${buffers.length}장 중 30KB 이상 0장)`);
        failed++;
        failedList.push(t.slug);
        continue;
      }

      const sorted = [...realImages].sort((a, b) => b.length - a.length);
      const saves = [
        { buf: sorted[0],        dest: img01Path },
        { buf: sorted[1] ?? sorted[0], dest: img02Path },
        { buf: sorted[2] ?? sorted[0], dest: thumbPath },
      ];

      let savedCount = 0;
      for (const { buf, dest } of saves) {
        try {
          await sharp(buf)
            .resize(1280, 720, { fit: 'cover', position: 'centre' })
            .webp({ quality: 90, effort: 6 })
            .toFile(dest);
          const kb = Math.round(fs.statSync(dest).size / 1024);
          console.log(`  💾 ${path.basename(dest)} (${kb}KB)`);
          savedCount++;
        } catch (err) {
          console.warn(`  ⚠️  저장 실패: ${err.message}`);
        }
      }

      if (savedCount > 0) fixed++;
      else { failed++; failedList.push(t.slug); }

    } catch (err) {
      console.error(`  ❌ 오류: ${err.message}`);
      failed++;
      failedList.push(t.slug);
    }

    if (i < TARGETS.length - 1) {
      console.log('  ⏳ 10초 대기...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  await session.close?.();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 완료: ${fixed}개 성공 / ${failed}개 실패`);
  if (failedList.length > 0) {
    console.log(`❌ 실패:\n${failedList.map(s => `  - ${s}`).join('\n')}`);
  }

  if (fixed > 0) {
    const { execSync } = await import('child_process');
    try {
      execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
      execSync(`git commit -m "fix: 잘못된 캐시 이미지 재생성 (${fixed}건)"`, { cwd: ROOT, stdio: 'inherit' });
      execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
      console.log('✅ Git push 완료');
    } catch (err) {
      console.error('❌ Git push 실패:', err.message);
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
