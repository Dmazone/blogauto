#!/usr/bin/env node
/**
 * fix_bad_thumbs.mjs — 문제 썸네일을 Gemini Pro로 재생성
 *
 * Usage: node scripts/fix_bad_thumbs.mjs
 *
 * 처리 대상: 얼굴 클로즈업, 주제 불일치 등 문제 있는 썸네일
 * Gemini Pro 브라우저 세션 사용 (Pollinations 절대 금지)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const GEM_URL = process.env.GEMINI_GEM_URL ?? 'https://gemini.google.com/u/2/gem/cca9fca55f60';

// ── 수정 대상 목록 ────────────────────────────────────────────────────────────
const TARGETS = [
  {
    slug: 'wireless-calf-massager-top3-2026',
    section: 'trending-picks',
    title: '무선 종아리 마사지기 TOP3 가성비 비교',
    imageStyle: 'product photography, clean white background, e-commerce style',
    prompts: {
      img01: '무선 종아리 마사지기 제품 클로즈업, 에어 압축 마사지 장치, 현대적 디자인, 흰색 배경, 제품 사진',
      img02: '종아리 마사지기 착용 장면 (발목 아래만, 얼굴·사람 없음), 소파 위에 놓인 마사지기, 따뜻한 조명',
      thumb: '무선 종아리 마사지기 3종 비교 제품 사진, 깔끔한 배경, 브랜드 로고 없음, 가로 16:9',
    },
  },
  {
    slug: 'seventeen-dino-pi-cheol-in-solo-album-2026',
    section: 'entertainment',
    title: '세븐틴 디노 피철인 앨범 핵심 정리',
    imageStyle: 'K-pop album art concept, vibrant colors, artistic',
    prompts: {
      img01: 'K-pop 앨범 아트 컨셉, 밤하늘과 별빛, 미니멀한 무대 조명, 사람 얼굴 없음, 가로 16:9',
      img02: 'K-pop 뮤직비디오 세트, 세련된 스튜디오 배경, 화려한 조명, 마이크·스탠드, 사람 없음, 가로 16:9',
      thumb: '피철인 앨범 컨셉 아트, 밤하늘·별·음악 요소, bold 색감, 텍스트 없음, 사람 얼굴 없음, 가로 16:9',
    },
  },
  {
    slug: 'korea-national-ai-computing-center-breakthrough-2026',
    section: 'latest-tech',
    title: '국가 AI 컴퓨팅센터 착공, 스타트업 GPU 가뭄 해소될까?',
    imageStyle: 'tech infrastructure, data center, futuristic',
    prompts: {
      img01: '대규모 AI 데이터센터 내부, 서버 랙, 파란 LED 조명, 첨단 기술, 사람 없음, 가로 16:9',
      img02: '전남 해남 서버팜 조감도, 친환경 건물, 태양광 패널, 스타트업 GPU 인프라, 사람 없음, 가로 16:9',
      thumb: 'AI 슈퍼컴퓨터 데이터센터, 서버 클러스터, GPU 칩 클로즈업, bold 색감, 텍스트 없음, 가로 16:9',
    },
  },
  {
    slug: 'open-ear-earbuds-top3-20260803',
    section: 'trending-picks',
    title: '오픈형 무선 이어폰 TOP3 3만원대 가성비 비교',
    imageStyle: 'product photography, audio tech, clean background',
    prompts: {
      img01: '오픈형 무선 이어폰 제품 클로즈업, 골전도 헤드폰, 흰색 배경, 제품 사진, 사람 없음, 가로 16:9',
      img02: '이어폰 충전 케이스와 이어버드 세트, 미니멀 배경, 음악 장비, 사람 없음, 가로 16:9',
      thumb: '오픈형 이어폰 3종 비교 제품 사진, 나란히 배치, 깔끔한 배경, 텍스트 없음, 가로 16:9',
    },
  },
];

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const { GeminiSession } = await import('./gemini_browser.js');
  const sharp = (await import('sharp')).default;

  console.log('🎨 Gemini Pro 썸네일 재생성 시작...');
  const session = new GeminiSession({ headless: false, gemUrl: GEM_URL });
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

    try {
      // 썸네일 우선, 내부 이미지 포함 3장 요청
      await session.useImageMaker(
        `블로그 포스팅: "${target.title}"\n\n` +
        `이 주제에 딱 맞는 이미지 3장을 만들어줘.\n` +
        `공통 규칙: 사람 얼굴 클로즈업 절대 금지, 텍스트·로고 없음, 가로 16:9\n\n` +
        `[이미지 1] ${target.prompts.img01}\n\n` +
        `[이미지 2] ${target.prompts.img02}\n\n` +
        `[이미지 3 — 썸네일] ${target.prompts.thumb}\n\n` +
        `분위기: ${target.imageStyle}`
      );

      const buffers = await session.extractImagesFromLastResponse(1, 90000);

      if (buffers.length === 0) {
        console.warn(`  ⚠️  Gemini 이미지 0장 반환 — 건너뜀`);
        failed++;
        continue;
      }

      console.log(`  ✅ Gemini 이미지 ${buffers.length}장 수신`);

      // 저장 순서: thumb 최우선
      const saveTargets = [
        { buf: buffers[0], filename: `${target.slug}-thumb.webp` },
        { buf: buffers[1], filename: `${target.slug}-01.webp` },
        { buf: buffers[2] ?? buffers[1], filename: `${target.slug}-02.webp` },
      ];

      for (const { buf, filename } of saveTargets) {
        if (!buf) continue;
        const destPath = path.join(bundleDir, filename);
        await sharp(buf)
          .resize(1280, 720, { fit: 'cover', position: 'centre' })
          .webp({ quality: 90, effort: 6 })
          .toFile(destPath);
        const stat = fs.statSync(destPath);
        console.log(`  💾 저장: ${filename} (${Math.round(stat.size / 1024)}KB)`);
      }

      fixed++;
    } catch (err) {
      console.error(`  ❌ 오류: ${err.message}`);
      failed++;
    }

    // 연속 요청 간 쿨다운
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
      execSync(`git commit -m "fix: 문제 썸네일 Gemini Pro 재생성 (${fixed}건)"`, { cwd: ROOT, stdio: 'inherit' });
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
