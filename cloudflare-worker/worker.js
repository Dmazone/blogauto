/**
 * Cloudflare Worker — 트렌드줌 블로그 텔레그램 봇
 *
 * 환경변수 (Cloudflare Dashboard > Worker > Settings > Variables):
 *   TELEGRAM_TOKEN  : 텔레그램 봇 토큰 (BotFather에서 발급)
 *   TELEGRAM_CHAT_ID: 내 채팅 ID (@userinfobot 으로 확인)
 *   GITHUB_PAT      : GitHub Personal Access Token (workflow 권한)
 *   GITHUB_REPO     : "Dmazone/blogauto"
 *
 * 텔레그램 명령어:
 *   /run          → 전체 10개 섹션 실행
 *   /run economy  → economy 섹션만
 *   /run economy,health,sports → 특정 섹션들만
 *   /status       → 마지막 워크플로 상태 확인
 *   /help         → 도움말
 */

const WORKFLOW_FILE = 'auto-post.yml';
const BRANCH = 'main';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('트렌드줌 봇이 실행 중입니다.', { status: 200 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('ok');
    }

    const message = body?.message ?? body?.edited_message;
    if (!message) return new Response('ok');

    const text = (message.text ?? '').trim();
    const chatId = String(message.chat?.id ?? '');

    // 인증된 사용자만 허용
    if (chatId !== String(env.TELEGRAM_CHAT_ID)) {
      await sendTelegram(env, chatId, '⛔ 권한이 없습니다.');
      return new Response('ok');
    }

    // 한국어 섹션명 → 영문 ID 변환
    const KO_SECTION = {
      '최신기술': 'latest-tech', '기술': 'latest-tech',
      '경제': 'economy',
      '사회': 'society',
      '인문': 'humanities',
      '연예': 'entertainment', '연예이슈': 'entertainment',
      '건강': 'health',
      'it기기': 'it-devices', 'it': 'it-devices',
      '부동산': 'kr-realestate',
      '여행': 'world-travel',
      '스포츠': 'sports',
    };

    // 한국어 명령 처리
    const t = text.toLowerCase();
    if (t === '상태' || t === '상태확인' || t === '상태 확인') {
      return handleStatus(env, chatId);
    }
    if (t === '도움' || t === '도움말') {
      return sendHelp(env, chatId);
    }

    if (text === '/help' || text === '/start') {
      return sendHelp(env, chatId);
    }

    // /softrun — GitHub Actions (PC 꺼도 됨)
    if (text.startsWith('/softrun') || t === '전체실행' || t === '전체 실행' || t === '모두실행' || t === '다실행') {
      const sections = text.startsWith('/softrun') ? text.replace('/softrun', '').trim() : '';
      return handleRun(env, chatId, sections);
    }

    // /prorun — 로컬 PC 실행 (local_bot.js가 감지)
    if (text.startsWith('/prorun')) {
      await sendTelegram(env, chatId,
        `🖥 *Pro 실행 모드*\n\n` +
        `PC가 켜져 있고 local_bot.js가 실행 중이어야 합니다.\n\n` +
        `PC에서 local_bot.js가 이 메시지를 감지해 Gemini Pro로 실행합니다.\n` +
        `PC가 꺼져있다면 /softrun 을 사용하세요.`
      );
      return new Response('ok');
    }

    if (text === '/status') {
      return handleStatus(env, chatId);
    }

    // 한국어 섹션명 → softrun
    for (const [ko, en] of Object.entries(KO_SECTION)) {
      if (t.includes(ko) && (t.includes('실행') || t.includes('써') || t.includes('해'))) {
        return handleRun(env, chatId, en);
      }
    }

    // 인식 못한 메시지 → 도움말 안내
    await sendTelegram(env, chatId,
      `❓ 아래 명령어나 한국어로 말해주세요:\n\n` +
      `*슬래시 명령어*\n` +
      `/run — 전체 실행\n` +
      `/run economy — 특정 섹션\n` +
      `/status — 실행 상태\n\n` +
      `*한국어 명령어*\n` +
      `전체 실행 / 경제 실행 / 건강 실행\n` +
      `상태 확인 / 도움말`
    );
    return new Response('ok');
  },
};

async function handleRun(env, chatId, sections) {
  const githubRes = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'TrendZoom-Bot/1.0',
      },
      body: JSON.stringify({ ref: BRANCH, inputs: { sections } }),
    }
  );

  if (githubRes.status === 204) {
    const sectionMsg = sections ? `"${sections}" 섹션` : '전체 10개 섹션';
    await sendTelegram(env, chatId,
      `✅ *${sectionMsg} 실행 시작!*\n\n` +
      `⏱ 예상 소요: ${sections ? '10~20분' : '60~90분'}\n` +
      `완료되면 알림을 드릴게요.`
    );
  } else {
    const errText = await githubRes.text();
    await sendTelegram(env, chatId,
      `❌ 실행 실패 (GitHub API ${githubRes.status})\n\`${errText.slice(0, 200)}\``
    );
  }
  return new Response('ok');
}

async function handleStatus(env, chatId) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'TrendZoom-Bot/1.0',
      },
    }
  );
  const data = await res.json();
  const run = data.workflow_runs?.[0];
  if (!run) {
    await sendTelegram(env, chatId, '실행 기록이 없습니다.');
  } else {
    const emoji = run.conclusion === 'success' ? '✅' : run.status === 'in_progress' ? '🔄' : '❌';
    await sendTelegram(env, chatId,
      `${emoji} *최근 실행 상태*\n\n` +
      `상태: ${run.status} / ${run.conclusion ?? '진행 중'}\n` +
      `시작: ${new Date(run.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
    );
  }
  return new Response('ok');
}

async function sendHelp(env, chatId) {
  await sendTelegram(env, chatId,
    `🤖 *트렌드줌 블로그 자동화 봇*\n\n` +
    `*🖥 Pro 모드 (PC 켜져 있어야 함)*\n` +
    `/prorun — Gemini Pro 브라우저로 전체 실행\n` +
    `/prorun economy — 특정 섹션만\n\n` +
    `*☁️ Soft 모드 (PC 꺼도 됨)*\n` +
    `/softrun — GitHub Actions로 전체 실행\n` +
    `/softrun economy — 특정 섹션만\n\n` +
    `*기타*\n` +
    `/status — 마지막 실행 상태\n` +
    `상태 확인 / 도움말\n\n` +
    `완료되면 자동으로 알림을 보내드립니다.`
  );
  return new Response('ok');
}

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}
