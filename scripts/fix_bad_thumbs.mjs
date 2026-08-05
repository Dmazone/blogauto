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
    slug: 'hand-foot-mouth-disease-isolation-guidelines-2026',
    section: 'health',
    title: '2026 수족구병 초기증상과 완치 후 등원 기준 핵심 정리',
    prompts: {
      img01: '영유아 손발 발진 클로즈업 없이, 아동 병원 진료실 풍경, 의료진과 아이 실루엣, 밝고 깨끗한 분위기, 가로 16:9',
      img02: '손 씻기 올바른 방법 안내 포스터 스타일 장면, 비누 거품, 깨끗한 흰색 배경, 건강 정보 일러스트 스타일, 가로 16:9',
      thumb: '수족구병 관련 의료 테마, 청진기와 의약품 알약, 파란 배경, 전문적인 헬스케어 제품 사진 스타일, 가로 16:9',
    },
  },
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
  {
    slug: 'kt-wiz-kbo-rank-1st-go-young-pyo-2026',
    section: 'sports',
    title: 'KT위즈 1위 탈환! 고영표 20이닝 무실점 대기록',
    prompts: {
      img01: 'KBO 야구 경기장 파노라마, 야간 조명, 관중석 가득한 응원 분위기, 초록 잔디 마운드, 가로 16:9',
      img02: '야구 투수 투구 동작 클로즈업 (얼굴 없음), 야구공과 글러브, 극적인 스포츠 조명, 가로 16:9',
      thumb: '야구 트로피와 우승 리본, KBO 리그 선두 컨셉, 어두운 배경에 골드 빛, 스포츠 매거진 커버 스타일, 가로 16:9',
    },
  },
  {
    slug: '2026-spacex-rocket-moon-impact-astronomy-guide',
    section: 'us-trends',
    title: 'Why SpaceX Moon Impact 2026 Matters: Essential Guide',
    prompts: {
      img01: 'SpaceX Falcon 9 rocket stage in deep space, moon surface approaching, debris field, dark space, cinematic sci-fi photography, 16:9',
      img02: 'Close-up of lunar crater impact zone with scattered debris, moon surface texture, dramatic side lighting from sun, 16:9 landscape',
      thumb: 'Moon surface with rocket impact crater, Earth in background, space debris orbit, bold dark blue and silver tones, epic editorial, 16:9',
    },
  },
  {
    slug: 'smart-ring-health-tracker-top3-2026',
    section: 'trending-picks',
    title: '2026 스마트링 추천 TOP3 성능 비교',
    prompts: {
      img01: '스마트링 3종 나란히 배치, 흰 배경 제품 사진, 삼성 갤럭시 링 스타일, 정밀한 제품 사진, 가로 16:9',
      img02: '손가락에 스마트링 착용 장면 (손만, 얼굴 없음), 스마트폰 건강 데이터 화면 함께, 미니멀 라이프스타일, 가로 16:9',
      thumb: '스마트링 하나 클로즈업, 메탈릭 고급 소재, 어두운 배경, 웨어러블 테크 매거진 커버 스타일, 가로 16:9',
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
      if (thumbSize >= 15000) {
        console.log(`  ✅ 이미지 이미 존재 (${Math.round(thumbSize/1024)}KB) — 스킵`);
        continue;
      }
    }

    try {
      await session.newConversation();

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

      if (buffers.length === 0) {
        console.warn(`  ⚠️  이미지 캡처 실패 — 건너뜀`);
        failed++;
        continue;
      }

      console.log(`  ✅ Gemini 이미지 ${buffers.length}장 수신`);

      // 저장 순서: thumb → 01 → 02
      const saveTargets = [
        { buf: buffers[0], dest: thumbPath },
        { buf: buffers[1] ?? buffers[0], dest: img01Path },
        { buf: buffers[2] ?? buffers[1] ?? buffers[0], dest: img02Path },
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
