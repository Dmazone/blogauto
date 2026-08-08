/**
 * submit_all_indexnow.mjs
 * 사이트맵에서 전체 URL 추출 → IndexNow + Google 사이트맵 핑 일괄 제출
 * 사용: node scripts/submit_all_indexnow.mjs
 */

import 'dotenv/config';

const BASE_URL   = 'https://dmazone.github.io/blogauto';
const SITEMAP    = `${BASE_URL}/sitemap.xml`;
const INDEXNOW_KEY = 'c025a607af5dbc0a7c80e1a5058761ad';
const TOKEN      = process.env.TELEGRAM_TOKEN;
const CHAT_ID    = process.env.TELEGRAM_CHAT_ID;

async function tg(msg) {
  if (!TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'HTML' }),
    });
  } catch {}
}

async function fetchSitemap() {
  console.log('📥 사이트맵 다운로드 중...');
  const res = await fetch(SITEMAP);
  if (!res.ok) throw new Error(`사이트맵 HTTP ${res.status}`);
  const xml = await res.text();

  // <loc> 태그에서 URL 추출
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const urls = matches.map(m => m[1].trim());
  console.log(`✅ 총 ${urls.length}개 URL 추출`);
  return urls;
}

async function submitIndexNow(urlList) {
  const BATCH = 10000; // IndexNow 최대
  let total = 0;

  for (let i = 0; i < urlList.length; i += BATCH) {
    const chunk = urlList.slice(i, i + BATCH);
    console.log(`🔍 IndexNow 제출 중: ${i + 1}~${i + chunk.length}번째 (${chunk.length}개)...`);
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host:        'dmazone.github.io',
        key:         INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList:     chunk,
      }),
    });
    console.log(`  → HTTP ${res.status}`);
    total += chunk.length;
    if (i + BATCH < urlList.length) await new Promise(r => setTimeout(r, 2000));
  }
  return total;
}

async function main() {
  console.log('=== IndexNow 전체 제출 시작 ===');
  const start = Date.now();

  // 1. 사이트맵에서 모든 URL 수집
  const allUrls = await fetchSitemap();

  // 2. 포스팅 URL만 필터 — 태그/카테고리는 IndexNow 품질 신호 희석
  const postUrls = allUrls.filter(u =>
    !u.includes('/tags/') && !u.includes('/categories/')
  );
  const skipped = allUrls.length - postUrls.length;
  console.log(`📋 제출 대상: ${postUrls.length}개 (태그/카테고리 ${skipped}개 제외)`);

  // 3. IndexNow 일괄 제출
  const submitted = await submitIndexNow(postUrls);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const msg = `✅ IndexNow 전체 제출 완료\n• 총 URL: ${postUrls.length}개\n• IndexNow 제출: ${submitted}개\n• 소요: ${elapsed}초`;
  console.log('\n' + msg);
  await tg(msg);
}

main().catch(async err => {
  const msg = `❌ submit_all_indexnow 오류: ${err.message}`;
  console.error(msg);
  await tg(msg);
  process.exit(1);
});
