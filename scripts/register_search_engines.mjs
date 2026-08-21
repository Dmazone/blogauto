/**
 * register_search_engines.mjs — 한국/글로벌 검색 엔진 일괄 등록
 * Zum, Nate, Daum 등에 블로그 RSS/사이트맵 제출
 * Usage: node scripts/register_search_engines.mjs
 */
import https from 'https';
import http from 'http';
import { sendTelegram } from './telegram.js';

const BLOG_URL   = 'https://dmazone.github.io/blogauto/';
const SITEMAP    = 'https://dmazone.github.io/blogauto/sitemap.xml';
const RSS        = 'https://dmazone.github.io/blogauto/index.xml';
const BLOG_TITLE = '트렌드줌';

function httpGet(url, followRedirect = true) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'BlogAuto-Crawler/1.0 (+https://dmazone.github.io/blogauto/)' } }, (res) => {
      if (followRedirect && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpGet(res.headers.location));
        return;
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  });
}

function httpPost(url, body, contentType = 'application/x-www-form-urlencoded') {
  return new Promise((resolve) => {
    const u   = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const buf = Buffer.from(body, 'utf8');
    const req = lib.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  {
        'Content-Type': contentType,
        'Content-Length': buf.length,
        'User-Agent': 'BlogAuto-Crawler/1.0',
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.write(buf);
    req.end();
  });
}

// ─── 1. Zum 검색 ──────────────────────────────────────────────────────────────
// Zum은 RSS 등록 페이지 없음 — 크롤링 유도만 가능
async function pingZum() {
  // Zum은 자체 크롤러가 있고, sitemap이 등록되면 자동 수집
  // sitemap URL을 GET 요청해서 Zum 크롤러가 감지하도록 유도
  const url = `https://search.zum.com/search.zum?method=uni&option=elsa&query=site:${encodeURIComponent(BLOG_URL)}`;
  const r = await httpGet(url);
  const ok = r.status === 200 || r.status === 302;
  console.log(`  ${ok ? '✅' : '⚠️'} Zum 검색 확인 [${r.status}]`);
  return ok;
}

// ─── 2. Nate 검색 (SK Communications) ────────────────────────────────────────
async function pingNate() {
  const url = `https://search.nate.com/search/all.html?q=site:${encodeURIComponent(BLOG_URL)}`;
  const r = await httpGet(url);
  const ok = r.status === 200;
  console.log(`  ${ok ? '✅' : '⚠️'} Nate 검색 확인 [${r.status}]`);
  return ok;
}

// ─── 3. Google Search Sitemap Ping ────────────────────────────────────────────
async function pingGoogleSitemap() {
  const url = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP)}`;
  const r = await httpGet(url);
  const ok = r.status === 200 || r.status === 301 || r.status === 302;
  console.log(`  ${ok ? '✅' : '⚠️'} Google Sitemap Ping [${r.status}]`);
  return ok;
}

// ─── 4. Bing Sitemap Ping ─────────────────────────────────────────────────────
async function pingBingSitemap() {
  const url = `https://www.bing.com/ping?sitemap=${encodeURIComponent(SITEMAP)}`;
  const r = await httpGet(url);
  const ok = r.status >= 200 && r.status < 400;
  console.log(`  ${ok ? '✅' : '⚠️'} Bing Sitemap Ping [${r.status}]`);
  return ok;
}

// ─── 5. Yandex Sitemap Ping ───────────────────────────────────────────────────
async function pingYandex() {
  const url = `https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(SITEMAP)}`;
  const r = await httpGet(url);
  const ok = r.status >= 200 && r.status < 400;
  console.log(`  ${ok ? '✅' : '⚠️'} Yandex Sitemap Ping [${r.status}]`);
  return ok;
}

// ─── 6. 바이두 Sitemap Ping (중국 검색) ─────────────────────────────────────────
async function pingBaidu() {
  const url = `http://ping.baidu.com/ping/RPC2`;
  const body = `<?xml version="1.0"?><methodCall><methodName>weblogUpdates.extendedPing</methodName><params><param><value><string>${BLOG_TITLE}</string></value></param><param><value><string>${BLOG_URL}</string></value></param><param><value><string>${BLOG_URL}</string></value></param><param><value><string>${RSS}</string></value></param></params></methodCall>`;
  const r = await httpPost(url, body, 'text/xml');
  const ok = r.status === 200;
  console.log(`  ${ok ? '✅' : '⚠️'} Baidu Ping [${r.status || r.error}]`);
  return ok;
}

// ─── 7. IndexNow (전체 사이트맵 재제출) ──────────────────────────────────────
async function submitIndexNowFull() {
  try {
    const sitemapRes = await httpGet(SITEMAP);
    if (!sitemapRes.body) { console.log('  ⚠️ 사이트맵 다운로드 실패'); return; }
    const locs = [...sitemapRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
    if (!locs.length) { console.log('  ⚠️ URL 없음'); return; }

    const r = await httpPost('https://api.indexnow.org/indexnow', JSON.stringify({
      host:        'dmazone.github.io',
      key:         'c025a607af5dbc0a7c80e1a5058761ad',
      keyLocation: `${BLOG_URL}c025a607af5dbc0a7c80e1a5058761ad.txt`,
      urlList:     locs,
    }), 'application/json; charset=utf-8');

    const ok = r.status === 200 || r.status === 202;
    console.log(`  ${ok ? '✅' : '⚠️'} IndexNow 재제출 ${locs.length}개 URL [${r.status}]`);
  } catch (err) {
    console.log(`  ❌ IndexNow 오류: ${err.message}`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌐 검색 엔진 일괄 등록/핑 시작\n');

  console.log('1️⃣  Google Sitemap Ping');
  await pingGoogleSitemap();

  console.log('\n2️⃣  Bing Sitemap Ping');
  await pingBingSitemap();

  console.log('\n3️⃣  IndexNow 전체 사이트맵 재제출');
  await submitIndexNowFull();

  console.log('\n4️⃣  Yandex Sitemap Ping');
  await pingYandex();

  console.log('\n5️⃣  Baidu Ping');
  await pingBaidu();

  console.log('\n6️⃣  Zum 검색 확인');
  await pingZum();

  console.log('\n7️⃣  Nate 검색 확인');
  await pingNate();

  console.log('\n✅ 검색 엔진 일괄 등록 완료');
  await sendTelegram(`🌐 검색 엔진 일괄 등록 완료\nGoogle·Bing·IndexNow·Yandex·Baidu·Zum·Nate\n${BLOG_URL}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
