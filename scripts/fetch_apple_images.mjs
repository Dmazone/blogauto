/**
 * fetch_apple_images.mjs — Apple 공식 홈페이지에서 제품 이미지 다운로드
 * 사용: node scripts/fetch_apple_images.mjs <slug> <apple-page-url>
 * 예시: node scripts/fetch_apple_images.mjs iphone18-lineup-2026 https://www.apple.com/kr/iphone/
 *
 * Apple 공식 마케팅/프레스 이미지를 편집적 리뷰 목적으로 사용.
 * 다운로드한 이미지는 content/posts/{섹션}/{slug}/ 에 저장.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const wait = ms => new Promise(r => setTimeout(r, ms));

const SLUG = process.argv[2];
const APPLE_URL = process.argv[3];
const SECTION = process.argv[4] || 'latest-tech';

if (!SLUG || !APPLE_URL) {
  console.error('사용: node scripts/fetch_apple_images.mjs <slug> <apple-url> [section]');
  process.exit(1);
}

const OUT_DIR = path.join(process.cwd(), 'content', 'posts', SECTION, SLUG);
fs.mkdirSync(OUT_DIR, { recursive: true });

async function downloadAsWebp(page, imgUrl, outPath) {
  // Playwright로 이미지 바이트 다운로드 후 저장
  const buf = await page.evaluate(async (url) => {
    const res = await fetch(url, { mode: 'cors' });
    const ab = await res.arrayBuffer();
    return [...new Uint8Array(ab)];
  }, imgUrl);
  if (!buf || buf.length < 10000) return null;

  // 이미지를 임시 저장 (원본 형식)
  const tmpPath = outPath.replace('.webp', '.tmp');
  fs.writeFileSync(tmpPath, Buffer.from(buf));

  // ffmpeg으로 webp 변환 (1280x720 landscape)
  const { execSync } = await import('child_process');
  const FFMPEG = 'C:\\Users\\Paydma\\.vscode\\extensions\\kilocode.kilo-code-7.6.2-win32-x64\\bin\\ffmpeg.exe';
  try {
    execSync(`"${FFMPEG}" -y -i "${tmpPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:white" -quality 85 "${outPath}" 2>nul`);
    fs.unlinkSync(tmpPath);
    const size = fs.statSync(outPath).size;
    return size;
  } catch (e) {
    // ffmpeg 실패시 원본 그대로 저장
    fs.renameSync(tmpPath, outPath.replace('.webp', path.extname(imgUrl.split('?')[0]) || '.jpg'));
    return null;
  }
}

async function main() {
  const ctx = await chromium.launch({ headless: true });
  const page = await ctx.newPage();

  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });
  await page.goto(APPLE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(2000);

  // 페이지의 고화질 이미지 URL 수집 (Apple의 이미지는 typically srcset에 있음)
  const imgUrls = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img, picture source')];
    const urls = new Set();
    for (const el of imgs) {
      // srcset에서 가장 큰 이미지 추출
      const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset') || '';
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';

      if (srcset) {
        const parts = srcset.split(',').map(s => s.trim().split(' '));
        const sorted = parts.sort((a, b) => {
          const wa = parseInt(a[1]) || 0;
          const wb = parseInt(b[1]) || 0;
          return wb - wa;
        });
        if (sorted[0]?.[0]) urls.add(sorted[0][0].trim());
      } else if (src && !src.startsWith('data:')) {
        urls.add(src);
      }
    }
    return [...urls].filter(u =>
      u.includes('apple.com') || u.startsWith('/') || u.startsWith('http')
    );
  });

  // URL 정규화
  const pageOrigin = new URL(APPLE_URL).origin;
  const normalizedUrls = imgUrls.map(u => u.startsWith('/') ? pageOrigin + u : u)
    .filter(u => {
      const ext = u.split('?')[0].split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext) || u.includes('/image/');
    })
    .filter(u => !u.includes('icon') && !u.includes('logo') && !u.includes('badge') && !u.includes('check'))
    .slice(0, 20);

  console.log(`\n🍎 ${normalizedUrls.length}개 이미지 발견`);
  normalizedUrls.forEach((u, i) => console.log(`  [${i}] ${u.slice(0, 80)}`));

  // 상위 3개 이미지 다운로드 (thumb, 01, 02)
  const targets = [
    { name: `${SLUG}-thumb.webp`, idx: 0 },
    { name: `${SLUG}-01.webp`, idx: 1 },
    { name: `${SLUG}-02.webp`, idx: 2 },
  ];

  let downloaded = 0;
  for (const { name, idx } of targets) {
    const url = normalizedUrls[idx];
    if (!url) { console.log(`  ⚠️  [${idx}] URL 없음`); continue; }

    const outPath = path.join(OUT_DIR, name);
    console.log(`\n📥 ${name}: ${url.slice(0, 70)}...`);

    try {
      const size = await downloadAsWebp(page, url, outPath);
      if (size) {
        console.log(`  ✅ ${(size/1024).toFixed(0)}KB`);
        downloaded++;
      } else {
        console.log(`  ⚠️  변환 실패 또는 작은 파일`);
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }

  await ctx.close();
  console.log(`\n✅ 완료: ${downloaded}/3 이미지 → ${OUT_DIR}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
