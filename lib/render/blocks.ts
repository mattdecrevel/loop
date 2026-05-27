export interface SlackBlock { type: string; [k: string]: unknown }
export function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}
export function context(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}
