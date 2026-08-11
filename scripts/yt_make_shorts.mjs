/**
 * yt_make_shorts.mjs — trending-picks → 1080×1920 YouTube Shorts MP4
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  [지침] 슬라이드 배경 이미지 생성 표준 절차                        ║
 * ║  1. 포스팅 markdown 쿠팡 링크 q= 파라미터(상품명) 파싱             ║
 * ║  2. 블로그 포스팅의 Gemini 생성 이미지 우선 사용                   ║
 * ║     · bg_intro (s0,s3): {slug}-thumb.webp (Gemini 썸네일)        ║
 * ║     · bg_s1    (s1)   : {slug}-01.webp   (Gemini 본문 이미지 1)  ║
 * ║     · bg_s2    (s2)   : {slug}-02.webp   (Gemini 본문 이미지 2)  ║
 * ║  3. Gemini 이미지 없으면 단색 배경 (#1a1a2e) — Pollinations 금지  ║
 * ║  4. HTML 배경 + Playwright 렌더링으로 텍스트 오버레이              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Flags:
 *   --no-preview   영상 생성 후 파일을 자동으로 열지 않음 (배치 처리용)
 *
 * Usage: node scripts/yt_make_shorts.mjs [slug] [--no-preview]
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const FFMPEG     = 'C:\\Users\\Paydma\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';
const OUT_DIR    = path.join(ROOT, 'data', '1_youtube-shorts');
const BGM_DIR    = path.join(OUT_DIR, 'bgm');
const NO_PREVIEW = process.argv.includes('--no-preview');

// ── 텍스트 유틸 ────────────────────────────────────────────────────

function breakText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if ([...candidate].length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return { html: lines.join('<br>'), lines: lines.length };
}

function dynFont(text, base) {
  const len = [...text].length;
  if (len <= 12) return base;
  if (len <= 18) return Math.round(base * 0.88);
  if (len <= 24) return Math.round(base * 0.78);
  return Math.round(base * 0.68);
}

// ── 파싱 ──────────────────────────────────────────────────────────

function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

function findLatestPost() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse()[0];
}

function coupangQuery(url) {
  try {
    return decodeURIComponent(new URL(url).searchParams.get('q') || '').replace(/\+/g, ' ').trim();
  } catch { return ''; }
}

function parsePost(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );
  const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;

  // 마크다운 테이블 파싱 (| **상품명** | 가격 | ...)
  const tableRows = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|/gm)].slice(0, 3);

  // 폴백: ### N) 패턴으로 상품명+가격 파싱
  const sectionRows = tableRows.length === 0
    ? [...md.matchAll(/###\s*\d+[)\.]\s*(?:\[?[^\]]*\]?)?\s*([가-힣\w\s\(\)]+?)\s*[\n\r]/gm)].slice(0, 3)
    : [];
  const priceRows = tableRows.length === 0
    ? [...md.matchAll(/실제 판매 가격대[:：]?\s*([^\n\r]+)/gm)].slice(0, 3)
    : [];

  const urls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''));

  let products;
  if (tableRows.length >= 1) {
    products = tableRows.map((m, i) => ({
      name:       m[1].trim(),
      price:      m[2].trim().replace(/\\\~/g, '~'),
      imageQuery: coupangQuery(urls[i] || '') || m[1].trim(),
    }));
  } else {
    // 폴백: 섹션 제목에서 상품명 추출
    const headings = [...md.matchAll(/###\s*\d+[)\.]\s*(?:\[[^\]]*\]\s*)?\[?([가-힣A-Za-z0-9\s\(\)\-]+?)\]?(?:\s*\([^)]*\))?\s*[\n\r]/gm)].slice(0, 3);
    products = headings.map((m, i) => ({
      name:       m[1].trim().replace(/\s+/g, ' '),
      price:      (priceRows[i] || [])[1]?.trim() || '',
      imageQuery: m[1].trim(),
    }));
    // 폴백도 실패하면 빈 배열
    if (products.length === 0) products = [];
  }

  const imgDir  = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  const fallImg = (name) => {
    const p = path.join(imgDir, name);
    return fs.existsSync(p) ? p : null;
  };
  return {
    title, products,
    fallback: {
      thumb: fallImg(`${slug}-thumb.webp`),
      img01: fallImg(`${slug}-01.webp`),
      img02: fallImg(`${slug}-02.webp`),
    },
  };
}

// ── HTML 슬라이드 빌더 ────────────────────────────────────────────

const MALGUN_URL = 'file:///C:/Windows/Fonts/malgunbd.ttf';

function buildHtml(bgImg, blocks) {
  const elems = blocks.map(b => {
    const fs_  = b.size || 48;
    const maxH = b.maxH ? `max-height:${b.maxH}px;overflow:hidden;` : '';
    const bg   = b.bg   ? `background:${b.bg};border-radius:16px;padding:12px 24px;` : '';
    return `<div style="
      position:absolute;width:960px;left:60px;top:${b.top}px;
      font-size:${fs_}px;color:${b.color || '#fff'};
      font-weight:${b.weight || 'bold'};text-align:center;
      font-family:'KOR',sans-serif;
      text-shadow:2px 2px 12px rgba(0,0,0,1),0 0 40px rgba(0,0,0,.95);
      line-height:1.3;word-break:keep-all;${maxH}${bg}">${b.text}</div>`;
  }).join('\n');

  const bgStyle = bgImg ? `background:#000` : `background:#0d0d1a`;
  const bgImgTag = bgImg
    ? `<img class="bg-img" src="${toFileUrl(bgImg)}" />`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @font-face {
    font-family: 'KOR';
    src: url('${MALGUN_URL}') format('truetype');
    font-weight: bold;
    font-style: normal;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1920px;overflow:hidden;position:relative;
    font-family:'KOR',sans-serif;${bgStyle}}
  .bg-img{position:absolute;top:0;left:0;width:100%;height:100%;
    object-fit:cover;object-position:center;
    filter:brightness(0.55) saturate(0.90);}
  .grad{position:absolute;inset:0;
    background:linear-gradient(180deg,
      rgba(0,0,0,.80) 0%,
      rgba(0,0,0,.10) 35%,
      rgba(0,0,0,.10) 65%,
      rgba(0,0,0,.85) 100%)}
  .stripe{position:absolute;left:0;right:0;height:6px;background:linear-gradient(90deg,#FFD700,#FF6B35,#FF0066,#FFD700)}
</style></head><body>
  ${bgImgTag}
  <div class="grad"></div>
  <div class="stripe" style="top:0"></div>
  <div class="stripe" style="bottom:0"></div>
${elems}
</body></html>`;
}

// ── TTS ───────────────────────────────────────────────────────────

async function tts(text, wavPath) {
  return new Promise(resolve => {
    const safe = text.replace(/"/g, "'").replace(/\n/g, ' ').trim();
    const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $s.GetInstalledVoices() | Where-Object {$_.Enabled}
$v = $voices | Where-Object {$_.VoiceInfo.Culture -like 'ko*' -and $_.VoiceInfo.Gender -eq [System.Speech.Synthesis.VoiceGender]::Male} | Select-Object -First 1
if (-not $v) { $v = $voices | Where-Object {$_.VoiceInfo.Culture -like 'ko*'} | Select-Object -First 1 }
if (-not $v) { $v = $voices | Where-Object {$_.VoiceInfo.Gender -eq [System.Speech.Synthesis.VoiceGender]::Male} | Select-Object -First 1 }
if ($v) { $s.SelectVoice($v.VoiceInfo.Name); Write-Host "Voice: $($v.VoiceInfo.Name)" } else { Write-Host "Voice: default" }
$s.Rate = 2
$s.SetOutputToWaveFile("${wavPath.replace(/\\/g, '/')}")
$s.Speak("${safe}")
$s.Dispose()`.trim();

    const proc = spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
    let log = '';
    proc.stdout.on('data', d => { log += d; });
    proc.stderr.on('data', d => { log += d; });
    proc.on('close', code => {
      const ok = code === 0 && fs.existsSync(wavPath) && fs.statSync(wavPath).size > 1000;
      console.log(ok ? `  🔊 ${log.trim() || 'TTS OK'}` : '  ⚠️ TTS 실패 — 무음');
      resolve(ok);
    });
  });
}

async function getWavDur(wavPath) {
  return new Promise(resolve => {
    const p = spawn(FFMPEG, ['-i', wavPath, '-f', 'null', '-'], { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) {
        const dur = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        resolve(Math.max(1, dur));
      } else {
        resolve(5);
      }
    });
  });
}

function getBgm() {
  if (!fs.existsSync(BGM_DIR)) return null;
  const f = fs.readdirSync(BGM_DIR).find(n => /\.(mp3|wav|aac|m4a)$/i.test(n));
  return f ? path.join(BGM_DIR, f) : null;
}

async function runFF(args, label) {
  return new Promise((resolve, reject) => {
    if (label) process.stdout.write(`  [${label}] `);
    const p = spawn(FFMPEG, args, { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; if (label) process.stdout.write('.'); });
    p.on('close', code => {
      if (label) console.log('');
      if (code === 0) resolve();
      else { console.error(err.slice(-600)); reject(new Error(`ffmpeg: ${label}`)); }
    });
  });
}

// ── 메인 ─────────────────────────────────────────────────────────

export async function generate(slugArg) {
  const slug = slugArg || process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
  const resolvedSlug = slug || findLatestPost();
  console.log('📹', resolvedSlug);

  const post = parsePost(resolvedSlug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(' / '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp     = path.join(OUT_DIR, `_tmp_${resolvedSlug}`);
  fs.mkdirSync(tmp, { recursive: true });
  const outPath = path.join(OUT_DIR, `${resolvedSlug}.mp4`);

  // ── [지침] Gemini 블로그 이미지 전용 ──
  console.log('\n🎨 슬라이드 배경 이미지 준비 (Gemini Pro 전용)...');
  const postImgDir   = path.join(ROOT, 'content', 'posts', 'trending-picks', resolvedSlug);
  const geminiThumb  = path.join(postImgDir, `${resolvedSlug}-thumb.webp`);
  const geminiImg01  = path.join(postImgDir, `${resolvedSlug}-01.webp`);
  const geminiImg02  = path.join(postImgDir, `${resolvedSlug}-02.webp`);

  const bgIntro = fs.existsSync(geminiThumb) ? (console.log(`  ✅ bg_intro ← ${resolvedSlug}-thumb.webp`), geminiThumb) : (console.log('  ⚠️ bg_intro ← 단색 배경'), null);
  const bgS1    = fs.existsSync(geminiImg01) ? (console.log(`  ✅ bg_s1 ← ${resolvedSlug}-01.webp`), geminiImg01) : (console.log('  ⚠️ bg_s1 ← 단색 배경'), null);
  const bgS2    = fs.existsSync(geminiImg02) ? (console.log(`  ✅ bg_s2 ← ${resolvedSlug}-02.webp`), geminiImg02) : (console.log('  ⚠️ bg_s2 ← 단색 배경'), null);

  // ── Playwright 렌더링 ────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  const segs     = [];
  const segDurs  = [];
  const E        = ['🥇', '🥈', '🥉'];
  const R        = ['1위', '2위', '3위'];
  let   timeline = 0;

  console.log('\n📋 텍스트/음성 싱크 매핑:');

  async function makeSeg(name, bgImg, blocks, narration, minSec) {
    console.log(`\n▶ [${name}] bg: ${bgImg ? path.basename(bgImg) : '단색배경(#0d0d1a)'}`);

    const htmlFile = path.join(tmp, `${name}.html`);
    const pngFile  = path.join(tmp, `${name}.png`);
    fs.writeFileSync(htmlFile, buildHtml(bgImg, blocks), 'utf-8');
    await page.goto(toFileUrl(htmlFile), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await page.screenshot({ path: pngFile });
    console.log('  📸 렌더링 OK');

    const wavFile = path.join(tmp, `${name}.wav`);
    const ttsOk   = await tts(narration, wavFile);

    let dur = minSec;
    if (ttsOk) {
      const wavDur = await getWavDur(wavFile);
      dur = Math.max(minSec, Math.ceil(wavDur) + 1.5);
    }

    const screenTexts = blocks.map(b => b.text.replace(/<br>/g, ' ')).join(' | ');
    console.log(`  ⏱ ${timeline.toFixed(1)}s - ${(timeline + dur).toFixed(1)}s (${dur}s)`);
    console.log(`  📺 화면: ${screenTexts.slice(0, 80)}`);
    console.log(`  🗣 음성: ${narration.slice(0, 80)}`);
    timeline += dur;

    segDurs.push(dur);
    const mp4File = path.join(tmp, `${name}.mp4`);
    // Ken Burns: 임팩트 있는 줌인 (이탈률 개선용 0.0008로 강화)
    const fadeOut = Math.max(0, dur - 0.4).toFixed(1);
    const ZF = `zoompan=z='min(zoom+0.0008,1.12)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOut}:d=0.4`;

    if (ttsOk) {
      const aacFile = path.join(tmp, `${name}.aac`);
      await runFF(['-i', wavFile, '-af', `apad,atrim=duration=${dur}`,
        '-c:a', 'aac', '-b:a', '192k', '-y', aacFile], 'aac');
      await runFF(['-loop', '1', '-t', String(dur), '-i', pngFile,
        '-i', aacFile, '-vf', ZF,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-y', mp4File], 'seg');
    } else {
      await runFF(['-loop', '1', '-t', String(dur), '-i', pngFile,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-vf', ZF,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '192k', '-t', String(dur), '-y', mp4File], 'seg(무음)');
    }
    segs.push(mp4File);
  }

  // ── s0 인트로 제거 (이탈률 데이터: 첫 10초 60% 이탈 → 제품 비교를 0초부터 바로 시작)

  // ── 슬라이드 1: TOP3 — 훅 + 비교 즉시 시작 ─────────────────
  const prodBlocks = [
    { text: '🔥 지금 가장 핫한 TOP3!',   top: 40,  size: 62, color: '#FF4444',
      bg: 'rgba(0,0,0,0.75)' },
    { text: '─────────────────',          top: 115, size: 28, color: 'rgba(255,68,68,0.4)', weight: 'normal' },
  ];

  if (post.products.length === 0) {
    prodBlocks.push({ text: '지금 블로그에서 상세 비교 확인 🔍', top: 800, size: 54, color: '#fff' });
  } else {
    post.products.forEach((p, i) => {
      const baseY    = 150 + i * 540;
      const nameBr   = breakText(p.name, 13);
      const nameFont = dynFont(p.name, 54);
      const nameH    = nameBr.lines * Math.ceil(nameFont * 1.3) + 10;

      prodBlocks.push({ text: `${E[i]} ${R[i]}`,   top: baseY,       size: 56, color: '#FFD700' });
      prodBlocks.push({ text: nameBr.html,          top: baseY + 70,  size: nameFont, color: '#FFFFFF',
        maxH: Math.max(nameH, 130) });
      if (p.price) {
        prodBlocks.push({
          text: p.price.replace(/원/g, '원'),
          top:  baseY + 70 + Math.max(nameH, 130) + 8,
          size: 38, color: '#87CEEB',
        });
      }
    });
  }

  const prodNarr = post.products.length > 0
    ? `잠깐! 이거 모르면 손해야. ` + post.products.map((p, i) => `${R[i]}는 ${p.name}.`).join(' ') + ' 1위는 진짜 인정!'
    : '잠깐! 이거 모르면 손해야. 지금 가장 인기 TOP3 상품들. 블로그에서 자세한 비교 확인해봐.';
  await makeSeg('s1', bgS1, prodBlocks, prodNarr, 7);

  // ── 슬라이드 2: CTA — 4초, 핵심 2개만
  await makeSeg('s2', bgIntro, [
    { text: '👆 설명란 링크 = 쿠팡 최저가!', top: 700, size: 72, color: '#FFD700',
      bg: 'rgba(0,0,0,0.80)' },
    { text: '👍 좋아요 & 🔔 구독',           top: 820, size: 58, color: '#FF6B35',
      bg: 'rgba(0,0,0,0.65)' },
  ],
  '설명란에 쿠팡 최저가 링크 있어. 좋아요 구독 눌러줘!',
  4);

  await browser.close();

  console.log(`\n📊 총 영상 길이: ${timeline.toFixed(1)}s`);

  // ── concat ───────────────────────────────────────────────────
  console.log('\n🔗 합치기...');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));

  const bgmPath = getBgm();
  if (bgmPath) {
    const concatTmp = path.join(tmp, 'concat.mp4');
    await runFF(['-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', concatTmp], 'concat');
    await runFF(['-i', concatTmp, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', '[1:a]volume=0.15[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]',
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-y', outPath], 'bgm');
  } else {
    await runFF(['-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '192k', '-y', outPath], 'concat');
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ ${path.basename(outPath)} (${mb}MB)`);

  if (!NO_PREVIEW) {
    console.log('📽 미리보기 열기...');
    spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref();
  }

  console.log(`\n업로드:\nnode scripts/yt_upload.mjs "${outPath}"`);
  return outPath;
}

// 직접 실행 시
if (process.argv[1].endsWith('yt_make_shorts.mjs')) {
  generate().catch(e => { console.error('❌', e.message); process.exit(1); });
}
