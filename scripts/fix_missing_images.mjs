/**
 * fix_missing_images.mjs — 누락 이미지 자동 감지 & 복구
 *
 * content/posts 전체를 스캔하여 index.md는 있으나 이미지가 누락/손상된
 * 포스팅을 자동 감지 후 Pollinations.ai로 재생성.
 * (무료, API 키 불필요, 1280×720 직접 생성)
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { SECTIONS } from './sections.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const MIN_SIZE = 15000;

// 섹션 dir → section 매핑
const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.dir, s]));

// ── 누락 이미지 동적 스캔 ──────────────────────────────────────────────────
function scanMissingImages() {
  const missing = [];

  for (const sectionDir of fs.readdirSync(POSTS_DIR)) {
    const sectionPath = path.join(POSTS_DIR, sectionDir);
    if (!fs.statSync(sectionPath).isDirectory()) continue;

    const section = SECTION_MAP[sectionDir];
    const imgStyle = section?.imageStyle ?? 'professional blog editorial illustration, landscape 16:9';

    for (const postDir of fs.readdirSync(sectionPath)) {
      const postPath = path.join(sectionPath, postDir);
      if (!fs.statSync(postPath).isDirectory()) continue;

      const indexMd = path.join(postPath, 'index.md');
      if (!fs.existsSync(indexMd)) continue;

      const content = fs.readFileSync(indexMd, 'utf-8');
      const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?/m);
      const title = (titleMatch?.[1] ?? postDir).replace(/\\"/g, '"').trim();
      const slug = postDir;
      const relDir = `content/posts/${sectionDir}/${postDir}`;

      const checks = [
        {
          file: `${slug}-01.webp`,
          prompt: `${title}, introductory concept scene, ${imgStyle}, no text overlay`,
        },
        {
          file: `${slug}-02.webp`,
          prompt: `${title}, comparison analysis data visualization, ${imgStyle}, no text overlay`,
        },
        {
          file: `${slug}-thumb.webp`,
          prompt: `${title} editorial magazine cover, bold colors, ${imgStyle}, no text overlay`,
        },
      ];

      for (const check of checks) {
        const fullPath = path.join(postPath, check.file);
        const exists = fs.existsSync(fullPath);
        const size = exists ? fs.statSync(fullPath).size : 0;
        if (!exists || size < MIN_SIZE) {
          missing.push({ dir: relDir, file: check.file, prompt: check.prompt });
        }
      }
    }
  }

  return missing;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Pollinations.ai 이미지 다운로드 ───────────────────────────────────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 120000 }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── 단일 이미지 생성 + 저장 ────────────────────────────────────────────────
async function generateOne(img) {
  const dest = path.join(ROOT, img.dir, img.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
    console.log(`  ⏭️  ${img.file} 존재 (스킵)`);
    return true;
  }

  const qualityPrompt = `best quality, highly detailed, sharp focus, ${img.prompt}, photorealistic, 16:9 landscape`;
  const encodedPrompt = encodeURIComponent(qualityPrompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&model=flux&nologo=true&enhance=true&seed=${Date.now()}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`  🖼️  ${img.file} 생성 중... (시도 ${attempt}/2)`);
      const buf = await downloadImage(url);
      fs.mkdirSync(path.join(ROOT, img.dir), { recursive: true });
      await sharp(buf)
        .resize(1280, 720, { fit: 'cover', position: 'centre' })
        .webp({ quality: 90, effort: 5 })
        .toFile(dest);

      const size = fs.statSync(dest).size;
      if (size < MIN_SIZE) throw new Error(`파일 크기 너무 작음 (${size}B)`);
      console.log(`  ✅ ${img.file} (${Math.round(size / 1024)}KB)`);
      return true;
    } catch (err) {
      console.log(`  ❌ ${img.file} 시도 ${attempt} 실패: ${err.message}`);
      if (attempt < 2) await sleep(3000);
    }
  }
  return false;
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const flatImages = scanMissingImages();

if (flatImages.length === 0) {
  console.log('\n✅ 누락 이미지 없음 — 모든 포스팅 이미지 정상\n');
  process.exit(0);
}

console.log(`\n🚀 누락 이미지 ${flatImages.length}장 감지 → Pollinations.ai로 복구 시작\n`);
flatImages.forEach(img => console.log(`  · ${img.dir}/${img.file}`));
console.log('');

// 순차 처리 (rate limit 대응 — 요청 간 1초 간격)
let done = 0, failed = 0;
for (const img of flatImages) {
  const ok = await generateOne(img);
  ok ? done++ : failed++;
  await sleep(1000);
}

console.log(`\n✅ 전체 완료 — 성공 ${done}개 / 실패 ${failed}개`);
