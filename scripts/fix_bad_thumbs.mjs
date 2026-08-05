#!/usr/bin/env node
/**
 * fix_bad_thumbs.mjs — 썸네일 누락·불량 포스팅을 Gemini Pro로 재생성
 *
 * Usage: node scripts/fix_bad_thumbs.mjs
 *
 * Gemini Pro 브라우저 세션 사용 (Pollinations 절대 금지)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

// ── 수정 대상 목록 ────────────────────────────────────────────────────────────
const TARGETS = [
  {
    slug: '2026-japan-small-city-travel-trends',
    section: 'world-travel',
    title: '2026 일본 소도시 여행 추천 3곳 진짜 공개',
    prompts: {
      img01: '일본 시코쿠 마쓰야마 도고온천 전통 목조건물, 저녁 조명, 관광객 없이 깔끔한 거리, 따뜻한 노을 톤, 가로 16:9',
      img02: '미야코지마 에메랄드 해변 전경, 맑은 하늘과 산호초, 일본 남국 리조트 분위기, 광각 풍경, 가로 16:9',
      thumb: '일본 소도시 여행 컨셉, 빨간 도리이 게이트와 작은 마을 골목길, 벚꽃 나뭇가지, 따뜻한 색감, 가로 16:9',
    },
  },
];

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;

  console.log('🎨 Gemini Pro 썸네일 생성 시작...');
  const session = new GeminiSession({ headless: false });
  await session.init();

  let fixed = 0;
  let failed = 0;

  for (const target of TARGETS) {
    console.log(`\n📁 [${target.slug}] 처리 중...`);
    const bundleDir = path.join(ROOT, 'content', 'posts', target.section, target.slug);

    if (!fs.existsSync(bundleDir)) {
      console.warn(`  ⚠️  디렉토리 없음 — 건너뜀: ${bundleDir}`);
      failed++;
      continue;
    }

    // 이미 모든 이미지 존재하면 스킵
    const thumbPath = path.join(bundleDir, `${target.slug}-thumb.webp`);
    const img01Path = path.join(bundleDir, `${target.slug}-01.webp`);
    const img02Path = path.join(bundleDir, `${target.slug}-02.webp`);
    const allExist = fs.existsSync(thumbPath) && fs.existsSync(img01Path) && fs.existsSync(img02Path);
    if (allExist) {
      const thumbSize = fs.statSync(thumbPath).size;
      const img01Size = fs.statSync(img01Path).size;
      // thumb와 img01 모두 100KB 이상이어야 정상 이미지로 간주
      if (thumbSize >= 100000 && img01Size >= 100000) {
        console.log(`  ✅ 이미지 이미 존재 (thumb:${Math.round(thumbSize/1024)}KB, img01:${Math.round(img01Size/1024)}KB) — 스킵`);
        continue;
      }
      console.log(`  ⚠️  이미지 크기 미달 (thumb:${Math.round(thumbSize/1024)}KB, img01:${Math.round(img01Size/1024)}KB) → 재생성`);
    }

    try {
      await session.newConversation();

      // 워밍업 텍스트 전송: 페이지 캐시 이미지를 여기서 소진 (이미지 인터셉터 시작 전)
      // → 이후 useImageMaker에서는 Gemini 생성 이미지만 캡처
      await session.send(`"${target.title}" 주제의 이미지를 만들 예정입니다.`).catch(() => {});
      // 워밍업 응답 대기
      await new Promise(r => setTimeout(r, 5000));

      // useImageMaker()가 내부적으로 인터셉터 설정+해제 처리
      await session.useImageMaker(
        `블로그 포스팅: "${target.title}"\n\n` +
        `이 주제에 딱 맞는 이미지 3장을 만들어줘.\n` +
        `공통 규칙: 사람 얼굴 클로즈업 절대 금지, 텍스트·로고 없음, 가로 16:9\n\n` +
        `[이미지 1 — 도입부용] ${target.prompts.img01}\n\n` +
        `[이미지 2 — 본문용] ${target.prompts.img02}\n\n` +
        `[이미지 3 — 썸네일] ${target.prompts.thumb}`
      );

      // session._interceptedImages에 캡처된 이미지 반환
      const buffers = await session.extractImagesFromLastResponse(1, 5000);

      // 50KB 미만은 UI 로딩 아이콘 등 → 진짜 Gemini 생성 이미지만 남김
      const realImages = buffers.filter((b) => b.length >= 50000);

      if (realImages.length === 0) {
        console.warn(`  ⚠️  실제 Gemini 이미지 없음 (캡처 ${buffers.length}장, 50KB 이상 0장) — 건너뜀`);
        failed++;
        continue;
      }

      console.log(`  ✅ Gemini 이미지 ${realImages.length}장 수신 (전체 ${buffers.length}장 중 50KB 이상)`);

      // 순서대로 img01 → img02 → thumb (가장 큰 것 우선)
      const sorted = [...realImages].sort((a, b) => b.length - a.length);
      const b0 = sorted[0];
      const b1 = sorted[1] ?? b0;
      const b2 = sorted[2] ?? b1;
      const saveTargets = [
        { buf: b0, dest: img01Path },
        { buf: b1, dest: img02Path },
        { buf: b2, dest: thumbPath },
      ];

      let savedCount = 0;
      for (const { buf, dest } of saveTargets) {
        if (!buf) continue;
        const filename = path.basename(dest);
        try {
          await sharp(buf)
            .resize(1280, 720, { fit: 'cover', position: 'centre' })
            .webp({ quality: 90, effort: 6 })
            .toFile(dest);
          const stat = fs.statSync(dest);
          console.log(`  💾 저장: ${filename} (${Math.round(stat.size / 1024)}KB)`);
          savedCount++;
        } catch (err) {
          console.warn(`  ⚠️  ${filename} 저장 실패: ${err.message}`);
        }
      }

      if (savedCount > 0) {
        fixed++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ 오류: ${err.message}`);
      failed++;
    }

    if (TARGETS.indexOf(target) < TARGETS.length - 1) {
      console.log('  ⏳ 10초 대기...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  await session.close?.();

  console.log(`\n✅ 완료: ${fixed}개 성공 / ${failed}개 실패`);

  if (fixed > 0) {
    console.log('\n📤 Git push 중...');
    const { execSync } = await import('child_process');
    try {
      execSync('git add content/', { cwd: ROOT, stdio: 'inherit' });
      execSync(`git commit -m "fix: 누락 썸네일 Gemini Pro 생성 (${fixed}건)"`, { cwd: ROOT, stdio: 'inherit' });
      execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
      console.log('✅ Git push 완료');
    } catch (err) {
      console.error('❌ Git push 실패:', err.message);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
