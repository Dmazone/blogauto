/**
 * yt_list_videos.mjs — 채널의 모든 영상 목록 + VIDEO_ID 수집
 * 사용: node scripts/yt_list_videos.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'],
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  const CHANNEL_ID = 'UCZA_nUdouXfwAF0vuSG74_w';

  // YouTube Studio Shorts 목록 (날짜 내림차순)
  await page.goto(
    `https://studio.youtube.com/channel/${CHANNEL_ID}/videos/short?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await wait(6000);

  const videos = [];
  let prevCount = 0;
  let stableRounds = 0;

  // 스크롤해서 모든 영상 로드
  for (let attempts = 0; attempts < 50; attempts++) {
    // /video/{id}/edit 링크 추출
    const entries = await page.evaluate(() => {
      const result = [];
      const links = [...document.querySelectorAll('a[href*="/video/"][href*="/edit"]')];
      for (const a of links) {
        const m = a.href.match(/\/video\/([A-Za-z0-9_\-]{11})\//);
        if (!m) continue;
        const id = m[1];
        // 같은 row에서 제목 탐색
        const row = a.closest('ytcp-video-row') || a.parentElement;
        const titleEl = row?.querySelector('#video-title, .title');
        const title = titleEl?.textContent?.trim() || '';
        result.push({ id, title });
      }
      return result;
    });

    // 신규 항목만 추가
    for (const e of entries) {
      if (!videos.find(v => v.id === e.id)) videos.push(e);
    }

    if (videos.length === prevCount) {
      stableRounds++;
      if (stableRounds >= 4) break;
    } else {
      stableRounds = 0;
    }
    prevCount = videos.length;

    await page.evaluate(() => window.scrollBy(0, 800));
    await wait(800);
  }

  console.log(`\n총 ${videos.length}개 영상 수집:`);
  videos.forEach(v => console.log(`  ${v.id} | ${v.title}`));

  // JSON으로 저장
  const outPath = path.join(process.cwd(), 'data', 'video_list.json');
  fs.writeFileSync(outPath, JSON.stringify(videos, null, 2), 'utf8');
  console.log(`\n저장: ${outPath}`);

  await ctx.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
