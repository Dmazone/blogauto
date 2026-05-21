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

    if (text === '/help' || text === '/start') {
      await sendTelegram(env, chatId,
        `🤖 *트렌드줌 블로그 자동화 봇*\n\n` +
        `/run — 전체 10개 섹션 실행\n` +
        `/run economy — 특정 섹션만\n` +
        `/run economy,health,sports — 여러 섹션\n` +
        `/status — 마지막 실행 상태\n\n` +
        `완료되면 자동으로 알림을 보내드립니다.`
      );
      return new Response('ok');
    }

    if (text.startsWith('/run')) {
      const sections = text.replace('/run', '').trim(); // 빈 문자열이면 전체 실행

      // GitHub Actions workflow_dispatch 트리거
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
          body: JSON.stringify({
            ref: BRANCH,
            inputs: { sections },
          }),
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

    if (text === '/status') {
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

    return new Response('ok');
  },
};

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}
