import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { parseEvent, type EventType } from '@/lib/events/schemas';
import { renderEvent } from '@/lib/render';
import type { SlackBlock } from '@/lib/render/blocks';
import { mrkdwnToHtml } from '@/lib/render/mrkdwn-to-html';
import { SAMPLES, SAMPLE_TYPES } from '@/lib/render/samples';
import { SendLiveButton } from './send-button';

export const dynamic = 'force-dynamic';

const PREVIEW_SLUG = 'decrevel-dev';

function blockText(block: SlackBlock): string {
  // section: { text: { text } }; context: { elements: [{ text }] }
  const t = block.text as { text?: string } | undefined;
  if (t?.text) return t.text;
  const els = block.elements as { text?: string }[] | undefined;
  if (Array.isArray(els)) return els.map((e) => e?.text ?? '').filter(Boolean).join(' ');
  return '';
}

interface ActionElement {
  type: string;
  url?: string;
  action_id?: string;
  style?: 'primary' | 'danger';
  text?: { text?: string };
}

function ActionsBlock({ block }: { block: SlackBlock }) {
  const elements = (block.elements as ActionElement[] | undefined) ?? [];
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {elements.map((el, i) => {
        const label = el.text?.text ?? '';
        // URL buttons are real links (enabled).
        if (el.url) {
          return (
            <a
              key={i}
              href={el.url}
              target="_blank"
              rel="noreferrer"
              className={
                el.style === 'primary'
                  ? 'rounded border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                  : 'rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted'
              }
            >
              {label}
            </a>
          );
        }
        // Interactive (action_id) buttons are real once secrets are set — render as
        // enabled-looking pills, visually distinct (dashed ring) from URL buttons.
        return (
          <button
            key={i}
            type="button"
            title={`Server-handled action: ${el.action_id ?? ''}`}
            className={
              el.style === 'primary'
                ? 'rounded border border-primary border-dashed bg-primary/90 px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary'
                : 'rounded border border-dashed px-2.5 py-1 text-xs font-medium hover:bg-muted'
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PreviewCard({ type }: { type: EventType }) {
  const sample = SAMPLES[type];
  const parsed = parseEvent(sample);

  if (!parsed.success) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <code className="text-sm font-medium">{type}</code>
          <Badge variant="destructive">parse error</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{parsed.error}</p>
        </CardContent>
      </Card>
    );
  }

  const { blocks } = renderEvent(parsed.data, {
    projectSlug: PREVIEW_SLUG,
    githubRepo: 'mattdecrevel/example',
    autofixEnabled: true,
  });
  const isRaw = type === 'raw';

  // Split body section(s) from the trailing context footer (house-style only).
  const footer = !isRaw && blocks.at(-1)?.type === 'context' ? blockText(blocks.at(-1)!) : null;
  const bodyBlocks = footer ? blocks.slice(0, -1) : blocks;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <code className="text-sm font-medium">{type}</code>
          {isRaw ? <Badge variant="secondary">exempt</Badge> : null}
        </div>
        <SendLiveButton type={type} />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Slack-style message preview */}
        <div className="rounded-lg border bg-background p-4">
          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded bg-primary/90 text-sm font-semibold text-primary-foreground">
              E
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">Elio</span>
                <span className="rounded bg-muted px-1 text-[10px] font-medium uppercase text-muted-foreground">
                  App
                </span>
              </div>
              <div className="mt-1 space-y-2 text-sm leading-relaxed">
                {bodyBlocks.map((b, i) => {
                  if (b.type === 'actions') return <ActionsBlock key={i} block={b} />;
                  if (b.type === 'divider') return <hr key={i} className="border-border" />;
                  return (
                    <div
                      key={i}
                      className="[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_pre]:mt-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs"
                      dangerouslySetInnerHTML={{ __html: mrkdwnToHtml(blockText(b)) }}
                    />
                  );
                })}
              </div>

              {footer ? (
                <p className="mt-2 text-xs text-muted-foreground">{footer}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Raw blocks JSON */}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            View blocks JSON
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 font-mono leading-relaxed">
            {JSON.stringify(blocks, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

export default function PreviewsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Previews</h1>
        <p className="text-sm text-muted-foreground">
          Every message type rendered in the &ldquo;Rich hybrid&rdquo; house style. This is an HTML
          approximation for visual iteration — &ldquo;Send live&rdquo; posts the real sample through
          the {PREVIEW_SLUG} pipeline. Dashed pills are server-handled (action_id) buttons.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {SAMPLE_TYPES.map((type) => (
          <PreviewCard key={type} type={type} />
        ))}
      </div>
    </div>
  );
}
