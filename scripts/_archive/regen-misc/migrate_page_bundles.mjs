#!/usr/bin/env node
/**
 * migrate_page_bundles.mjs
 * 기존 section/slug.md + static/images/slug-*.webp
 *   → section/slug/index.md + section/slug/slug-*.webp (Hugo Page Bundle)
 *
 * 실행: node scripts/migrate_page_bundles.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const POSTS_DIR  = path.join(ROOT, 'content', 'posts');
const IMAGES_DIR = path.join(ROOT, 'static', 'images');

let migratedPosts  = 0;
let migratedImages = 0;
let skipped        = 0;

// content/posts/ 아래 모든 섹션 디렉토리 스캔
const sectionDirs = fs.readdirSync(POSTS_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

for (const sectionDir of sectionDirs) {
  const secPath = path.join(POSTS_DIR, sectionDir);
  const entries = fs.readdirSync(secPath, { withFileTypes: true });
  const mdFiles = entries.filter(
    e => e.isFile() && e.name.endsWith('.md') && e.name !== '_index.md'
  );

  for (const file of mdFiles) {
    const slug      = file.name.replace(/\.md$/, '');
    const oldPath   = path.join(secPath, file.name);
    const bundleDir = path.join(secPath, slug);
    const newPath   = path.join(bundleDir, 'index.md');

    // 이미 번들로 마이그레이션된 경우 스킵
    if (fs.existsSync(bundleDir)) {
      console.log(`SKIP (already bundle): ${sectionDir}/${slug}`);
      skipped++;
      continue;
    }

    // 파일 내용 읽기
    let content = fs.readFileSync(oldPath, 'utf-8');

    // 1) front matter의 cover.image: 절대 URL → 파일명만
    //    "https://dmazone.github.io/blogauto/images/slug-thumb.webp"
    //    → "slug-thumb.webp"
    content = content.replace(
      /^(  image: )"https?:\/\/[^"]*\/images\/([^"]+)"$/m,
      '$1"$2"'
    );

    // 2) 본문 이미지 URL: 절대 URL → 파일명만
    //    (https://dmazone.github.io/blogauto/images/slug-01.webp)
    //    → (slug-01.webp)
    content = content.replace(
      /\(https?:\/\/[^)]+\/images\/([\w\-]+\.webp)\)/g,
      '($1)'
    );

    // 번들 디렉토리 생성
    fs.mkdirSync(bundleDir, { recursive: true });

    // 수정된 내용으로 index.md 저장
    fs.writeFileSync(newPath, content, 'utf-8');

    // 원본 .md 파일 삭제
    fs.unlinkSync(oldPath);

    console.log(`MIGRATED: ${sectionDir}/${slug}.md → ${sectionDir}/${slug}/index.md`);
    migratedPosts++;

    // 3) static/images/ 에서 매칭 이미지 번들 디렉토리로 이동
    for (const suffix of ['-01.webp', '-02.webp', '-thumb.webp']) {
      const imgName = `${slug}${suffix}`;
      const imgSrc  = path.join(IMAGES_DIR, imgName);
      const imgDest = path.join(bundleDir, imgName);

      if (fs.existsSync(imgSrc)) {
        fs.renameSync(imgSrc, imgDest);
        console.log(`  IMG: ${imgName} → ${sectionDir}/${slug}/`);
        migratedImages++;
      }
    }
  }
}

// static/images/ 에 남은 고아 이미지 확인
const remaining = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.webp'));
if (remaining.length > 0) {
  console.log(`\n남은 고아 이미지 (${remaining.length}개): ${remaining.join(', ')}`);
}

console.log(`\n완료: 포스트 ${migratedPosts}개, 이미지 ${migratedImages}개 마이그레이션 / 스킵 ${skipped}개`);
