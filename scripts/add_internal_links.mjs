/**
 * 내부 링크 자동 보완 스크립트
 * - 각 포스팅 본문에 내부 링크가 2개 미만이면 같은 섹션의 다른 포스팅 링크를 추가
 * - 해시태그 줄 바로 앞에 "함께 읽으면 좋은 글" 섹션 삽입
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../content/posts');

function countInternalLinks(content) {
  const matches = content.match(/\[.+?\]\(\/posts\/[^)]+\)/g) || [];
  return matches.length;
}

function getHashtagLine(content) {
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    // #태그 형식: # 뒤에 바로 공백 없이 텍스트 (마크다운 헤딩은 # 뒤에 공백)
    if (line.match(/^#[^\s#]/) && line.includes(' ')) {
      return i;
    }
  }
  return -1;
}

function getPostsInSection(sectionDir, currentSlug) {
  const posts = [];
  try {
    const slugs = fs.readdirSync(sectionDir).filter(s => {
      if (s === '_index.md' || s === currentSlug) return false;
      const idx = path.join(sectionDir, s, 'index.md');
      if (!fs.existsSync(idx)) return false;
      try {
        const c = fs.readFileSync(idx, 'utf-8');
        // draft: true 제외
        if (/^draft:\s*true/m.test(c)) return false;
        return true;
      } catch { return false; }
    });
    // 최대 4개 랜덤 선택
    const shuffled = slugs.sort(() => Math.random() - 0.5).slice(0, 4);
    for (const slug of shuffled) {
      const idx = path.join(sectionDir, slug, 'index.md');
      const c = fs.readFileSync(idx, 'utf-8');
      const titleMatch = c.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      if (titleMatch) {
        posts.push({ slug, title: titleMatch[1].replace(/^["']|["']$/g, '') });
      }
    }
  } catch {}
  return posts;
}

let fixed = 0, skipped = 0, errors = 0;

const sections = fs.readdirSync(POSTS_DIR).filter(s => {
  return fs.statSync(path.join(POSTS_DIR, s)).isDirectory();
});

for (const section of sections) {
  const sectionDir = path.join(POSTS_DIR, section);
  const slugs = fs.readdirSync(sectionDir).filter(s => {
    return fs.existsSync(path.join(sectionDir, s, 'index.md'));
  });

  for (const slug of slugs) {
    const idxPath = path.join(sectionDir, slug, 'index.md');
    try {
      const content = fs.readFileSync(idxPath, 'utf-8');
      // draft 제외
      if (/^draft:\s*true/m.test(content)) { skipped++; continue; }
      // 내부 링크 2개 이상이면 skip
      if (countInternalLinks(content) >= 2) { skipped++; continue; }

      // 관련 포스팅 가져오기
      const related = getPostsInSection(sectionDir, slug);
      if (related.length < 1) { skipped++; continue; }

      // 링크 텍스트 생성 (최대 2개)
      const linkLines = related.slice(0, 2).map(p =>
        `- [${p.title}](/posts/${section}/${p.slug}/)`
      );

      // 삽입 위치: 해시태그 줄 앞
      const lines = content.split('\n');
      const tagIdx = getHashtagLine(content);

      let insertLines;
      if (tagIdx > 0) {
        // 해시태그 앞에 삽입
        insertLines = [
          ...lines.slice(0, tagIdx),
          '',
          '**함께 읽으면 좋은 글**',
          ...linkLines,
          '',
          ...lines.slice(tagIdx),
        ];
      } else {
        // 끝에 삽입
        insertLines = [
          ...lines,
          '',
          '**함께 읽으면 좋은 글**',
          ...linkLines,
        ];
      }

      const newContent = insertLines.join('\n').replace(/\n{3,}/g, '\n\n');
      fs.writeFileSync(idxPath, newContent, 'utf-8');
      console.log(`✅ ${section}/${slug} (+${linkLines.length}개 링크)`);
      fixed++;
    } catch (e) {
      console.error(`❌ ${section}/${slug}: ${e.message}`);
      errors++;
    }
  }
}

console.log(`\n완료: 수정 ${fixed}개 / 스킵 ${skipped}개 / 오류 ${errors}개`);
