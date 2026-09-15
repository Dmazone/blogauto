/**
 * yt_create_playlists.mjs — 카테고리별 YouTube 플레이리스트 생성 + 영상 추가
 * 사용: node scripts/yt_create_playlists.mjs
 *
 * 플레이리스트 3개:
 *  1. 마사지·헬스케어 — 마사지기, 안마, 건강케어 제품
 *  2. IT·생산성 기기 — 키보드, 마우스, 모니터암, 독서대, 모션데스크
 *  3. 스마트라이프 — 충전기, 가습기, 스마트홈, 자전거 등 생활가전
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SESSION = path.join(os.homedir(), '.yt-ekaledma-session');
const wait = ms => new Promise(r => setTimeout(r, ms));

// 플레이리스트 정의
const PLAYLISTS = [
  {
    name: '마사지·헬스케어 TOP3 Shorts',
    description: '마사지기, 뷰티디바이스, 건강케어 제품 TOP3 비교 추천 쇼츠 모음',
    keywords: ['마사지', '안마', '헬스', '건강', '뷰티', '종아리', '경추', '무릎', '눈 마사', '스트레칭'],
  },
  {
    name: 'IT·생산성 기기 TOP3 Shorts',
    description: '키보드, 마우스, 모니터암, 독서대, 보이스레코더 등 IT 업무용 기기 TOP3 비교',
    keywords: ['키보드', '마우스', '모니터암', '독서대', '보이스', '팜레스트', '모션데스크', '모니터 조', '헤드폰', '이어폰', '포터블 모니터'],
  },
  {
    name: '스마트라이프 가성비 TOP3 Shorts',
    description: '충전기, 가습기, 스마트플러그, 미니벨로, 구강세정기 등 스마트 라이프 제품 TOP3 추천',
    keywords: ['충전기', '가습기', '스마트 플러그', '벨로', '구강세정', '카본매트', '차량용'],
  },
];

// 영상 목록 (video_list.json)
function loadVideos() {
  const p = path.join(process.cwd(), 'data', 'video_list.json');
  if (!fs.existsSync(p)) {
    throw new Error('data/video_list.json 없음 — yt_list_videos.mjs 먼저 실행');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function matchPlaylist(title, keywords) {
  const t = title.toLowerCase();
  return keywords.some(k => t.includes(k.toLowerCase()));
}

async function createPlaylist(page, name, description) {
  // YouTube Studio → 재생목록 탭
  await page.goto('https://studio.youtube.com/playlists', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(4000);

  // "새 재생목록" 버튼 클릭
  const newBtn = await page.$('ytcp-button[aria-label*="새 재생목록"], ytcp-button:has-text("새 재생목록"), ytcp-button:has-text("New playlist")');
  if (!newBtn) {
    console.log('  ⚠️  "새 재생목록" 버튼 없음 — URL 확인 필요');
    return null;
  }
  await newBtn.click();
  await wait(1500);

  // 제목 입력
  const titleInput = await page.$('ytcp-playlist-dialog input, dialog input[type="text"], [aria-label*="제목"]');
  if (!titleInput) {
    console.log('  ⚠️  제목 입력 필드 없음');
    return null;
  }
  await titleInput.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(name, { delay: 30 });
  await wait(500);

  // 설명 입력 (있으면)
  const descEl = await page.$('ytcp-playlist-dialog textarea, dialog textarea');
  if (descEl) {
    await descEl.click();
    await page.keyboard.type(description, { delay: 20 });
    await wait(300);
  }

  // 공개 설정 (공개)
  const privacyBtn = await page.$('ytcp-select[id*="privacy"], [id*="visibility"]');
  if (privacyBtn) {
    await privacyBtn.click();
    await wait(500);
    const publicOption = await page.$('ytcp-select-option:has-text("공개"), [data-value="PUBLIC"]');
    if (publicOption) await publicOption.click();
    await wait(300);
  }

  // 만들기 버튼
  const createBtn = await page.$('ytcp-button[action="save"], ytcp-button:has-text("만들기"), ytcp-button:has-text("Create")');
  if (!createBtn) {
    console.log('  ⚠️  "만들기" 버튼 없음');
    return null;
  }
  await createBtn.click();
  await wait(3000);

  // 생성된 플레이리스트 URL에서 ID 추출
  const url = page.url();
  const m = url.match(/playlist\/([A-Za-z0-9_\-]+)/);
  const playlistId = m?.[1] || null;
  console.log(`  ✅ 플레이리스트 생성: "${name}" → ${playlistId || '(ID 미확인)'}`);
  return playlistId;
}

async function addVideoToPlaylist(page, videoId, playlistName) {
  // 영상 편집 페이지 이동
  await page.goto(`https://studio.youtube.com/video/${videoId}/edit`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(3000);

  // "재생목록" 섹션 찾기
  const playlistSection = await page.$('ytcp-form-select[label*="재생목록"], ytcp-dropdown[label*="Playlist"], [aria-label*="재생목록"]');
  if (!playlistSection) {
    console.log(`    ⚠️  ${videoId}: 재생목록 섹션 없음`);
    return false;
  }
  await playlistSection.click();
  await wait(1000);

  // 대상 플레이리스트 체크
  const options = await page.$$('ytcp-checkbox-lit, ytcp-playlist-option');
  for (const opt of options) {
    const label = (await opt.textContent())?.trim() || '';
    if (label.includes(playlistName.split('·')[0])) {
      const isChecked = await opt.getAttribute('checked');
      if (!isChecked || isChecked === 'false') {
        await opt.click();
        await wait(300);
      }
      break;
    }
  }

  // 적용
  const doneBtn = await page.$('ytcp-button:has-text("완료"), ytcp-button:has-text("Done")');
  if (doneBtn) await doneBtn.click();
  await wait(500);

  // 저장
  const saveBtn = await page.$('ytcp-button#save-button, [id="save-button"]');
  if (saveBtn) {
    await saveBtn.click();
    await wait(2000);
    return true;
  }
  return false;
}

async function main() {
  const videos = loadVideos();
  console.log(`\n📋 영상 ${videos.length}개 로드`);

  // 카테고리 분류
  const categorized = {};
  PLAYLISTS.forEach(p => { categorized[p.name] = []; });

  for (const v of videos) {
    for (const pl of PLAYLISTS) {
      if (matchPlaylist(v.title, pl.keywords)) {
        categorized[pl.name].push(v);
        break;
      }
    }
  }

  // 분류 미리보기
  console.log('\n📂 카테고리 분류:');
  for (const [name, vids] of Object.entries(categorized)) {
    console.log(`\n  [${name}] — ${vids.length}개`);
    vids.forEach(v => console.log(`    ${v.id} | ${v.title}`));
  }

  const ctx = await chromium.launchPersistentContext(SESSION, {
    headless: false, ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'], viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  for (const pl of PLAYLISTS) {
    const vids = categorized[pl.name];
    if (vids.length === 0) { console.log(`\n⏭️  ${pl.name}: 해당 영상 없음`); continue; }

    console.log(`\n🎬 플레이리스트 생성: "${pl.name}" (${vids.length}개 영상)`);
    const playlistId = await createPlaylist(page, pl.name, pl.description);

    if (playlistId) {
      // 각 영상에 플레이리스트 추가
      let ok = 0;
      for (const v of vids) {
        process.stdout.write(`    ${v.id}... `);
        const result = await addVideoToPlaylist(page, v.id, pl.name);
        console.log(result ? '✅' : '⚠️');
        if (result) ok++;
        await wait(500);
      }
      console.log(`  → ${ok}/${vids.length}개 추가 완료`);
    }
  }

  await wait(2000);
  await ctx.close();
  console.log('\n✅ 플레이리스트 생성 완료');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
