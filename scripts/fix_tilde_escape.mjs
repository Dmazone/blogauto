#!/usr/bin/env node
/**
 * 모든 포스팅 index.md에서 이스케이프되지 않은 단독 ~ 를 \~ 로 변환
 * goldmark가 단독 ~ 쌍을 취소선으로 렌더링하는 버그 방지
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // front matter 끝 위치 (두 번째 ---)
  const fmEnd = content.indexOf('\n---\n', 4);
  if (fmEnd === -1) return false;

  const fm = content.slice(0, fmEnd + 5);
  const body = content.slice(fmEnd + 5);

  // 이미 이스케이프된 \~ 와 이중 ~~ 는 건드리지 않고
  // 단독 ~ 만 \~ 로 변환
  // 사용 패턴: (?<!\\) = 앞에 백슬래시 없음, (?<!~) = 앞에 ~ 없음, (?!~) = 뒤에 ~ 없음
  const SINGLE_TILDE = /(?<!\\)(?<!~)~(?!~)/g;
  const newBody = body.replace(SINGLE_TILDE, '\\~');

  if (newBody !== body) {
    fs.writeFileSync(filePath, fm + newBody, 'utf-8');
    return true;
  }
  return false;
}

const postsDir = path.join(ROOT, 'content', 'posts');
const files = execSync(`find "${postsDir}" -name "index.md"`, { encoding: 'utf-8' })
  .trim().split('\n').filter(Boolean);

let count = 0;
for (const f of files) {
  if (processFile(f)) {
    console.log('Fixed: ' + path.relative(ROOT, f));
    count++;
  }
}
console.log(`\n✅ 총 ${count}개 파일 수정 완료`);
