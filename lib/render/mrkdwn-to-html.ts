/**
 * Tiny, safe Slack-mrkdwn → HTML approximation for the Previews console cards.
 * This is for visual iteration only — NOT a faithful Slack renderer.
 *
 * Order matters: HTML is escaped first so user content can never inject markup,
 * then a handful of mrkdwn tokens are converted to tags.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function mrkdwnToHtml(input: string): string {
  let s = escapeHtml(input);

  // Fenced code blocks: ```...``` (may span newlines).
  s = s.replace(/```([\s\S]*?)```/g, (_m, code: string) => `<pre>${code.replace(/^\n+|\n+$/g, '')}</pre>`);

  // Inline code: `x`
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold: *x*
  s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');

  // Italic: _x_
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // Remaining newlines → <br/> (those inside <pre> are left as real newlines).
  const parts = s.split(/(<pre>[\s\S]*?<\/pre>)/g);
  return parts
    .map((part) => (part.startsWith('<pre>') ? part : part.replace(/\n/g, '<br/>')))
    .join('');
}
