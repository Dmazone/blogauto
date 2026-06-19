/**
 * fix_missing_images.mjs — 누락 이미지 자동 감지 & 복구
 *
 * content/posts 전체를 스캔하여 index.md는 있으나 이미지가 누락/손상된
 * 포스팅을 자동 감지 후 Stable Horde로 재생성.
 *
 * Stable Horde 익명 키 제한: 640px 이하, 초당 2개 rate limit
 * 순차 제출(600ms 간격) + 병렬 폴링
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

// ── Stable Horde API 호출 ─────────────────────────────────────────────────
function apiCall(method, p, body) {
  return new Promise((res, rej) => {
    const pl = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'stablehorde.net', path: p, method,
      headers: {
        'Content-Type': 'application/json', apikey: '0000000000',
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {})
      },
      timeout: 30000,
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res({ s: r.statusCode, b: JSON.parse(d) }); }
        catch { res({ s: r.statusCode, b: d }); }
      });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
    if (pl) req.write(pl);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const NEG_PROMPT = 'text, watermark, logo, blurry, low quality, distorted, deformed, ugly, worst quality, jpeg artifacts, noise, grainy, oversaturated, duplicate';

// ── 단일 이미지 제출 ───────────────────────────────────────────────────────
async function submitOne(img) {
  const dest = path.join(ROOT, img.dir, img.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
    return { img, jobId: null, skip: true };
  }

  const qualityPrompt = `best quality, masterpiece, highly detailed, sharp focus, ${img.prompt}`;

  let retries = 3;
  while (retries-- > 0) {
    const sub = await apiCall('POST', '/api/v2/generate/async', {
      prompt: qualityPrompt,
      params: {
        width: 640,
        height: 384,
        steps: 30,
        n: 1,
        sampler_name: 'k_dpmpp_2m',
        cfg_scale: 7,
        karras: true,
        negative_prompt: NEG_PROMPT,
      },
      models: ['Deliberate', 'DreamShaper', 'stable_diffusion'],
      r2: false,
      shared: true,
    });

    if (sub.s === 202) {
      console.log(`  📤 ${img.file} (job ${String(sub.b.id).slice(0, 8)}...)`);
      return { img, jobId: sub.b.id, skip: false };
    }
    if (sub.s === 429) { await sleep(1000); continue; }
    console.log(`  ❌ ${img.file} 제출 실패 ${sub.s}`);
    return { img, jobId: null, skip: false };
  }
  return { img, jobId: null, skip: false };
}

// ── 폴링 + 저장 ────────────────────────────────────────────────────────────
async function pollAndSave({ img, jobId, skip }) {
  if (skip) { console.log(`  ⏭️  ${img.file} 존재 (스킵)`); return true; }
  if (!jobId) return false;

  const dest = path.join(ROOT, img.dir, img.file);
  const deadline = Date.now() + 1_800_000; // 30분

  while (Date.now() < deadline) {
    await sleep(15000);
    const c = await apiCall('GET', `/api/v2/generate/check/${jobId}`);
    if (c.b?.faulted) { console.log(`  ❌ ${img.file} faulted`); return false; }
    if (c.b?.done) break;
  }

  const result = await apiCall('GET', `/api/v2/generate/status/${jobId}`);
  const b64 = result.b?.generations?.[0]?.img;
  if (!b64) { console.log(`  ❌ ${img.file} no data`); return false; }

  fs.mkdirSync(path.join(ROOT, img.dir), { recursive: true });
  await sharp(Buffer.from(b64, 'base64'))
    .resize(1280, 720, { fit: 'cover', kernel: 'lanczos3' })
    .webp({ quality: 90, effort: 5 })
    .toFile(dest);

  console.log(`  ✅ ${img.file} (${Math.round(fs.statSync(dest).size / 1024)}KB)`);
  return true;
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const flatImages = scanMissingImages();

if (flatImages.length === 0) {
  console.log('\n✅ 누락 이미지 없음 — 모든 포스팅 이미지 정상\n');
  process.exit(0);
}

console.log(`\n🚀 누락 이미지 ${flatImages.length}장 감지 → 복구 시작\n`);
flatImages.forEach(img => console.log(`  · ${img.dir}/${img.file}`));
console.log('');

console.log('STEP 1: 순차 제출 중 (600ms 간격)...');
const jobs = [];
for (const img of flatImages) {
  jobs.push(await submitOne(img));
  await sleep(600);
}

const pending = jobs.filter(j => j.jobId);
console.log(`\nSTEP 2: ${pending.length}개 작업 병렬 폴링...\n`);
const results = await Promise.all(jobs.map(pollAndSave));

let done = 0, failed = 0;
results.forEach(ok => ok ? done++ : failed++);
console.log(`\n✅ 전체 완료 — 성공 ${done}개 / 실패 ${failed}개`);
