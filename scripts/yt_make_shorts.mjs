/**
 * yt_make_shorts.mjs v3 — 고품질 상품 Shorts
 *
 * 슬라이드: hook(3s) → 1위(5s) → 2위(5s) → 3위(5s) → 비교표(4s) → CTA(3s) ≈ 25s
 * - 각 슬라이드 CSS fade-in/out 전환
 * - 배경 Ken Burns 줌 효과
 * - 제품 슬라이드에 특징 불릿 3개
 * - 비교표 슬라이드 추가
 * - crf 17 고품질 인코딩
 */
import { chromium } from 'playwright';
import pkg from 'msedge-tts';
const { MsEdgeTTS, OUTPUT_FORMAT } = pkg;
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.join(__dirname, '..');
const FFMPEG  = 'C:\\Users\\Paydma\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';
const OUT_DIR = path.join(ROOT, 'data', '1_youtube-shorts');
const BGM_DIR = path.join(OUT_DIR, 'bgm');
const FONT_URL = 'file:///C:/Windows/Fonts/malgunbd.ttf';
const TTS_VOICE = 'ko-KR-InJoonNeural';
const NO_PREVIEW = process.argv.includes('--no-preview');

function toFileUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

function getBgm() {
  if (!fs.existsSync(BGM_DIR)) return null;
  const f = fs.readdirSync(BGM_DIR).find(n => /\.(mp3|wav|aac|m4a)$/i.test(n));
  return f ? path.join(BGM_DIR, f) : null;
}

function findLatestPost() {
  const dir = path.join(ROOT, 'content', 'posts', 'trending-picks');
  return fs.readdirSync(dir)
    .filter(d => d !== '_index.md' && fs.statSync(path.join(dir, d)).isDirectory())
    .sort().reverse()[0];
}

function coupangQuery(url) {
  try { return decodeURIComponent(new URL(url).searchParams.get('q') || '').trim(); }
  catch { return ''; }
}

function parsePost(slug) {
  const md = fs.readFileSync(
    path.join(ROOT, 'content', 'posts', 'trending-picks', slug, 'index.md'), 'utf-8'
  );
  const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || slug;

  // 테이블: | **상품명** | 가격 | 스펙1 / 스펙2 / 스펙3 |
  const tableRows = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/gm)].slice(0, 3);
  const urls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''));

  let products;
  if (tableRows.length >= 1) {
    products = tableRows.map((m, i) => {
      const specsRaw = m[3].replace(/\\\~/g, '~').replace(/\*+/g, '').trim();
      const specs = specsRaw.split(/\s*\/\s*/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 25).slice(0, 3);
      return {
        name:  m[1].trim(),
        price: m[2].trim().replace(/\\\~/g, '~').replace(/\s*원대?$/, '원'),
        specs,
        query: coupangQuery(urls[i] || '') || m[1].trim(),
      };
    });
  } else {
    const headings = [...md.matchAll(/###\s*\d+[)\.]\s*(?:\[[^\]]*\]\s*)?\[?([가-힣A-Za-z0-9\s\(\)\-]+?)\]?(?:\s*\([^)]*\))?\s*[\n\r]/gm)].slice(0, 3);
    products = headings.map((m) => ({
      name: m[1].trim().replace(/\s+/g, ' '),
      price: '',
      specs: [],
      query: m[1].trim(),
    }));
  }

  const imgDir = path.join(ROOT, 'content', 'posts', 'trending-picks', slug);
  const img = n => { const p = path.join(imgDir, n); return fs.existsSync(p) ? p : null; };
  return {
    title, products,
    bg: {
      thumb: img(`${slug}-thumb.webp`),
      img01: img(`${slug}-01.webp`),
      img02: img(`${slug}-02.webp`),
    },
  };
}

// ── Edge TTS ──────────────────────────────────────────────────────
async function ttsEdge(text, mp3Path) {
  const rawPath = mp3Path.replace(/\.mp3$/, '_raw.mp3');
  return new Promise(async resolve => {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const ws = fs.createWriteStream(rawPath);
      audioStream.pipe(ws);
      ws.on('finish', async () => {
        if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size < 500) {
          return resolve(false);
        }
        await runFF(['-i', rawPath, '-filter:a', 'atempo=1.75', '-y', mp3Path], null);
        try { fs.unlinkSync(rawPath); } catch {}
        resolve(true);
      });
      ws.on('error', () => resolve(false));
      audioStream.on('error', () => resolve(false));
    } catch { resolve(false); }
  });
}

async function getAudioDur(filePath) {
  return new Promise(resolve => {
    const p = spawn(FFMPEG, ['-i', filePath, '-f', 'null', '-'], { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? +m[1]*3600 + +m[2]*60 + parseFloat(m[3]) : 3);
    });
  });
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
      else { console.error(err.slice(-300)); reject(new Error(`ffmpeg ${label}`)); }
    });
  });
}

// ── 공통 CSS ─────────────────────────────────────────────────────
const COMMON_CSS = `
@font-face{font-family:'K';src:url('${FONT_URL}') format('truetype');font-weight:bold}
*{margin:0;padding:0;box-sizing:border-box}
body{
  width:1080px;height:1920px;overflow:hidden;
  background:#06040f;font-family:'K',sans-serif;position:relative;
  animation:bodyFadeIn 0.35s ease forwards
}
@keyframes bodyFadeIn{from{opacity:0}to{opacity:1}}
.bg{position:absolute;inset:0;z-index:0;overflow:hidden}
.bg img{
  width:110%;height:110%;object-fit:cover;object-position:center;
  filter:brightness(.68) saturate(1.35) contrast(1.08);
  margin:-5%;
  animation:kenBurns var(--kb-dur,6s) ease-out forwards
}
@keyframes kenBurns{
  0%{transform:scale(1) translate(0,0)}
  100%{transform:scale(1.12) translate(-2%,-1.5%)}
}
.vign{position:absolute;inset:0;
  background:radial-gradient(ellipse at center,transparent 15%,rgba(0,0,0,.72) 100%)}
.ov{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(5,0,30,.7) 0%,transparent 25%,transparent 75%,rgba(0,0,20,.8) 100%)}
.stripe{position:absolute;left:0;right:0;height:7px}
.stripe-t{top:0;background:linear-gradient(90deg,#FF0066,#FF6B35,#FFD700,#00DDFF,#FF0066);background-size:200%}
.stripe-b{bottom:0;background:linear-gradient(90deg,#00DDFF,#FFD700,#FF6B35,#FF0066,#00DDFF);background-size:200%}
.wrap{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 40px}
@keyframes fadeUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes popIn{0%{transform:scale(0) rotate(-30deg);opacity:0}65%{transform:scale(1.18) rotate(3deg)}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes slideRight{from{transform:translateX(-140px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes glow2{0%,100%{text-shadow:0 0 25px currentColor,2px 2px 0 #000}50%{text-shadow:0 0 70px currentColor,0 0 120px currentColor,2px 2px 0 #000}}
`;

function bgLayer(bgImg, kbDur = '6s') {
  const url = bgImg ? toFileUrl(bgImg) : null;
  return `<div class="bg" style="--kb-dur:${kbDur}">${url ? `<img src="${url}"/>` : ''}</div>
<div class="vign"></div><div class="ov"></div>
<div class="stripe stripe-t"></div><div class="stripe stripe-b"></div>`;
}

// ── 슬라이드 1: 훅 ────────────────────────────────────────────────
function hookHtml(bgImg, title) {
  const topic = title.replace(/TOP\s*\d+[^가-힣]*/i, '').replace(/^[\d년\s]+/, '').trim() || title;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
.fire{font-size:160px;line-height:1;animation:popIn .65s cubic-bezier(.175,.885,.32,1.275) forwards}
.hook{font-size:102px;font-weight:900;color:#FF3333;margin-top:12px;text-align:center;
  animation:fadeUp .5s ease .5s both,glow2 2s ease 1.1s infinite;color:#FF3333;
  word-break:keep-all;padding:0 20px;line-height:1.2}
.topic{font-size:60px;color:#FFD700;margin-top:24px;text-align:center;
  animation:fadeUp .5s ease .85s both;word-break:keep-all;line-height:1.35;padding:0 40px;
  text-shadow:2px 2px 12px rgba(0,0,0,.95)}
.sub{font-size:48px;color:rgba(255,255,255,.88);margin-top:36px;text-align:center;
  animation:fadeUp .5s ease 1.2s both;text-shadow:1px 1px 6px rgba(0,0,0,.8)}
</style></head><body>
${bgLayer(bgImg, '3.5s')}
<div class="wrap">
  <div class="fire">🔥</div>
  <div class="hook">모르면 손해!</div>
  <div class="topic">${topic}</div>
  <div class="sub">지금 TOP3 다 알려드릴게요 👇</div>
</div>
</body></html>`;
}

// ── 슬라이드 2~4: 제품 ───────────────────────────────────────────
function productHtml(bgImg, product, rank) {
  const { name, price, specs } = product;
  const EMOJI  = ['🥇', '🥈', '🥉'];
  const COLORS = ['#FFD700', '#C8C8C8', '#CD7F32'];
  const color  = COLORS[rank];
  const nameFs = name.length > 18 ? 55 : name.length > 13 ? 62 : 70;

  const specItems = specs.length > 0
    ? specs.map(s => `<div class="spec-item">✅ ${s}</div>`).join('')
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
@keyframes rankGlow{0%,100%{text-shadow:0 0 20px ${color}88,2px 2px 0 #000}50%{text-shadow:0 0 60px ${color},0 0 100px ${color}66,2px 2px 0 #000}}
.badge{font-size:140px;line-height:1;text-align:center;animation:popIn .65s cubic-bezier(.175,.885,.32,1.275) forwards}
.ranktext{font-size:60px;font-weight:900;color:${color};text-align:center;margin-top:6px;
  animation:fadeUp .4s ease .55s both,rankGlow 2s ease 1s infinite;
  text-shadow:0 0 20px ${color}88,2px 2px 0 #000}
.card{background:rgba(0,0,0,.82);border:2.5px solid ${color}88;border-radius:28px;
  padding:36px 48px;margin-top:22px;width:100%;
  animation:slideRight .55s ease .7s both;
  box-shadow:0 8px 50px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.07)}
.name{font-size:${nameFs}px;font-weight:900;color:#fff;word-break:keep-all;
  line-height:1.3;text-shadow:2px 2px 10px rgba(0,0,0,.95)}
.price{font-size:50px;color:#87CEEB;font-weight:bold;margin-top:14px;
  animation:fadeUp .4s ease 1.1s both}
.specs{margin-top:16px;animation:fadeUp .4s ease 1.3s both}
.spec-item{font-size:40px;color:rgba(255,255,255,.9);margin-top:10px;line-height:1.3;
  text-shadow:1px 1px 5px rgba(0,0,0,.8)}
.hint{font-size:38px;color:rgba(255,255,255,.68);margin-top:28px;text-align:center;
  animation:fadeUp .4s ease 1.5s both}
</style></head><body>
${bgLayer(bgImg, '5.5s')}
<div class="wrap">
  <div class="badge">${EMOJI[rank]}</div>
  <div class="ranktext">${rank + 1}위</div>
  <div class="card">
    <div class="name">${name}</div>
    ${price ? `<div class="price">💰 ${price}</div>` : ''}
    ${specItems ? `<div class="specs">${specItems}</div>` : ''}
  </div>
  <div class="hint">👆 설명란 쿠팡 최저가 링크</div>
</div>
</body></html>`;
}

// ── 슬라이드 5: 비교표 ───────────────────────────────────────────
function compareHtml(bgImg, products) {
  const RANK_COLOR = ['#FFD700', '#C8C8C8', '#CD7F32'];
  const RANK_LABEL = ['🥇 1위', '🥈 2위', '🥉 3위'];
  const cols = products.map((p, i) => {
    const shortName = p.name.length > 10 ? p.name.slice(0, 10) + '..' : p.name;
    const spec = p.specs[0] || '';
    return `
<div class="col" style="--rc:${RANK_COLOR[i]}">
  <div class="rank-lbl">${RANK_LABEL[i]}</div>
  <div class="pname">${shortName}</div>
  ${p.price ? `<div class="pprice">${p.price}</div>` : ''}
  ${spec ? `<div class="pspec">${spec}</div>` : ''}
</div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
.title{font-size:72px;font-weight:900;color:#FFD700;text-align:center;
  animation:fadeUp .5s ease .2s both;text-shadow:2px 2px 12px rgba(0,0,0,.95);
  word-break:keep-all;line-height:1.2;padding:0 20px}
.grid{display:flex;gap:24px;width:100%;margin-top:36px;animation:fadeUp .5s ease .5s both}
.col{flex:1;background:rgba(0,0,0,.80);border:2.5px solid var(--rc);border-radius:22px;
  padding:28px 18px;text-align:center;
  box-shadow:0 6px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06)}
.rank-lbl{font-size:40px;font-weight:900;color:var(--rc);margin-bottom:10px}
.pname{font-size:34px;color:#fff;font-weight:bold;line-height:1.3;word-break:keep-all;
  text-shadow:1px 1px 5px rgba(0,0,0,.9)}
.pprice{font-size:30px;color:#87CEEB;margin-top:8px;font-weight:bold}
.pspec{font-size:28px;color:rgba(255,255,255,.75);margin-top:6px;line-height:1.2}
.cta-line{font-size:50px;color:#FF3333;margin-top:44px;font-weight:900;text-align:center;
  animation:fadeUp .5s ease .85s both;word-break:keep-all;
  text-shadow:0 0 30px #FF333366,2px 2px 0 #000}
</style></head><body>
${bgLayer(bgImg, '4.5s')}
<div class="wrap">
  <div class="title">한눈에 비교!</div>
  <div class="grid">${cols}</div>
  <div class="cta-line">어떤 게 내 상황에 맞을까? 👇</div>
</div>
</body></html>`;
}

// ── 슬라이드 6: CTA ───────────────────────────────────────────────
function ctaHtml(bgImg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
@keyframes wiggle{0%,100%{transform:rotate(-3deg) scale(1)}50%{transform:rotate(3deg) scale(1.04)}}
@keyframes bounceIn{0%{transform:scale(.15);opacity:0}55%{transform:scale(1.18)}80%{transform:scale(.94)}100%{transform:scale(1);opacity:1}}
.arrow{font-size:145px;line-height:1;animation:bounceIn .6s ease forwards}
.main{font-size:84px;font-weight:900;color:#FFD700;text-align:center;margin-top:18px;
  animation:bounceIn .6s ease .3s both;word-break:keep-all;line-height:1.25;
  text-shadow:3px 3px 0 #000,0 0 60px #FFD70066}
.gap{height:40px}
.btn{background:linear-gradient(135deg,#FF0066,#FF6B35);border-radius:999px;
  padding:32px 72px;font-size:60px;font-weight:900;color:#fff;
  animation:bounceIn .6s ease .65s both,wiggle .5s ease 1.55s infinite;
  box-shadow:0 10px 50px rgba(255,0,102,.55);text-shadow:2px 2px 6px rgba(0,0,0,.4)}
.like{font-size:46px;color:rgba(255,255,255,.85);margin-top:44px;text-align:center;
  animation:bounceIn .6s ease 1.05s both}
</style></head><body>
${bgLayer(bgImg, '3.5s')}
<div class="wrap">
  <div class="arrow">👆</div>
  <div class="main">설명란 링크<br>= 쿠팡 최저가!</div>
  <div class="gap"></div>
  <div class="btn">지금 바로 확인 🛒</div>
  <div class="like">👍 좋아요  🔔 구독  💬 댓글</div>
</div>
</body></html>`;
}

// ── 슬라이드 → MP4 (Playwright recordVideo) ───────────────────────
async function slideToMp4(browser, { name, html, mp3Path, minDur }, tmp) {
  const audioDur = (mp3Path && fs.existsSync(mp3Path)) ? await getAudioDur(mp3Path) : 0;
  const dur = Math.max(minDur, audioDur + 0.6);

  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: tmp, size: { width: 1080, height: 1920 } },
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const htmlFile = path.join(tmp, `${name}.html`);
  fs.writeFileSync(htmlFile, html, 'utf-8');
  await page.goto(toFileUrl(htmlFile), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Math.ceil(dur * 1000));
  await context.close();

  const webmPath = await page.video().path();
  const mp4Path  = path.join(tmp, `${name}.mp4`);

  if (mp3Path && fs.existsSync(mp3Path) && audioDur > 0) {
    const aacPath = path.join(tmp, `${name}.aac`);
    await runFF([
      '-i', mp3Path,
      '-af', `afade=t=out:st=${Math.max(0, audioDur - 0.3)}:d=0.3,apad,atrim=duration=${dur}`,
      '-c:a', 'aac', '-b:a', '192k', '-y', aacPath
    ], null);
    await runFF([
      '-i', webmPath, '-i', aacPath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-c:a', 'copy',
      '-t', String(dur), '-y', mp4Path
    ], null);
  } else {
    await runFF([
      '-i', webmPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(dur), '-y', mp4Path
    ], null);
  }

  try { fs.unlinkSync(webmPath); } catch {}
  return { mp4Path, dur };
}

// ── xfade concat (슬라이드 간 0.4s 크로스페이드) ─────────────────
async function concatWithXfade(mp4s, durations, outPath, tmp) {
  if (mp4s.length === 1) {
    await runFF(['-i', mp4s[0], '-c', 'copy', '-y', outPath], 'copy');
    return;
  }

  const FADE = 0.4;
  // 각 슬라이드의 오디오를 concat용으로 변환 후 xfade 체인
  // 비디오: xfade 필터 체인
  let filterV = '';
  let filterA = '';
  const inputs = mp4s.flatMap(p => ['-i', p]);

  // 오프셋 계산
  const offsets = [];
  let acc = 0;
  for (let i = 0; i < mp4s.length - 1; i++) {
    acc += durations[i] - FADE;
    offsets.push(acc);
  }

  // 비디오 xfade 체인
  let lastV = `[0:v]`;
  for (let i = 0; i < mp4s.length - 1; i++) {
    const outLabel = i === mp4s.length - 2 ? `[vout]` : `[v${i}]`;
    filterV += `${lastV}[${i+1}:v]xfade=transition=fade:duration=${FADE}:offset=${offsets[i].toFixed(3)}${outLabel};`;
    lastV = outLabel;
  }

  // 오디오 acrossfade 체인
  let lastA = `[0:a]`;
  for (let i = 0; i < mp4s.length - 1; i++) {
    const outLabel = i === mp4s.length - 2 ? `[aout]` : `[a${i}]`;
    filterA += `${lastA}[${i+1}:a]acrossfade=d=${FADE}${outLabel};`;
    lastA = outLabel;
  }

  const filterStr = (filterV + filterA).replace(/;$/, '');

  await runFF([
    ...inputs,
    '-filter_complex', filterStr,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', '-y', outPath
  ], 'xfade');
}

// ── 메인 ─────────────────────────────────────────────────────────
export async function generate(slugArg) {
  const slug = slugArg
    || process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
  const resolvedSlug = slug || findLatestPost();
  console.log('📹 v3', resolvedSlug);

  const post = parsePost(resolvedSlug);
  console.log('제목:', post.title);
  console.log('상품:', post.products.map(p => p.name).join(' / '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp     = path.join(OUT_DIR, `_tmp_${resolvedSlug}`);
  fs.mkdirSync(tmp, { recursive: true });
  const outPath = path.join(OUT_DIR, `${resolvedSlug}.mp4`);

  const { bg, products: P, title } = post;

  // ── TTS ─────────────────────────────────────────────────────────
  console.log('\n🔊 TTS 생성 중...');
  const shortName = n => {
    let s = n.replace(/\s*\([^)]+\)/g, '').split(/\s*[\/,]\s*/)[0].trim();
    const words = s.split(/\s+/);
    let out = '';
    for (const w of words) {
      const next = out ? out + ' ' + w : w;
      if ([...next].length <= 8) out = next; else break;
    }
    return out || words[0].slice(0, 8);
  };
  const shortPrice = p => {
    const m = p.match(/(\d[\d,]*)\s*만?\s*~\s*([\d,]+)/);
    if (m) return `${m[1].replace(/,/g,'')}~${m[2].replace(/,/g,'')}만원`;
    return p.replace(/\s*원대?$/, '원');
  };

  const narrs = [
    { name: 'hook', text: `TOP3 지금 바로 알려드릴게요!` },
    ...(P[0] ? [{ name:'p0', text:`1위 ${shortName(P[0].name)}! ${P[0].price ? shortPrice(P[0].price)+', ' : ''}가성비 최고 추천!` }] : []),
    ...(P[1] ? [{ name:'p1', text:`2위 ${shortName(P[1].name)}! ${P[1].price ? shortPrice(P[1].price)+', ' : ''}가격 대비 성능 최고!` }] : []),
    ...(P[2] ? [{ name:'p2', text:`3위 ${shortName(P[2].name)}! ${P[2].price ? shortPrice(P[2].price)+', ' : ''}이 가격엔 이게 최선!` }] : []),
    { name: 'cmp',  text: `세 제품 특징이 다 달라요. 내 상황에 맞는 거 고르세요!` },
    { name: 'cta',  text: `설명란 링크로 쿠팡 최저가 바로 확인! 좋아요 구독 부탁드려요!` },
  ];

  const mp3Map = {};
  for (const { name, text } of narrs) {
    const mp3Path = path.join(tmp, `${name}.mp3`);
    const ok = await ttsEdge(text, mp3Path);
    if (ok) mp3Map[name] = mp3Path;
    console.log(`  ${name}: ${ok ? '✅' : '⚠️'} "${text.slice(0, 40)}"`);
  }

  // ── 배경 이미지 할당 ─────────────────────────────────────────────
  console.log('\n🎨 배경:', Object.entries(bg).map(([k,v]) => `${k}:${v?'✅':'⬜'}`).join(' '));

  // ── 슬라이드 정의 ────────────────────────────────────────────────
  const slides = [
    { name:'hook', html: hookHtml(bg.thumb,         title),       mp3Path: mp3Map.hook, minDur: 2.8 },
    ...(P[0] ? [{ name:'p0', html: productHtml(bg.img01,  P[0], 0), mp3Path: mp3Map.p0,   minDur: 3.5 }] : []),
    ...(P[1] ? [{ name:'p1', html: productHtml(bg.img02,  P[1], 1), mp3Path: mp3Map.p1,   minDur: 3.5 }] : []),
    ...(P[2] ? [{ name:'p2', html: productHtml(bg.thumb,  P[2], 2), mp3Path: mp3Map.p2,   minDur: 3.5 }] : []),
    { name:'cmp',  html: compareHtml(bg.img01 || bg.thumb, P),      mp3Path: mp3Map.cmp,  minDur: 3.2 },
    { name:'cta',  html: ctaHtml(bg.img02 || bg.thumb),             mp3Path: mp3Map.cta,  minDur: 2.5 },
  ];

  // ── 녹화 ────────────────────────────────────────────────────────
  console.log('\n🎬 녹화 중 (Playwright)...');
  const browser = await chromium.launch({ headless: true });
  const mp4s = [], durations = [];
  let totalDur = 0;
  for (const slide of slides) {
    process.stdout.write(`  ▶ [${slide.name}] `);
    const { mp4Path, dur } = await slideToMp4(browser, slide, tmp);
    mp4s.push(mp4Path);
    durations.push(dur);
    totalDur += dur;
    console.log(`${dur.toFixed(1)}s`);
  }
  await browser.close();
  console.log(`\n📊 총 길이: ${totalDur.toFixed(1)}s`);

  // ── xfade concat ────────────────────────────────────────────────
  console.log('\n🔗 xfade 합치기...');
  const concatTmp = path.join(tmp, 'concat.mp4');
  await concatWithXfade(mp4s, durations, concatTmp, tmp);

  // ── BGM 믹싱 ────────────────────────────────────────────────────
  const bgmPath = getBgm();
  if (bgmPath) {
    console.log('🎵 BGM 믹싱...');
    await runFF([
      '-i', concatTmp, '-stream_loop', '-1', '-i', bgmPath,
      '-filter_complex', '[1:a]volume=0.10[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]',
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-y', outPath
    ], 'bgm');
  } else {
    await runFF(['-i', concatTmp, '-c', 'copy', '-movflags', '+faststart', '-y', outPath], 'faststart');
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ ${path.basename(outPath)} (${mb}MB)`);

  if (!NO_PREVIEW) {
    spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref();
  }

  console.log(`\n업로드:\nnode scripts/yt_upload.mjs "${outPath}"`);
  return outPath;
}

if (process.argv[1].endsWith('yt_make_shorts.mjs')) {
  generate().catch(e => { console.error('❌', e.message); process.exit(1); });
}
