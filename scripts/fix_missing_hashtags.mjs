/**
 * fix_missing_hashtags.mjs
 * 최근 1개월 포스팅 중 본문 해시태그(#tag)가 없는 것에 자동으로 추가
 */
import fs from 'fs';
import path from 'path';

const CONTENT_DIR = path.resolve('content/posts');
const DAYS = 31;
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - DAYS);

// DRAFT 제외 목록
const SKIP_DRAFTS = true;

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const get = (key) => {
    const r = fm.match(new RegExp(`^${key}:\\s*"?(.+?)"?\\s*$`, 'm'));
    return r ? r[1].trim() : '';
  };
  const getTags = () => {
    const r = fm.match(/^tags:\s*\[(.+?)\]/m);
    if (!r) return [];
    return r[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
  };
  return {
    title: get('title'),
    date: get('date'),
    tags: getTags(),
    draft: /^draft:\s*true/m.test(fm),
    categories: get('categories').replace(/[\[\]"]/g, '').trim(),
  };
}

function hasHashtags(content) {
  // frontmatter 이후 본문에서 #단어 패턴 찾기
  const body = content.replace(/^---[\s\S]*?---\n/, '');
  return /#[\w가-힣ぁ-ん一-龯]+/.test(body);
}

function detectLang(fm) {
  if (fm.categories.includes('日本')) return 'ja';
  if (fm.categories.includes('Global Trends') || /^[A-Za-z]/.test(fm.title)) return 'en';
  return 'ko';
}

// 해시태그 생성 (최소 7개)
function buildHashtags(fm, slug, lang) {
  const tags = [...fm.tags];

  // slug에서 키워드 추출
  const slugWords = slug.replace(/-\d{4}$/, '').replace(/-top\d+$/, '')
    .split('-').filter(w => w.length > 2 && !/^\d+$/.test(w));

  if (lang === 'en') {
    // 영어 포스팅
    const extras = slugWords.map(w => w.charAt(0).toUpperCase() + w.slice(1));
    const all = [...new Set([...tags, ...extras])].slice(0, 10);
    while (all.length < 7) all.push('GlobalTrends');
    return all.map(t => '#' + t.replace(/\s+/g, '')).join(' ');
  }

  if (lang === 'ja') {
    const all = [...new Set(tags)].slice(0, 10);
    while (all.length < 7) all.push('日本トレンド');
    return all.map(t => '#' + t.replace(/\s+/g, '')).join(' ');
  }

  // 한국어
  const sectionTag = {
    '트렌드상품': ['쿠팡추천', '가성비', '최저가', '인기상품'],
    '스포츠': ['KBO', '한국야구', '스포츠뉴스', '오늘야구'],
    '연예이슈': ['연예뉴스', '연예인', '핫이슈', '엔터테인먼트'],
    '최신기술동향': ['IT뉴스', '테크', '기술트렌드', 'AI'],
    'IT기기': ['IT기기추천', '갤럭시', '스마트폰', '가전'],
    '경제': ['경제뉴스', '주식', '투자', '금융'],
    '사회': ['사회이슈', '뉴스', '한국사회'],
    '인문': ['인문학', '교양', '역사'],
    '건강': ['건강정보', '운동', '다이어트', '웰빙'],
    '한국부동산': ['부동산뉴스', '아파트', '집값', '부동산투자'],
    '세계여행지': ['여행', '해외여행', '여행추천'],
    '日本トレンド': ['일본트렌드', '일본뉴스'],
  };
  const extraTags = sectionTag[fm.categories] || ['트렌드', '뉴스', '이슈'];
  const all = [...new Set([...tags, ...extraTags])].slice(0, 12);
  while (all.length < 7) all.push('트렌드줌');
  return all.map(t => '#' + t.replace(/\s+/g, '')).join(' ');
}

let fixed = 0;
let skipped = 0;

for (const section of fs.readdirSync(CONTENT_DIR)) {
  const sectionPath = path.join(CONTENT_DIR, section);
  if (!fs.statSync(sectionPath).isDirectory()) continue;

  for (const slug of fs.readdirSync(sectionPath)) {
    const mdPath = path.join(sectionPath, slug, 'index.md');
    if (!fs.existsSync(mdPath)) continue;

    const content = fs.readFileSync(mdPath, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) continue;

    // 날짜 체크
    const postDate = new Date(fm.date);
    if (postDate < cutoff) continue;

    // DRAFT 제외
    if (SKIP_DRAFTS && fm.draft) { skipped++; continue; }

    // 이미 해시태그 있으면 스킵
    if (hasHashtags(content)) continue;

    const lang = detectLang(fm);
    const hashtags = buildHashtags(fm, slug, lang);

    // 파일 끝에 해시태그 추가
    const trimmed = content.trimEnd();
    const newContent = trimmed + '\n\n' + hashtags + '\n';
    fs.writeFileSync(mdPath, newContent, 'utf8');
    console.log(`✅ [${section}] ${slug}`);
    console.log(`   → ${hashtags}`);
    fixed++;
  }
}

console.log(`\n완료: ${fixed}개 수정, ${skipped}개 DRAFT 스킵`);
