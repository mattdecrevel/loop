import type { SlackBlock } from '@/lib/render/blocks';

export interface PostResult { ok: boolean; ts?: string; channel?: string; error?: string }

/** Post via bot token to a channel ID. Returns ts for later chat.update (Phase 2). */
export async function postToChannel(text: string, blocks: SlackBlock[], channelId: string): Promise<PostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN not set' };
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, text, blocks }),
    });
    const data = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
    if (!data.ok) { console.error('[loop/slack] chat.postMessage:', data.error); return { ok: false, error: data.error }; }
    return { ok: true, ts: data.ts, channel: data.channel };
  } catch (err) {
    console.error('[loop/slack] post failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'fetch_failed' };
  }
}

/** Post the rendered payload to an arbitrary incoming webhook (override target). */
export async function postToWebhook(text: string, blocks: SlackBlock[], url: string): Promise<PostResult> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, blocks }) });
    if (!res.ok) { console.error('[loop/slack] webhook', res.status); return { ok: false, error: `http_${res.status}` }; }
    return { ok: true };
  } catch (err) {
    console.error('[loop/slack] webhook failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'fetch_failed' };
  }
}
