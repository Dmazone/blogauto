/**
 * ping_services.mjs — 블로그 RSS/사이트맵을 여러 핑 서비스에 제출
 * WebSub(PubSubHubbub) + XML-RPC 핑으로 구글·야후·다음 빠른 크롤링 유도
 * Usage: node scripts/ping_services.mjs
 */
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const BLOG_TITLE = '트렌드줌';
const BLOG_URL   = 'https://dmazone.github.io/blogauto/';
const BLOG_RSS   = 'https://dmazone.github.io/blogauto/index.xml';

// ─── HTTP 헬퍼 ────────────────────────────────────────────────────────────────

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
      headers:  { 'Content-Type': contentType, 'Content-Length': buf.length,
                  'User-Agent': 'BlogAuto-Ping/1.0' },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.write(buf);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'BlogAuto-Ping/1.0' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  });
}

// ─── 1. WebSub (PubSubHubbub) ─────────────────────────────────────────────────
// Google이 구독한 Hub에 RSS 업데이트 알림 → 빠른 크롤링 유도
async function pingWebSub() {
  const hubs = [
    'https://pubsubhubbub.appspot.com/publish',
    'https://pubsubhubbub.superfeedr.com/',
  ];
  const results = [];
  for (const hub of hubs) {
    const body = `hub.mode=publish&hub.url=${encodeURIComponent(BLOG_RSS)}`;
    const r = await httpPost(hub, body);
    const ok = r.status >= 200 && r.status < 300;
    console.log(`  ${ok ? '✅' : '⚠️'} WebSub → ${hub.replace('https://', '')} [${r.status}]`);
    results.push(ok);
  }
  return results.some(Boolean);
}

// ─── 2. XML-RPC 핑 ────────────────────────────────────────────────────────────
function xmlrpcBody(title, url) {
  return `<?xml version="1.0"?><methodCall><methodName>weblogUpdates.ping</methodName><params><param><value><string>${title}</string></value></param><param><value><string>${url}</string></value></param></params></methodCall>`;
}

async function pingXmlRpc() {
  const endpoints = [
    'http://rpc.pingomatic.com/',           // Ping-O-Matic (100+ 서비스 일괄)
    'http://ping.blogs.yam.com/xmlrpc',    // 야후 블로그
    'http://www.bloglines.com/ping',        // Bloglines
  ];
  const body = xmlrpcBody(BLOG_TITLE, BLOG_URL);
  for (const ep of endpoints) {
    const r = await httpPost(ep, body, 'text/xml');
    const ok = r.status === 200;
    console.log(`  ${ok ? '✅' : '⚠️'} XML-RPC → ${ep.replace(/https?:\/\//, '')} [${r.status || r.error}]`);
  }
}

// ─── 3. Google 블로그 핑 (GET) ────────────────────────────────────────────────
async function pingGoogleBlog() {
  const url = `https://blogsearch.google.com/ping?name=${encodeURIComponent(BLOG_TITLE)}&url=${encodeURIComponent(BLOG_URL)}&changesURL=${encodeURIComponent(BLOG_RSS)}`;
  const r = await httpGet(url);
  const ok = r.status >= 200 && r.status < 400;
  console.log(`  ${ok ? '✅' : '⚠️'} Google Blog Ping [${r.status || r.error}]`);
  return ok;
}

// ─── 4. Daum 핑 ───────────────────────────────────────────────────────────────
async function pingDaum() {
  const url = `http://ping.daum.net/ping/?siteName=${encodeURIComponent(BLOG_TITLE)}&siteUrl=${encodeURIComponent(BLOG_URL)}`;
  const r = await httpGet(url);
  const ok = r.status >= 200 && r.status < 400;
  console.log(`  ${ok ? '✅' : '⚠️'} Daum Ping [${r.status || r.error}]`);
  return ok;
}

// ─── 5. Naver 검색 API 핑 ────────────────────────────────────────────────────
async function pingNaver() {
  const url = `http://apis.naver.com/crawl/naver_cms_rrss/crawl.nhn?service=googlerss&rss=${encodeURIComponent(BLOG_RSS)}`;
  const r = await httpGet(url);
  const ok = r.status >= 200 && r.status < 400;
  console.log(`  ${ok ? '✅' : '⚠️'} Naver RSS Ping [${r.status || r.error}]`);
  return ok;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📡 핑 서비스 일괄 제출 시작\n');
  console.log('🔗 Blog:', BLOG_URL);
  console.log('📻 RSS:', BLOG_RSS, '\n');

  console.log('1️⃣  WebSub (PubSubHubbub) — Google 빠른 RSS 크롤링 유도');
  await pingWebSub();

  console.log('\n2️⃣  XML-RPC 핑 — Ping-O-Matic 등 블로그 서비스');
  await pingXmlRpc();

  console.log('\n3️⃣  Google 블로그 핑');
  await pingGoogleBlog();

  console.log('\n4️⃣  Daum 핑');
  await pingDaum();

  console.log('\n5️⃣  Naver RSS 핑');
  await pingNaver();

  console.log('\n✅ 모든 핑 서비스 제출 완료');
  await sendTelegram(`📡 핑 서비스 일괄 제출 완료\nWebSub, XML-RPC, Google, Daum, Naver\nBlog: ${BLOG_URL}`);
}

export default main;

// 직접 실행 시
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
