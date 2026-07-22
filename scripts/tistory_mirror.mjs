/**
 * tistory_mirror.mjs — 오늘 발행된 포스팅을 티스토리에 미러링
 *
 * 필요 환경변수 (.env):
 *   TISTORY_ACCESS_TOKEN  OAuth 토큰 (tistory_auth.mjs로 발급)
 *   TISTORY_BLOG          블로그 이름 (예: myblog → myblog.tistory.com)
 *   BLOG_BASE_URL         원본 블로그 URL (내부 링크 → 절대 URL 변환용)
 *
 * 실행:
 *   node scripts/tistory_mirror.mjs          # 오늘 날짜 포스팅 미러링
 *   node scripts/tistory_mirror.mjs --days 3 # 최근 3일치 미러링
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const ACCESS_TOKEN = process.env.TISTORY_ACCESS_TOKEN;
const BLOG_NAME    = process.env.TISTORY_BLOG;
const BASE_URL     = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');
const MIRROR_LOG   = path.join(ROOT, 'data', 'tistory_mirrored.json');
const POSTS_DIR    = path.join(ROOT, 'content', 'posts');

if (!ACCESS_TOKEN || !BLOG_NAME) {
  console.error('❌ TISTORY_ACCESS_TOKEN 또는 TISTORY_BLOG 환경변수 미설정');
  console.error('   → node scripts/tistory_auth.mjs 실행 후 .env에 토큰 추가');
  process.exit(1);
}

// ── 마이그레이션 로그 (중복 방지) ─────────────────────────────────────────
function loadMirrorLog() {
  try { return JSON.parse(fs.readFileSync(MIRROR_LOG, 'utf-8')); }
  catch { return {}; }
}
function saveMirrorLog(log) {
  fs.mkdirSync(path.dirname(MIRROR_LOG), { recursive: true });
  fs.writeFileSync(MIRROR_LOG, JSON.stringify(log, null, 2), 'utf-8');
}

// ── 간단한 Markdown → HTML 변환 ───────────────────────────────────────────
function mdToHtml(md, slug, sectionDir) {
  const absBase = `${BASE_URL}/posts/${sectionDir}/${slug}`;
  let html = md
    // 이미지 (Page Bundle 상대경로 → 절대 URL)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const absSrc = src.startsWith('http') ? src : `${absBase}/${src}`;
      return `<img src="${absSrc}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:16px auto;">`;
    })
    // 링크
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const absHref = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      return `<a href="${absHref}" target="_blank" rel="noopener">${text}</a>`;
    })
    // H2
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // H3
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // H4
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 인용구
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // 불릿 리스트
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // 해시태그 줄 (마지막 줄 #태그들 → 스타일 처리)
    .replace(/^(#\S+ ?)+$/gm, (match) => `<p style="color:#888;font-size:0.85em;">${match}</p>`)
    // 연속 li → ul 감싸기
    .replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
    // 빈 줄 → 단락 구분
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // 원문 링크 추가
  html += `<hr><p style="color:#888;font-size:0.9em;">📌 원문: <a href="${absBase}/" target="_blank" rel="noopener">${absBase}/</a></p>`;

  return `<p>${html}</p>`;
}

// ── Tistory API 호출 ──────────────────────────────────────────────────────
function apiPost(params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ output: 'json', access_token: ACCESS_TOKEN, ...params }).toString();
    const req = https.request({
      hostname: 'www.tistory.com',
      path: '/apis/post/write',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`응답 파싱 실패: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── 포스팅 스캔 ───────────────────────────────────────────────────────────
function scanPosts(daysBack = 1) {
  const posts = [];
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  for (const sectionDir of fs.readdirSync(POSTS_DIR)) {
    const sectionPath = path.join(POSTS_DIR, sectionDir);
    if (!fs.statSync(sectionPath).isDirectory()) continue;

    for (const postDir of fs.readdirSync(sectionPath)) {
      const indexPath = path.join(sectionPath, postDir, 'index.md');
      if (!fs.existsSync(indexPath)) continue;

      const stat = fs.statSync(indexPath);
      if (stat.mtime < cutoff) continue;

      const raw = fs.readFileSync(indexPath, 'utf-8');
      const titleM = raw.match(/^title:\s*"?([^"\n]+)"?/m);
      const dateM  = raw.match(/^date:\s*(.+)$/m);
      const tagsM  = raw.match(/^tags:\s*\[([^\]]+)\]/m);
      const descM  = raw.match(/^description:\s*"?([^"\n]+)"?/m);
      const body   = raw.replace(/^---[\s\S]+?---\n*/m, '').trim();

      posts.push({
        slug: postDir,
        sectionDir,
        title: (titleM?.[1] ?? postDir).replace(/\\"/g, '"').trim(),
        date: dateM?.[1]?.trim() ?? '',
        tags: tagsM ? tagsM[1].replace(/"/g, '').split(',').map(t => t.trim()).join(',') : '',
        description: descM?.[1]?.trim() ?? '',
        body,
      });
    }
  }

  return posts;
}

// ── 메인 ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const daysBack = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 1 : 1;

const mirrorLog = loadMirrorLog();
const posts = scanPosts(daysBack);

console.log(`\n🪞 티스토리 미러링 시작 — 최근 ${daysBack}일 포스팅 ${posts.length}개 스캔\n`);

let done = 0, skipped = 0, failed = 0;

for (const post of posts) {
  if (mirrorLog[post.slug]) {
    console.log(`  ⏭️  스킵 (이미 미러링): ${post.title}`);
    skipped++;
    continue;
  }

  try {
    console.log(`  🔄 미러링: ${post.title}`);
    const content = mdToHtml(post.body, post.slug, post.sectionDir);

    const res = await apiPost({
      blogName:      BLOG_NAME,
      title:         post.title,
      content,
      visibility:    '3', // 공개
      tag:           post.tags,
      acceptComment: '1',
    });

    if (res.tistory?.status === '200') {
      const postId  = res.tistory?.item?.postId;
      const postUrl = res.tistory?.item?.url ?? `https://${BLOG_NAME}.tistory.com/${postId}`;
      mirrorLog[post.slug] = { postId, url: postUrl, mirrored: new Date().toISOString() };
      saveMirrorLog(mirrorLog);
      console.log(`  ✅ 완료: ${postUrl}`);
      done++;
    } else {
      const errMsg = res.tistory?.error?.message ?? JSON.stringify(res).slice(0, 100);
      throw new Error(errMsg);
    }

    // 연속 호출 방지
    await new Promise(r => setTimeout(r, 3000));

  } catch (err) {
    console.log(`  ❌ 실패: ${post.title} — ${err.message}`);
    failed++;
  }
}

console.log(`\n✅ 미러링 완료 — 성공 ${done}개 / 스킵 ${skipped}개 / 실패 ${failed}개\n`);
