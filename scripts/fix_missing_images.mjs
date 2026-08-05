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
      const tagsMatch = content.match(/^tags:\s*\[([^\]]+)\]/m);
      const tags = tagsMatch ? tagsMatch[1].replace(/"/g, '').split(',').map(t => t.trim()) : [];
      const descMatch = content.match(/^description:\s*"?([^"\n]+)"?/m);
      const slug = postDir;
      const relDir = `content/posts/${sectionDir}/${postDir}`;

      // slug에서 영어 키워드 추출 (한국어 제목 대신)
      const slugKeywords = slug.replace(/-\d{4,}$/g, '').replace(/-/g, ' ').trim();

      // 이미지별 다른 씬 접근 (같은 오브젝트 반복 방지)
      const scenes = [
        // 01: 사물/제품 중심 — 글의 핵심 주제 오브젝트
        `${slugKeywords} key object closeup on clean surface, ${imgStyle}, sharp focus, product-style, landscape 16:9`,
        // 02: 환경/상황 중심 — 글의 두 번째 주제를 인물 없이 환경으로
        `environment and setting related to ${slugKeywords}, interior or outdoor scene, ${imgStyle}, wide angle, landscape 16:9`,
        // thumb: 아이콘/상징 중심 — 전체 주제 상징 오브젝트, bold 구도
        `bold iconic ${slugKeywords} themed object on contrasting background, ${imgStyle}, strong graphic composition, landscape 16:9`,
      ];

      const checks = [
        { file: `${slug}-01.webp`, prompt: scenes[0] },
        { file: `${slug}-02.webp`, prompt: scenes[1] },
        { file: `${slug}-thumb.webp`, prompt: scenes[2] },
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

// ── Pollinations.ai 이미지 다운로드 (리다이렉트 + 브라우저 헤더 지원) ────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Referer': 'https://pollinations.ai/',
      },
    };
    const req = https.get(url, options, res => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode === 429) {
        reject(new Error('RATE_LIMIT'));
        return;
      }
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

  const positivePrompt = `${img.prompt}, no text, no watermark, no logo, no people, landscape 16:9`;
  const encodedPrompt  = encodeURIComponent(positivePrompt);
  const seed = Math.floor(Math.random() * 9999) + 1;
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&model=flux&nologo=true&enhance=false&seed=${seed}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  🖼️  ${img.file} 생성 중... (시도 ${attempt}/3)`);
      const buf = await downloadImage(url);
      fs.mkdirSync(path.join(ROOT, img.dir), { recursive: true });
      await sharp(buf)
        .resize(1280, 720, { fit: 'cover', position: 'centre' })
        .webp({ quality: 92, effort: 6 })
        .toFile(dest);

      const size = fs.statSync(dest).size;
      if (size < MIN_SIZE) throw new Error(`파일 크기 너무 작음 (${size}B)`);
      console.log(`  ✅ ${img.file} (${Math.round(size / 1024)}KB)`);
      return true;
    } catch (err) {
      const isRateLimit = err.message === 'RATE_LIMIT';
      console.log(`  ❌ ${img.file} 시도 ${attempt} 실패: ${isRateLimit ? '429 Rate Limit' : err.message}`);
      if (attempt < 3) {
        const delay = isRateLimit ? 120000 : 45000;
        console.log(`  ⏳ ${delay / 1000}초 대기...`);
        await sleep(delay);
      }
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

// Pollinations 생성 비활성화 — Gemini Pro 전담 원칙 준수
// 누락 감지만 하고 텔레그램 알림 + 목록 출력 후 종료
console.log(`\n⚠️  누락 이미지 ${flatImages.length}장 감지 — Gemini Pro 세션으로 수동 복구 필요\n`);
flatImages.forEach(img => console.log(`  · ${img.dir}/${img.file}`));
console.log('');
console.log('💡 복구 방법: node scripts/fix_bad_thumbs.mjs (TARGETS 목록 수정 후 실행)\n');

// 텔레그램 알림
try {
  const { sendTelegram } = await import('./telegram.js');
  const lines = flatImages.slice(0, 10).map(img => `  · ${img.file}`).join('\n');
  const extra = flatImages.length > 10 ? `\n  ... 외 ${flatImages.length - 10}개` : '';
  await sendTelegram(`⚠️ 이미지 누락 감지 ${flatImages.length}건\n${lines}${extra}\n→ fix_bad_thumbs.mjs 실행 필요`);
} catch {}

process.exit(0);
