/**
 * capture_apple_pages.mjs — Apple 공식 페이지 스크린샷 → 블로그 이미지 변환
 * Apple 공식 마케팅 이미지를 편집 목적으로 캡처 (제품 리뷰/비교 콘텐츠용)
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const FFMPEG = 'C:\\Users\\Paydma\\.vscode\\extensions\\kilocode.kilo-code-7.6.2-win32-x64\\bin\\ffmpeg.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));

function captureToWebp(src, dest) {
  execSync(`"${FFMPEG}" -y -i "${src}" -vf "scale=1280:720" -quality 88 "${dest}"`, { stdio: 'pipe' });
  const size = fs.statSync(dest).size;
  console.log(`  ✅ ${path.basename(dest)} (${Math.round(size/1024)}KB)`);
  return size;
}

async function captureApplePage(page, url, prefix) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);

  const sections = [
    { name: 'thumb', scrollY: 0 },
    { name: '01', scrollY: 800 },
    { name: '02', scrollY: 1600 },
  ];

  const results = {};
  for (const { name, scrollY } of sections) {
    if (scrollY > 0) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await wait(1500);
    }
    const tmpPng = `data/3_screenshots/${prefix}_${name}.png`;
    const outWebp = `data/3_screenshots/${prefix}_${name}.webp`;
    await page.screenshot({ path: tmpPng, clip: { x: 0, y: 60, width: 1440, height: 720 } });
    try {
      results[name] = captureToWebp(tmpPng, outWebp);
    } catch (e) {
      console.log(`  ⚠️  ${name} 변환 실패: ${e.message}`);
    }
  }
  return results;
}

async function main() {
  const ctx = await chromium.launch({ headless: true });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

  const pages = [
    { url: 'https://www.apple.com/kr/iphone-duo/', prefix: 'apple_duo' },
    { url: 'https://www.apple.com/kr/iphone-18-pro/', prefix: 'apple_18pro' },
    { url: 'https://www.apple.com/kr/iphone/', prefix: 'apple_iphone' },
    { url: 'https://www.apple.com/kr/airpods-pro/', prefix: 'apple_airpods' },
  ];

  for (const { url, prefix } of pages) {
    console.log(`\n🍎 ${prefix}: ${url}`);
    try {
      await captureApplePage(page, url, prefix);
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }

  await ctx.close();
  console.log('\n✅ 모든 Apple 이미지 캡처 완료');
  console.log('위치: data/3_screenshots/apple_*.webp');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
