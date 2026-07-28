/**
 * claude_telegram_bot.js — 텔레그램 ↔ Claude Code 풀 챗봇
 *
 * 텔레그램에서 Claude Code와 완전한 대화 가능:
 *   - 파일 읽기/쓰기, bash 명령 실행, 프로젝트 전체 작업
 *   - 멀티턴 대화 (이전 맥락 유지)
 *   - /reset 으로 대화 초기화
 *
 * 실행:
 *   node scripts/claude_telegram_bot.js
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const TOKEN    = process.env.TELEGRAM_TOKEN;
const CHAT_ID  = String(process.env.TELEGRAM_CHAT_ID);
const API_KEY  = process.env.ANTHROPIC_API_KEY;
const HISTORY_FILE = path.join(ROOT, 'data', 'chat_history.json');
const WORKER_URL   = 'https://trendzoom-bot.ekaledma.workers.dev';

if (!TOKEN || !CHAT_ID || !API_KEY) {
  console.error('❌ TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY 필요');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: API_KEY });

// ── 대화 히스토리 (메모리 + 파일 영속) ──────────────────────────────
let history = [];

function loadHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
      console.log(`📂 이전 대화 ${history.length}개 메시지 로드`);
    }
  } catch { history = []; }
}

function saveHistory() {
  try {
    // 최근 50개 메시지만 보존 (컨텍스트 관리)
    if (history.length > 100) history = history.slice(-100);
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) { console.warn('히스토리 저장 실패:', e.message); }
}

// ── Telegram API ────────────────────────────────────────────────────
async function tgApi(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendTyping() {
  await tgApi('sendChatAction', { chat_id: CHAT_ID, action: 'typing' });
}

async function send(text, options = {}) {
  // Telegram 메시지 4096자 제한 — 초과 시 분할 전송
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    await tgApi('sendMessage', {
      chat_id: CHAT_ID,
      text: chunks[i],
      parse_mode: 'Markdown',
      ...options,
      // 첫 번째 청크에만 옵션 적용
      ...(i > 0 ? { parse_mode: 'Markdown' } : {}),
    });
    if (i < chunks.length - 1) await sleep(300);
  }
}

function splitMessage(text, limit = 4000) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) { chunks.push(remaining); break; }
    // 코드블록 경계나 줄바꿈 기준으로 분할
    let cutAt = limit;
    const newline = remaining.lastIndexOf('\n', limit);
    if (newline > limit * 0.5) cutAt = newline + 1;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  return chunks;
}

// ── 도구 정의 ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'bash',
    description: 'PowerShell 명령 실행. BlogAuto 디렉토리 기준. 파일 생성/수정/git/node 실행 등 모든 작업 가능.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell 명령어' },
        timeout: { type: 'number', description: '타임아웃(ms), 기본 60000' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: '파일 내용 읽기',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 (절대경로 또는 BlogAuto 상대경로)' },
        lines: { type: 'number', description: '읽을 최대 줄 수 (기본 200)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: '파일 생성 또는 덮어쓰기',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로' },
        content: { type: 'string', description: '저장할 내용' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: '디렉토리 파일 목록 조회',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: '디렉토리 경로 (기본: BlogAuto 루트)' },
        recursive: { type: 'boolean', description: '하위 폴더 포함 여부' },
        pattern: { type: 'string', description: '파일명 패턴 (예: *.md, *.js)' },
      },
    },
  },
  {
    name: 'grep',
    description: '파일 내용 검색',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '검색할 패턴 (정규식 가능)' },
        directory: { type: 'string', description: '검색 디렉토리' },
        file_pattern: { type: 'string', description: '파일 패턴 (예: *.md)' },
      },
      required: ['pattern'],
    },
  },
];

// ── 도구 실행 ─────────────────────────────────────────────────────────
function resolvePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.join(ROOT, p);
}

function executeTool(name, input) {
  try {
    switch (name) {
      case 'bash': {
        const timeout = input.timeout ?? 60000;
        const result = execSync(input.command, {
          cwd: ROOT,
          timeout,
          encoding: 'utf-8',
          env: { ...process.env },
          shell: 'powershell.exe',
        });
        return result || '(출력 없음)';
      }

      case 'read_file': {
        const filePath = resolvePath(input.path);
        if (!existsSync(filePath)) return `❌ 파일 없음: ${filePath}`;
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const limit = input.lines ?? 200;
        if (lines.length > limit) {
          return lines.slice(0, limit).join('\n') + `\n\n... (총 ${lines.length}줄, ${limit}줄까지 표시)`;
        }
        return content;
      }

      case 'write_file': {
        const filePath = resolvePath(input.path);
        const dir = path.dirname(filePath);
        if (!existsSync(dir)) {
          execSync(`New-Item -ItemType Directory -Force "${dir}"`, { shell: 'powershell.exe' });
        }
        writeFileSync(filePath, input.content, 'utf-8');
        return `✅ 파일 저장: ${filePath}`;
      }

      case 'list_files': {
        const dir = resolvePath(input.directory ?? '.');
        const results = [];
        function walk(d, depth = 0) {
          const entries = readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            if (e.name.startsWith('.') && e.name !== '.env') continue;
            const fullPath = path.join(d, e.name);
            const rel = path.relative(ROOT, fullPath);
            if (!input.pattern || e.name.includes(input.pattern.replace('*', ''))) {
              results.push((e.isDirectory() ? '📁 ' : '📄 ') + rel);
            }
            if (e.isDirectory() && input.recursive && depth < 3) {
              walk(fullPath, depth + 1);
            }
          }
        }
        walk(dir);
        return results.slice(0, 100).join('\n') || '(비어 있음)';
      }

      case 'grep': {
        const dir = input.directory ? resolvePath(input.directory) : ROOT;
        const fileArg = input.file_pattern ? `--include="${input.file_pattern}"` : '';
        const cmd = `Select-String -Path "${dir}\\*" -Pattern "${input.pattern}" -Recurse ${fileArg} | Select-Object -First 50 | Format-List`;
        try {
          const result = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', shell: 'powershell.exe', timeout: 15000 });
          return result || '(일치 없음)';
        } catch {
          // fallback to simpler grep
          const cmd2 = `Get-ChildItem -Path "${dir}" -Recurse -Filter "${input.file_pattern ?? '*'}" | Select-String -Pattern "${input.pattern}" | Select-Object -First 30`;
          const r2 = execSync(cmd2, { cwd: ROOT, encoding: 'utf-8', shell: 'powershell.exe', timeout: 15000 });
          return r2 || '(일치 없음)';
        }
      }

      default:
        return `❌ 알 수 없는 도구: ${name}`;
    }
  } catch (err) {
    return `❌ 오류: ${err.message}`;
  }
}

// ── 시스템 프롬프트 ───────────────────────────────────────────────────
function buildSystemPrompt() {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  let claudeMd = '';
  try {
    claudeMd = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf-8').slice(0, 8000);
  } catch {}

  return `당신은 트렌드줌 블로그 자동화 프로젝트(BlogAuto)를 전담하는 Claude Code 어시스턴트입니다.
사용자가 텔레그램으로 보내는 메시지에 한국어로 응답하세요.

현재 시각: ${now} (KST)
작업 디렉토리: C:\\Users\\Paydma\\BlogAuto

## 사용 가능한 도구
- bash: PowerShell 명령 실행 (git, node, 파일 생성 등)
- read_file: 파일 읽기
- write_file: 파일 쓰기/생성
- list_files: 디렉토리 탐색
- grep: 파일 내 검색

## 작업 원칙
- 도구를 적극 활용해 실제 작업을 수행하세요
- 명확한 지시가 있으면 직접 파일을 수정하고 git push까지 진행
- 에러 발생 시 원인을 분석하고 스스로 수정
- 응답은 한국어로, 마크다운 활용 (텔레그램 지원: **볼드**, \`코드\`, \`\`\`블록\`\`\`)
- 결과는 간결하게 — 긴 출력은 핵심만 요약

## 프로젝트 컨텍스트 (CLAUDE.md 요약)
${claudeMd}`;
}

// ── Claude API 호출 (도구 루프) ──────────────────────────────────────
async function askClaude(userMessage) {
  history.push({ role: 'user', content: userMessage });

  const messages = [...history];
  let finalText = '';

  // 도구 루프 — Claude가 더 이상 도구를 호출하지 않을 때까지
  for (let round = 0; round < 10; round++) {
    await sendTyping();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages,
    });

    // 텍스트 수집
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length > 0) {
      finalText = textBlocks.map(b => b.text).join('\n');
    }

    // stop_reason 확인
    if (response.stop_reason === 'end_turn') {
      // 도구 없이 종료 — 완료
      messages.push({ role: 'assistant', content: response.content });
      break;
    }

    if (response.stop_reason === 'tool_use') {
      // 도구 사용 — 실행 후 결과 반환
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const toolName = block.name;
        const toolInput = block.input;

        console.log(`🔧 도구 실행: ${toolName}`, JSON.stringify(toolInput).slice(0, 100));
        await sendTyping();

        const result = executeTool(toolName, toolInput);
        const resultPreview = String(result).slice(0, 200);
        console.log(`   결과: ${resultPreview}${result.length > 200 ? '...' : ''}`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: String(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // max_tokens 등 기타 종료
    messages.push({ role: 'assistant', content: response.content });
    break;
  }

  // 히스토리 업데이트 (마지막 assistant 메시지)
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
  if (lastAssistant) {
    // 텍스트만 히스토리에 저장 (도구 결과는 포함, 단 content가 복잡하면 단순화)
    history = messages;
    saveHistory();
  }

  return finalText || '(응답 없음)';
}

// ── 웹훅 관리 ─────────────────────────────────────────────────────────
async function deleteWebhook() {
  const r = await tgApi('deleteWebhook', { drop_pending_updates: true });
  console.log('✅ 웹훅 비활성화:', r.ok);
}

async function restoreWebhook() {
  const r = await tgApi('setWebhook', { url: WORKER_URL });
  console.log('✅ 웹훅 복원:', r.ok);
}

// ── 메인 폴링 루프 ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  loadHistory();
  await deleteWebhook();

  await send(`🤖 *Claude Code 봇 시작!*

텔레그램에서 Claude Code와 직접 대화할 수 있습니다.

사용법:
• 자유롭게 메시지 입력 — Claude가 파일 읽기/쓰기/명령 실행까지 처리
• /reset — 대화 초기화 (새 주제 시작 시)
• /status — 현재 상태 확인
• /help — 도움말

*예시:*
"오늘 포스팅 몇 개야?"
"economy 섹션 최신 포스팅 확인해줘"
"daily_runner.js 실행해줘"
"categories 오류 고쳐줘"`);

  let offset = 0;

  process.on('SIGINT', async () => {
    console.log('\n종료 중...');
    await restoreWebhook();
    await send('🔌 Claude Code 봇 종료됨 — 클라우드 봇으로 복원됐습니다.');
    process.exit(0);
  });

  while (true) {
    try {
      const data = await tgApi('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });

      for (const update of data.result ?? []) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg) continue;

        const chatId = String(msg.chat?.id ?? '');
        const text = (msg.text ?? '').trim();

        // 보안: 허용된 채팅방만
        if (chatId !== CHAT_ID) {
          console.log(`⚠️ 차단: chat_id=${chatId}`);
          continue;
        }

        if (!text) continue;

        console.log(`📨 수신: "${text.slice(0, 80)}"`);

        // 특수 명령
        if (text === '/reset') {
          history = [];
          saveHistory();
          await send('🔄 대화 초기화 완료! 새로운 대화를 시작하세요.');
          continue;
        }

        if (text === '/status') {
          const msgCount = history.filter(m => m.role === 'user').length;
          await send(`📊 *봇 상태*\n\n대화 수: ${msgCount}턴\n모델: claude-sonnet-4-6\n작업 디렉토리: BlogAuto`);
          continue;
        }

        if (text === '/help') {
          await send(`🤖 *Claude Code 텔레그램 봇 도움말*

*기본 사용:*
• 자유로운 한국어 대화 가능
• 파일 읽기/쓰기, 명령 실행 모두 가능

*명령어:*
• /reset — 대화 컨텍스트 초기화
• /status — 봇 상태 확인
• /help — 이 도움말

*예시 질문:*
• "오늘 게시된 포스팅 목록 보여줘"
• "economy 섹션 포스팅 작성해줘"
• "Hugo 빌드 오류 확인해줘"
• "git log 최근 5개"
• "images 폴더에 파일 몇 개야?"
• "daily_runner.js 실행해"

🔧 도구: bash, 파일읽기, 파일쓰기, 디렉토리탐색, grep`);
          continue;
        }

        // Claude에게 전달
        await sendTyping();
        try {
          const reply = await askClaude(text);
          await send(reply);
        } catch (err) {
          console.error('Claude 오류:', err);
          await send(`❌ 오류 발생: ${err.message}\n\n/reset 후 다시 시도해보세요.`);
        }
      }
    } catch (err) {
      console.error('폴링 오류:', err.message);
      await sleep(5000);
    }
  }
}

main();
