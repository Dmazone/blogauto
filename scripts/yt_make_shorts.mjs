/**
 * yt_make_shorts.mjs v5 — 이탈률 95%→개선 (첫 프레임 즉시 노출)
 *
 * 핵심 변경:
 *   - bodyFadeIn opacity:0 제거 → 첫 프레임부터 콘텐츠 노출
 *   - animation-delay 전면 제거/단축 (0.45s→0s, 0.8s→0s, 1.1s→0s)
 *   - Hook 슬라이드: 제품명 3개 즉시 노출 (FOMO 유발)
 *   - 배경 brightness 0.62 → 0.72 (덜 어두운 이미지)
 *   - 슬라이드 길이 단축: hook 2.2s→1.8s, 제품 3.2s→2.8s, CTA 2.5s→2.2s
 *   - 총 ≈ 12s (v4 17s 대비 단축)
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

  const tableRows = [...md.matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/gm)].slice(0, 3);
  const urls = [...md.matchAll(/https:\/\/www\.coupang\.com[^\s\)\"\'<>\]]+/g)]
    .map(m => m[0].replace(/[)\]\s,;]+$/, ''));

  let products;
  if (tableRows.length >= 1) {
    products = tableRows.map((m, i) => {
      const specsRaw = m[3].replace(/\\\~/g, '~').replace(/\*+/g, '').trim();
      const specs = specsRaw.split(/\s*\/\s*/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 25);
      return {
        name:  m[1].trim(),
        price: m[2].trim().replace(/\\\~/g, '~').replace(/\s*원대?$/, '원'),
        keySpec: specs[0] || '',
        query: coupangQuery(urls[i] || '') || m[1].trim(),
      };
    });
  } else {
    const headings = [...md.matchAll(/###\s*\d+[)\.]\s*(?:\[[^\]]*\]\s*)?\[?([가-힣A-Za-z0-9\s\(\)\-]+?)\]?(?:\s*\([^)]*\))?\s*[\n\r]/gm)].slice(0, 3);
    products = headings.map((m) => ({
      name: m[1].trim().replace(/\s+/g, ' '),
      price: '',
      keySpec: '',
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

// ── 훅 문구 다이나믹 생성 ───────────────────────────────────────────
function makeHookText(title) {
  // 가격대 추출 시도
  const priceMatch = title.match(/(\d+)만\s*원/);
  const priceLabel = priceMatch ? `${priceMatch[1]}만원대` : '';

  // 카테고리 키워드 기반 후크 풀
  const hooks = [
    '지금 핫한 TOP3 한방에 정리!',
    '이거 모르면 진짜 손해봐요 👀',
    `${priceLabel ? priceLabel + ' 중에' : ''} 이게 가성비 끝판왕!`,
    '구매 전에 꼭 보세요 ⚡',
    '2초만 보면 고민 끝!',
  ].filter(h => h.trim());

  // 제목 기반 세미-랜덤 선택 (동일 제목은 항상 동일 훅)
  const seed = [...title].reduce((a, c) => a + c.charCodeAt(0), 0);
  return hooks[seed % hooks.length];
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
        // v4: 1.75 → 1.5 (조금 더 천천히, 청취 편의)
        await runFF(['-i', rawPath, '-filter:a', 'atempo=1.5', '-y', mp3Path], null);
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
  opacity:1
}
.bg{position:absolute;inset:0;z-index:0;overflow:hidden}
.bg img{
  width:110%;height:110%;object-fit:cover;object-position:center;
  filter:brightness(.72) saturate(1.3) contrast(1.05);
  margin:-5%;
  animation:kenBurns var(--kb-dur,5s) ease-out forwards
}
@keyframes kenBurns{
  0%{transform:scale(1) translate(0,0)}
  100%{transform:scale(1.14) translate(-2.5%,-2%)}
}
.vign{position:absolute;inset:0;
  background:radial-gradient(ellipse at center,transparent 15%,rgba(0,0,0,.65) 100%)}
.ov{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(5,0,30,.65) 0%,transparent 28%,transparent 72%,rgba(0,0,20,.80) 100%)}
.stripe{position:absolute;left:0;right:0;height:10px}
.stripe-t{top:0;background:linear-gradient(90deg,#FF0066,#FF6B35,#FFD700,#00DDFF,#FF0066);background-size:200%;animation:stripeMove 3s linear infinite}
.stripe-b{bottom:0;background:linear-gradient(90deg,#00DDFF,#FFD700,#FF6B35,#FF0066,#00DDFF);background-size:200%;animation:stripeMove 3s linear infinite reverse}
@keyframes stripeMove{0%{background-position:0%}100%{background-position:200%}}
.wrap{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 40px}
@keyframes fadeUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes popIn{0%{transform:scale(0.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes slideRight{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes glow2{0%,100%{text-shadow:0 0 25px currentColor,2px 2px 0 #000}50%{text-shadow:0 0 65px currentColor,0 0 110px currentColor,2px 2px 0 #000}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
`;

function bgLayer(bgImg, kbDur = '5s') {
  const url = bgImg ? toFileUrl(bgImg) : null;
  return `<div class="bg" style="--kb-dur:${kbDur}">${url ? `<img src="${url}"/>` : ''}</div>
<div class="vign"></div><div class="ov"></div>
<div class="stripe stripe-t"></div><div class="stripe stripe-b"></div>`;
}

// ── 슬라이드 1: 훅 (v5: 첫 프레임부터 제품명 3개 즉시 노출) ─────────
function hookHtml(bgImg, title, products = []) {
  const topic = title.replace(/TOP\s*\d+[^가-힣]*/i, '').replace(/^[\d년\s]+/, '').trim() || title;

  const shortN = (n = '') => {
    const s = n.replace(/\s*\([^)]+\)/g, '').split(/\s*[\/,]\s*/)[0].trim();
    const words = s.split(/\s+/);
    let out = '';
    for (const w of words) {
      const next = out ? out + ' ' + w : w;
      if ([...next].length <= 10) out = next; else break;
    }
    return out || words[0].slice(0, 10);
  };

  const listItems = products.slice(0, 3).map((p, i) => {
    const EMOJI = ['🥇', '🥈', '🥉'];
    const COLORS = ['#FFD700', '#C8C8C8', '#CD7F32'];
    return `<div style="display:flex;align-items:center;gap:16px;
      background:rgba(0,0,0,.78);border-radius:18px;padding:20px 28px;
      border-left:6px solid ${COLORS[i]};margin-bottom:14px">
      <span style="font-size:52px;flex-shrink:0">${EMOJI[i]}</span>
      <span style="font-size:${shortN(p.name).length > 8 ? 48 : 54}px;font-weight:900;color:#fff;
        word-break:keep-all;text-shadow:2px 2px 8px rgba(0,0,0,.9)">${shortN(p.name)}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
.label{font-size:46px;font-weight:900;color:#FF3333;text-align:center;
  background:rgba(255,51,51,.18);border:2px solid #FF3333;border-radius:12px;
  padding:10px 32px;letter-spacing:2px;text-shadow:0 0 20px #FF333388}
.topic{font-size:62px;font-weight:900;color:#FFD700;text-align:center;margin-top:16px;
  word-break:keep-all;line-height:1.28;padding:0 20px;
  text-shadow:2px 2px 0 #000,0 0 40px #FFD70066}
.list{width:100%;margin-top:28px}
.sub{font-size:44px;color:rgba(255,255,255,.85);text-align:center;margin-top:24px;
  text-shadow:1px 1px 5px rgba(0,0,0,.8)}
</style></head><body>
${bgLayer(bgImg, '4s')}
<div class="wrap">
  <div class="label">🔥 지금 핫한 TOP3</div>
  <div class="topic">${topic}</div>
  <div class="list">${listItems}</div>
  <div class="sub">3위부터 1위까지 바로 알려드림 👇</div>
</div>
</body></html>`;
}

// ── 슬라이드 2~4: 제품 (v4: 핵심 스펙 1개 + 가격 배지 강조 + 진행 표시) ─
function productHtml(bgImg, product, rank, total = 3) {
  const { name, price, keySpec } = product;
  const EMOJI  = ['🥇', '🥈', '🥉'];
  const COLORS = ['#FFD700', '#C8C8C8', '#CD7F32'];
  const color  = COLORS[rank];

  // 제품명 폰트 크기 (v4: 조금 더 크게)
  const nameFs = name.length > 18 ? 62 : name.length > 13 ? 70 : 80;

  // 진행 표시기 (●●○)
  const dots = Array.from({ length: total }, (_, i) =>
    `<span style="color:${i === rank ? '#fff' : 'rgba(255,255,255,.3)'};font-size:36px">${i === rank ? '●' : '●'}</span>`
  ).join('<span style="margin:0 10px"></span>');
  const progressColors = Array.from({ length: total }, (_, i) =>
    i === rank ? '#fff' : 'rgba(255,255,255,.28)'
  );
  const dotsHtml = Array.from({ length: total }, (_, i) =>
    `<span style="color:${progressColors[i]};transition:color .3s">●</span>`
  ).join('<span style="margin:0 12px;opacity:0"> </span>');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
@keyframes rankGlow{0%,100%{text-shadow:0 0 20px ${color}88,2px 2px 0 #000}50%{text-shadow:0 0 55px ${color},0 0 90px ${color}66,2px 2px 0 #000}}
.progress{font-size:40px;letter-spacing:18px;margin-bottom:12px;color:rgba(255,255,255,.55)}
.badge{font-size:140px;line-height:1;text-align:center;animation:popIn .25s ease forwards}
.ranktext{font-size:62px;font-weight:900;color:${color};text-align:center;margin-top:6px;
  animation:rankGlow 2s ease .3s infinite;
  text-shadow:0 0 20px ${color}88,2px 2px 0 #000}
.card{background:rgba(0,0,0,.88);border:4px solid ${color};border-radius:28px;
  padding:36px 48px;margin-top:18px;width:100%;
  animation:slideRight .2s ease forwards;
  box-shadow:0 8px 55px rgba(0,0,0,.8),0 0 0 1px ${color}44}
.name{font-size:${nameFs}px;font-weight:900;color:#fff;word-break:keep-all;
  line-height:1.28;text-shadow:2px 2px 10px rgba(0,0,0,.95)}
.price-badge{display:inline-block;background:linear-gradient(135deg,#FF0066,#FF6B35);
  border-radius:14px;padding:12px 28px;margin-top:18px;
  font-size:62px;font-weight:900;color:#fff;
  box-shadow:0 4px 24px rgba(255,0,102,.5);text-shadow:1px 1px 4px rgba(0,0,0,.5)}
.key-spec{font-size:48px;color:rgba(255,255,255,.92);margin-top:16px;
  line-height:1.35;text-shadow:1px 1px 5px rgba(0,0,0,.8)}
.hint{font-size:42px;color:rgba(255,255,255,.75);margin-top:24px;text-align:center;
  text-shadow:1px 1px 4px rgba(0,0,0,.8)}
</style></head><body>
${bgLayer(bgImg, '5s')}
<div class="wrap">
  <div class="progress">${dotsHtml}</div>
  <div class="badge">${EMOJI[rank]}</div>
  <div class="ranktext">${rank + 1}위 추천</div>
  <div class="card">
    <div class="name">${name}</div>
    ${price ? `<div class="price-badge">💰 ${price}</div>` : ''}
    ${keySpec ? `<div class="key-spec">⚡ ${keySpec}</div>` : ''}
  </div>
  <div class="hint">👆 설명란 쿠팡 최저가 링크</div>
</div>
</body></html>`;
}

// ── 슬라이드 5: CTA (v4: 미니 요약 + 행동 유도 통합) ────────────────
function ctaHtml(bgImg, products) {
  // 1~3위 이름 짧게
  const shortName = n => {
    let s = n.replace(/\s*\([^)]+\)/g, '').split(/\s*[\/,]\s*/)[0].trim();
    const words = s.split(/\s+/);
    let out = '';
    for (const w of words) {
      const next = out ? out + ' ' + w : w;
      if ([...next].length <= 9) out = next; else break;
    }
    return out || words[0].slice(0, 9);
  };

  const summaryItems = products.slice(0, 3).map((p, i) => {
    const EMOJI = ['🥇', '🥈', '🥉'];
    return `<div class="sum-item" style="animation-delay:${0.3 + i * 0.12}s">
      <span class="sum-rank">${EMOJI[i]}</span>
      <span class="sum-name">${shortName(p.name)}</span>
      ${p.price ? `<span class="sum-price">${p.price}</span>` : ''}
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${COMMON_CSS}
@keyframes wiggle{0%,100%{transform:rotate(-2.5deg) scale(1)}50%{transform:rotate(2.5deg) scale(1.04)}}
@keyframes bounceIn{0%{transform:scale(.15);opacity:0}55%{transform:scale(1.15)}80%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
.main{font-size:76px;font-weight:900;color:#FFD700;text-align:center;
  animation:bounceIn .55s ease .1s both;word-break:keep-all;line-height:1.25;
  text-shadow:3px 3px 0 #000,0 0 55px #FFD70066}
.summary{width:100%;margin-top:28px;animation:fadeUp .4s ease .35s both}
.sum-item{display:flex;align-items:center;gap:18px;
  background:rgba(0,0,0,.72);border-radius:18px;padding:18px 28px;
  margin-top:12px;border:1.5px solid rgba(255,255,255,.12);
  animation:slideRight .4s ease both}
.sum-rank{font-size:48px;flex-shrink:0}
.sum-name{font-size:44px;font-weight:900;color:#fff;flex:1;word-break:keep-all;
  text-shadow:1px 1px 5px rgba(0,0,0,.9)}
.sum-price{font-size:38px;color:#87CEEB;font-weight:bold;flex-shrink:0}
.gap{height:36px}
.btn{background:linear-gradient(135deg,#FF0066,#FF6B35);border-radius:999px;
  padding:30px 68px;font-size:58px;font-weight:900;color:#fff;
  animation:bounceIn .55s ease .7s both,wiggle .5s ease 1.5s infinite;
  box-shadow:0 10px 50px rgba(255,0,102,.55);text-shadow:2px 2px 6px rgba(0,0,0,.4)}
.like{font-size:44px;color:rgba(255,255,255,.85);margin-top:40px;text-align:center;
  animation:bounceIn .55s ease 1.1s both}
</style></head><body>
${bgLayer(bgImg, '3.5s')}
<div class="wrap">
  <div class="main">👆 쿠팡 최저가<br>설명란 링크 클릭!</div>
  <div class="summary">${summaryItems}</div>
  <div class="gap"></div>
  <div class="btn">지금 바로 확인 🛒</div>
  <div class="like">👍 좋아요  🔔 구독  💬 댓글</div>
</div>
</body></html>`;
}

// ── 슬라이드 → MP4 (Playwright recordVideo + 앞부분 트림) ───────────
const TRIM_START = 0.9; // 녹화 시작 후 로드/폰트 준비 대기 구간 제거

async function slideToMp4(browser, { name, html, mp3Path, minDur }, tmp) {
  const audioDur = (mp3Path && fs.existsSync(mp3Path)) ? await getAudioDur(mp3Path) : 0;
  const dur = Math.max(minDur, audioDur + 0.5);
  const recordDur = dur + TRIM_START; // 앞부분 포함해서 더 오래 녹화

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
  // 이미지 디코드 완료 대기 (배경 이미지가 첫 프레임에 보이도록)
  await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map(i => i.decode ? i.decode().catch(() => {}) : Promise.resolve()));
  });
  // 렌더 사이클 강제 실행 후 본 대기
  await page.waitForTimeout(Math.ceil(recordDur * 1000));
  await context.close();

  const rawWebm = await page.video().path();
  // 앞부분 TRIM_START초 제거 → 완전히 렌더링된 첫 프레임으로 시작 (재인코딩으로 정확한 seek)
  const trimWebm = path.join(tmp, `${name}_trim.mp4`);
  await runFF([
    '-i', rawWebm, '-ss', String(TRIM_START),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-an', '-y', trimWebm
  ], null);
  try { fs.unlinkSync(rawWebm); } catch {}

  const mp4Path  = path.join(tmp, `${name}.mp4`);

  if (mp3Path && fs.existsSync(mp3Path) && audioDur > 0) {
    const aacPath = path.join(tmp, `${name}.aac`);
    await runFF([
      '-i', mp3Path,
      '-af', `afade=t=out:st=${Math.max(0, audioDur - 0.3)}:d=0.3,apad,atrim=duration=${dur}`,
      '-c:a', 'aac', '-b:a', '192k', '-y', aacPath
    ], null);
    await runFF([
      '-i', trimWebm, '-i', aacPath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-c:a', 'copy',
      '-t', String(dur), '-y', mp4Path
    ], null);
  } else {
    await runFF([
      '-i', trimWebm,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(dur), '-y', mp4Path
    ], null);
  }

  try { fs.unlinkSync(trimWebm); } catch {}
  return { mp4Path, dur };
}

// ── xfade concat (슬라이드 간 0.35s 크로스페이드) ──────────────────
async function concatWithXfade(mp4s, durations, outPath, tmp) {
  if (mp4s.length === 1) {
    await runFF(['-i', mp4s[0], '-c', 'copy', '-y', outPath], 'copy');
    return;
  }

  const FADE = 0.35;
  let filterV = '';
  let filterA = '';
  const inputs = mp4s.flatMap(p => ['-i', p]);

  const offsets = [];
  let acc = 0;
  for (let i = 0; i < mp4s.length - 1; i++) {
    acc += durations[i] - FADE;
    offsets.push(acc);
  }

  let lastV = `[0:v]`;
  for (let i = 0; i < mp4s.length - 1; i++) {
    const outLabel = i === mp4s.length - 2 ? `[vout]` : `[v${i}]`;
    filterV += `${lastV}[${i+1}:v]xfade=transition=fade:duration=${FADE}:offset=${offsets[i].toFixed(3)}${outLabel};`;
    lastV = outLabel;
  }

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
  console.log('📹 v4', resolvedSlug);

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
    // "139,000원 ~ 159,000원" 형태 처리
    const stripped = p.replace(/원/g, '').replace(/\s+/g, ' ').trim();
    const m = stripped.match(/(\d[\d,]*)\s*~\s*(\d[\d,]*)/);
    if (m) {
      const lo = parseInt(m[1].replace(/,/g, ''));
      const hi = parseInt(m[2].replace(/,/g, ''));
      const toMan = n => n >= 10000 ? `${Math.round(n / 10000)}만` : `${n}`;
      return `${toMan(lo)}~${toMan(hi)}원`;
    }
    const single = parseInt(stripped.replace(/,/g, '').replace(/[^0-9]/g, ''));
    if (!isNaN(single) && single >= 10000) return `${Math.round(single / 10000)}만원`;
    return p.replace(/\s*원대?$/, '원');
  };

  // v4 내레이션: 극도로 짧게 (슬라이드당 2~3s 목표)
  const hookText = makeHookText(title);
  const narrs = [
    { name: 'hook', text: `TOP3 바로 알려드릴게요!` },
    ...(P[0] ? [{ name:'p0', text:`1위, ${shortName(P[0].name)}! ${P[0].price ? shortPrice(P[0].price) + '.' : ''}` }] : []),
    ...(P[1] ? [{ name:'p1', text:`2위, ${shortName(P[1].name)}! ${P[1].price ? shortPrice(P[1].price) + '.' : ''}` }] : []),
    ...(P[2] ? [{ name:'p2', text:`3위, ${shortName(P[2].name)}! ${P[2].price ? shortPrice(P[2].price) + '.' : ''}` }] : []),
    { name: 'cta',  text: `설명란 링크에서 최저가 확인! 좋아요 구독!` },
  ];

  const mp3Map = {};
  for (const { name, text } of narrs) {
    const mp3Path = path.join(tmp, `${name}.mp3`);
    const ok = await ttsEdge(text, mp3Path);
    if (ok) mp3Map[name] = mp3Path;
    console.log(`  ${name}: ${ok ? '✅' : '⚠️'} "${text.slice(0, 45)}"`);
  }

  // ── 배경 이미지 할당 ─────────────────────────────────────────────
  console.log('\n🎨 배경:', Object.entries(bg).map(([k,v]) => `${k}:${v?'✅':'⬜'}`).join(' '));

  // ── 슬라이드 정의 (v5: 첫 프레임 즉시 노출, 타이밍 단축) ───────────
  const slides = [
    { name:'hook', html: hookHtml(bg.thumb, title, P),              mp3Path: mp3Map.hook, minDur: 1.8 },
    ...(P[0] ? [{ name:'p0', html: productHtml(bg.img01, P[0], 0), mp3Path: mp3Map.p0,   minDur: 2.8 }] : []),
    ...(P[1] ? [{ name:'p1', html: productHtml(bg.img02, P[1], 1), mp3Path: mp3Map.p1,   minDur: 2.8 }] : []),
    ...(P[2] ? [{ name:'p2', html: productHtml(bg.thumb, P[2], 2), mp3Path: mp3Map.p2,   minDur: 2.8 }] : []),
    { name:'cta',  html: ctaHtml(bg.img01 || bg.thumb, P),          mp3Path: mp3Map.cta,  minDur: 2.2 },
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
