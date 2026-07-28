/**
 * 소스 없는 오래된 public HTML에 Tenping 광고 직접 삽입
 * - H2 있는 경우: 이미지 없는 H2 섹션 중간에 삽입
 * - H2 없는 경우: </p> 기준 1/3, 2/3 지점에 삽입
 */
import fs from 'fs';
import path from 'path';

const AD1 = '<div class="ad-unit ad-tenping" style="margin:28px auto;max-width:768px;text-align:center;"><tenping class="adsbytenping" style="width:100%;max-width:768px;margin:0px auto;display:block;" tenping-ad-display-type="1LawCE8FqKOhetXZhMopsQ%3d%3d" tenping-ad-client="BdnhcMfPBvtcqWy4TeF3452t47SWFwraO4StFWXx1U%2fSBFm9k9OQo1uJHpkxwqxi"></tenping></div>';
const AD2 = '<div class="ad-unit ad-tenping" style="margin:28px auto;max-width:768px;text-align:center;"><tenping class="adsbytenping" style="width:100%;max-width:768px;margin:0px auto;display:block;" tenping-ad-display-type="UD8Mia8gyIoT5Z2MT6VB3Q%3d%3d" tenping-ad-client="BdnhcMfPBvtcqWy4TeF3452t47SWFwraO4StFWXx1U%2fSBFm9k9OQo1uJHpkxwqxi"></tenping></div>';

const TARGET_FILES = [
  'public/posts/entertainment/entertainment-1779346062810/index.html',
  'public/posts/health/health-1779346374831/index.html',
  'public/posts/humanities/humanities-1779345750738/index.html',
  'public/posts/it-devices/it-devices-1779346652786/index.html',
  'public/posts/latest-tech/latest-tech-1779345179667/index.html',
  'public/posts/society/society-1779345463486/index.html',
];

function insertAdsIntoContent(content) {
  const h2parts = content.split('<h2');

  if (h2parts.length > 1) {
    // H2 섹션 기반 삽입
    let adIdx = 0;
    let result = h2parts[0];
    for (let i = 1; i < h2parts.length; i++) {
      const part = h2parts[i];
      const hasImg = part.includes('<img');
      if (!hasImg && adIdx < 2) {
        const ad = adIdx === 0 ? AD1 : AD2;
        const pparts = part.split('</p>');
        const total = pparts.length;
        const mid = Math.max(0, total - 2);
        let sec = '';
        for (let j = 0; j < pparts.length; j++) {
          sec += pparts[j];
          if (j < total - 1) sec += '</p>';
          if (j === mid && j < total - 1) sec += ad;
        }
        if (total < 2) sec += ad;
        result += '<h2' + sec;
        adIdx++;
      } else {
        result += '<h2' + part;
      }
    }
    return result;
  } else {
    // H2 없는 경우: </p> 기준 1/3, 2/3 지점
    const pparts = content.split('</p>');
    const total = pparts.length;
    const p1 = Math.floor(total / 3);
    const p2 = Math.floor(2 * total / 3);
    let result = '';
    for (let j = 0; j < pparts.length; j++) {
      result += pparts[j];
      if (j < total - 1) result += '</p>';
      if (j === p1 && j < total - 1) result += AD1;
      if (j === p2 && j < total - 1 && p2 !== p1) result += AD2;
    }
    return result;
  }
}

function processFile(filepath) {
  const html = fs.readFileSync(filepath, 'utf8');

  if (html.includes('ad-tenping')) {
    console.log(`SKIP (already has ads): ${filepath}`);
    return;
  }

  // post-content 영역 찾기
  const MARKER = 'post-content md-content">';
  const markerIdx = html.indexOf(MARKER);
  if (markerIdx < 0) {
    console.log(`SKIP (no post-content): ${filepath}`);
    return;
  }
  const contentStart = markerIdx + MARKER.length;

  // post-content 끝: </main> 또는 </article> 이전의 </div> 찾기
  // minified HTML에서 정확히 닫는 div를 찾기 어려우므로
  // 안전하게 </aside 또는 </footer 기준으로 자름
  const endMarkers = ['<footer class=post-footer', '</article>', '</main>'];
  let contentEnd = -1;
  for (const em of endMarkers) {
    const idx = html.indexOf(em, contentStart);
    if (idx > 0) {
      if (contentEnd < 0 || idx < contentEnd) contentEnd = idx;
    }
  }
  if (contentEnd < 0) {
    console.log(`SKIP (no content end): ${filepath}`);
    return;
  }

  const before = html.substring(0, contentStart);
  const content = html.substring(contentStart, contentEnd);
  const after = html.substring(contentEnd);

  const newContent = insertAdsIntoContent(content);
  const newHtml = before + newContent + after;

  fs.writeFileSync(filepath, newHtml, 'utf8');
  const adCount = (newHtml.match(/ad-tenping/g) || []).length;
  console.log(`OK (${adCount} ads): ${filepath}`);
}

for (const f of TARGET_FILES) {
  try {
    processFile(f);
  } catch (e) {
    console.error(`ERROR: ${f} — ${e.message}`);
  }
}
