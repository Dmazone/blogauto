/**
 * yt_upload_backlog.mjs — 누락된 Shorts 영상 즉시 공개 업로드
 * Usage: node scripts/yt_upload_backlog.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', '1_youtube-shorts');

const PENDING_YT_PATH = path.join(ROOT, 'data', 'pending_yt_upload.json');

// pending_yt_upload.json이 있으면 그걸 우선 사용, 없으면 하드코딩 목록
function getBacklog() {
  if (fs.existsSync(PENDING_YT_PATH)) {
    try {
      const list = JSON.parse(fs.readFileSync(PENDING_YT_PATH, 'utf8'));
      if (Array.isArray(list) && list.length > 0) {
        console.log(`📋 pending_yt_upload.json 로드: ${list.length}개`);
        return list;
      }
    } catch {}
  }
  // 폴백 하드코딩 (파일 없을 때)
  return [];
}

const BACKLOG = getBacklog();

function log(...args) { console.log(new Date().toTimeString().slice(0, 8), ...args); }
const wait = ms => new Promise(r => setTimeout(r, ms));

function getTitle(slug) {
  const indexMd = path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md');
  if (fs.existsSync(indexMd)) {
    const m = fs.readFileSync(indexMd, 'utf8').match(/^title:\s*"(.+?)"/m);
    if (m) return m[1].trim() + ' #Shorts';
  }
  return `트렌드 상품 추천 TOP3 #Shorts`;
}

function uploadNow(mp4Path, title) {
  return new Promise((resolve) => {
    const blogUrl = `https://bimil.site/posts/trending-picks/${path.basename(mp4Path, '.mp4')}/`;
    const desc = `지금 가장 인기 있는 트렌드 상품을 비교·추천합니다.\n\n🔗 상세 비교 리뷰 보기\n${blogUrl}\n\n#Shorts #트렌드 #쿠팡추천`;
    log(`📤 업로드: ${path.basename(mp4Path)}`);
    const proc = spawn(process.execPath, [
      path.join(__dirname, 'yt_upload.mjs'), mp4Path, title, desc,
    ], { cwd: ROOT, stdio: ['inherit', 'pipe', 'inherit'] });
    let out = '';
    proc.stdout.on('data', d => { process.stdout.write(d); out += d; });
    proc.on('close', code => {
      const m = out.match(/VIDEO_ID:([a-zA-Z0-9_-]+)/);
      const videoId = m ? m[1] : null;
      resolve({ success: code === 0, videoId });
    });
  });
}

function postComment(videoId, slug) {
  return new Promise((resolve) => {
    log(`💬 댓글 게시: ${videoId}`);
    const proc = spawn(process.execPath, [
      path.join(__dirname, 'yt_comment.mjs'), videoId, slug,
    ], { cwd: ROOT, stdio: 'inherit' });
    proc.on('close', code => {
      log(code === 0 ? '✅ 댓글 완료' : '⚠️ 댓글 실패');
      resolve();
    });
  });
}

async function main() {
  log(`🚀 백로그 업로드 시작 (${BACKLOG.length}개)`);

  let successCount = 0;
  for (let i = 0; i < BACKLOG.length; i++) {
    const slug = BACKLOG[i];
    const mp4Path = path.join(OUT_DIR, `${slug}.mp4`);
    if (!fs.existsSync(mp4Path)) {
      log(`⏭️  MP4 없음 스킵: ${slug}`);
      continue;
    }

    log(`\n[${i + 1}/${BACKLOG.length}] ${slug}`);
    const title = getTitle(slug);
    const { success, videoId } = await uploadNow(mp4Path, title);

    if (success) {
      successCount++;
      log(`✅ 업로드 완료 (VIDEO_ID: ${videoId})`);
      // pending 파일에서 제거
      try {
        if (fs.existsSync(PENDING_YT_PATH)) {
          const list = JSON.parse(fs.readFileSync(PENDING_YT_PATH, 'utf8')).filter(s => s !== slug);
          fs.writeFileSync(PENDING_YT_PATH, JSON.stringify(list, null, 2));
        }
      } catch {}
      if (videoId && videoId !== 'unknown') {
        await postComment(videoId, slug);
      }
    } else {
      log(`❌ 업로드 실패: ${slug}`);
    }

    if (i < BACKLOG.length - 1) {
      log('  ⏸️  90초 대기...');
      await wait(90 * 1000);
    }
  }

  const msg = `📤 백로그 업로드 완료\n✅ ${successCount}/${BACKLOG.length}개 성공`;
  log(msg);
  await sendTelegram(msg).catch(() => {});
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
