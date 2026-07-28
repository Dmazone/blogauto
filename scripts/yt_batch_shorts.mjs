/**
 * yt_batch_shorts.mjs — trending-picks 전체 포스팅 배치 Shorts 생성 + 예약 업로드
 *
 * 동작:
 *   1. content/posts/trending-picks/ 의 모든 포스팅을 최신순으로 조회
 *   2. 각 포스팅 → yt_make_shorts.mjs 로 MP4 생성
 *   3. yt_upload.mjs --schedule=ISO 로 1시간 간격 예약 업로드
 *   4. 진행상황 텔레그램 알림
 *
 * Usage: node scripts/yt_batch_shorts.mjs
 *        node scripts/yt_batch_shorts.mjs --dry-run   (업로드 없이 영상만 생성)
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegram } from './telegram.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const OUT_DIR    = path.join(ROOT, 'data', '1_youtube-shorts');
const DRY_RUN    = process.argv.includes('--dry-run');
// 첫 번째 업로드까지 대기 시간 (분)
const START_DELAY_MIN = 30;
// 업로드 간격 (분)
const INTERVAL_MIN    = 60;

function log(...args) { console.log(new Date().toTimeString().slice(0, 8), ...args); }

// trending-picks 포스팅 전체 슬러그 (최신순)
function getAllPosts() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse(); // 최신순
}

// 영상 생성 (yt_make_shorts.mjs 호출)
function makeVideo(slug) {
  return new Promise((resolve, reject) => {
    log(`🎬 [생성] ${slug}`);
    const proc = spawn(process.execPath, [
      path.join(__dirname, 'yt_make_shorts.mjs'), slug, '--no-preview',
    ], { cwd: ROOT, stdio: 'inherit' });
    proc.on('close', code => {
      const mp4 = path.join(OUT_DIR, `${slug}.mp4`);
      if (code === 0 && fs.existsSync(mp4)) {
        log(`✅ 생성 완료: ${slug}.mp4 (${(fs.statSync(mp4).size / 1024 / 1024).toFixed(1)}MB)`);
        resolve(mp4);
      } else {
        reject(new Error(`영상 생성 실패: ${slug} (exit ${code})`));
      }
    });
  });
}

// 예약 업로드 (yt_upload.mjs 호출)
function scheduleUpload(mp4Path, title, scheduleISO) {
  return new Promise((resolve, reject) => {
    log(`📤 [업로드] ${path.basename(mp4Path)} → ${scheduleISO} KST`);
    const proc = spawn(process.execPath, [
      path.join(__dirname, 'yt_upload.mjs'),
      mp4Path,
      title,
      `지금 가장 인기 있는 트렌드 상품을 비교·추천해줄게!\n자세한 내용은 트렌드줌 블로그에서 확인해봐 👇\n\n#Shorts #트렌드 #쿠팡추천`,
      `--schedule=${scheduleISO}`,
    ], { cwd: ROOT, stdio: 'inherit' });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`업로드 실패 (exit ${code})`));
    });
  });
}

// 포스팅 제목 파싱
function getTitle(slug) {
  try {
    const md = fs.readFileSync(
      path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
    );
    return (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;
  } catch { return slug; }
}

// ISO datetime 포맷 (KST → "YYYY-MM-DDTHH:MM")
function toScheduleISO(date) {
  const d = new Date(date);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D}T${h}:${m}`;
}

async function main() {
  const posts = getAllPosts();
  log(`📋 처리할 포스팅: ${posts.length}개`);
  posts.forEach((slug, i) => {
    const schedMs = Date.now() + (START_DELAY_MIN + i * INTERVAL_MIN) * 60 * 1000;
    log(`  [${i + 1}] ${slug} → ${toScheduleISO(new Date(schedMs))} KST`);
  });

  if (DRY_RUN) {
    log('🔍 --dry-run 모드: 예약 시간 확인만 하고 종료');
    return;
  }

  await sendTelegram(
    `🎬 YouTube Shorts 배치 시작\n총 ${posts.length}개 / 1시간 간격 예약 업로드\n완료까지 약 ${posts.length * 10 + 30}분 소요 예상`
  ).catch(() => {});

  const results = [];
  const startMs = Date.now();

  for (let i = 0; i < posts.length; i++) {
    const slug        = posts[i];
    const title       = getTitle(slug);
    const schedMs     = startMs + (START_DELAY_MIN + i * INTERVAL_MIN) * 60 * 1000;
    const schedISO    = toScheduleISO(new Date(schedMs));
    const mp4Cached   = path.join(OUT_DIR, `${slug}.mp4`);

    log(`\n${'─'.repeat(50)}`);
    log(`[${i + 1}/${posts.length}] ${slug}`);
    log(`예약 시간: ${schedISO} KST`);

    let mp4Path;
    try {
      // 이미 생성된 영상이 있으면 재사용
      if (fs.existsSync(mp4Cached)) {
        const ageH = (Date.now() - fs.statSync(mp4Cached).mtimeMs) / 3600000;
        if (ageH < 24) {
          log(`♻️ 기존 영상 재사용 (${ageH.toFixed(1)}시간 전 생성)`);
          mp4Path = mp4Cached;
        }
      }
      if (!mp4Path) mp4Path = await makeVideo(slug);
    } catch (e) {
      log(`❌ 영상 생성 실패: ${e.message}`);
      await sendTelegram(`❌ [${i+1}/${posts.length}] 영상 생성 실패\n${slug}\n${e.message}`).catch(() => {});
      results.push({ slug, ok: false, err: e.message });
      continue;
    }

    try {
      await scheduleUpload(mp4Path, title, schedISO);
      log(`✅ 예약 업로드 완료: ${schedISO}`);
      await sendTelegram(
        `✅ [${i+1}/${posts.length}] 예약 업로드\n📹 ${title}\n⏰ ${schedISO} KST 공개`
      ).catch(() => {});
      results.push({ slug, ok: true, schedISO });
    } catch (e) {
      log(`❌ 업로드 실패: ${e.message}`);
      await sendTelegram(`❌ [${i+1}/${posts.length}] 업로드 실패\n${slug}\n${e.message}`).catch(() => {});
      results.push({ slug, ok: false, err: e.message });
    }

    // 다음 업로드 전 잠시 대기 (YouTube Studio 안정화)
    if (i < posts.length - 1) {
      log('⏳ 다음 업로드 전 30초 대기...');
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  // ── 최종 요약 ────────────────────────────────────────────────
  const ok  = results.filter(r => r.ok).length;
  const ng  = results.filter(r => !r.ok).length;
  const elapsed = ((Date.now() - startMs) / 60000).toFixed(0);

  log(`\n${'='.repeat(50)}`);
  log(`완료: 성공 ${ok}개 / 실패 ${ng}개 / 소요 ${elapsed}분`);
  if (ok > 0) {
    log('예약 일정:');
    results.filter(r => r.ok).forEach(r => log(`  ${r.schedISO} → ${r.slug}`));
  }

  await sendTelegram(
    `🎬 YouTube Shorts 배치 완료\n✅ 성공 ${ok}개 / ❌ 실패 ${ng}개\n소요: ${elapsed}분\n\n` +
    results.filter(r => r.ok).map(r => `⏰ ${r.schedISO}\n📹 ${r.slug}`).join('\n\n')
  ).catch(() => {});
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
