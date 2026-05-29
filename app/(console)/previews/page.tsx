import { asc } from 'drizzle-orm';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { parseEvent } from '@/lib/events/schemas';
import { renderEvent } from '@/lib/render';
import type { SlackBlock } from '@/lib/render/blocks';
import { mrkdwnToHtml } from '@/lib/render/mrkdwn-to-html';
import { SAMPLE_ENTRIES, type SampleEntry } from '@/lib/render/samples';
import { FireAllButton } from './fire-all-button';
import { ProjectPicker } from './project-picker';
import { SendLiveButton } from './send-button';

export const dynamic = 'force-dynamic';

/** Fallback slug shown in the preview chrome when no projects exist yet. */
const FALLBACK_PREVIEW_SLUG = 'decrevel-dev';

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

function PreviewCard({ entry, previewSlug }: { entry: SampleEntry; previewSlug: string }) {
  const parsed = parseEvent(entry.envelope);

  if (!parsed.success) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <code className="text-sm font-medium">{entry.label}</code>
          <Badge variant="destructive">parse error</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{parsed.error}</p>
        </CardContent>
      </Card>
    );
  }

  const { blocks } = renderEvent(parsed.data, {
    projectSlug: previewSlug,
    githubRepo: 'mattdecrevel/example',
    autofixEnabled: true,
  });
  const isRaw = entry.type === 'raw';

  // Split body section(s) from the trailing context footer (house-style only).
  const footer = !isRaw && blocks.at(-1)?.type === 'context' ? blockText(blocks.at(-1)!) : null;
  const bodyBlocks = footer ? blocks.slice(0, -1) : blocks;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <code className="text-sm font-medium">{entry.label}</code>
          {isRaw ? <Badge variant="secondary">exempt</Badge> : null}
        </div>
        <SendLiveButton sampleId={entry.id} projectSlug={previewSlug} />
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

interface PageProps {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<{ project?: string }>;
}

export default async function PreviewsPage({ searchParams }: PageProps) {
  const { project: requestedSlug } = await searchParams;

  const projectRows = await db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .orderBy(asc(projects.createdAt));

  const projectOptions = projectRows.map((r) => ({ slug: r.slug, name: r.name }));

  // Selected project: explicit `?project=slug` if it exists, otherwise the
  // first project, otherwise the fallback slug (for the chrome only — buttons
  // will surface the "no project found" error if there are none).
  const selectedSlug =
    (requestedSlug && projectOptions.find((p) => p.slug === requestedSlug)?.slug) ||
    projectOptions[0]?.slug ||
    FALLBACK_PREVIEW_SLUG;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Previews</h1>
          <p className="text-sm text-muted-foreground">
            Every message type — plus key variant kinds (waitlist signup, add-on cancel) — rendered in
            the &ldquo;Rich hybrid&rdquo; house style. &ldquo;Send live&rdquo; posts the real sample through the
            selected project&apos;s pipeline; &ldquo;Fire all&rdquo; sends one of each in order so you can verify
            routing + rendering end-to-end. Dashed pills are server-handled (action_id) buttons.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {projectOptions.length > 1 ? (
            <ProjectPicker projects={projectOptions} selectedSlug={selectedSlug} />
          ) : projectOptions.length === 1 ? (
            <span className="text-xs text-muted-foreground">
              Sending as project <code className="text-foreground">{selectedSlug}</code>
            </span>
          ) : (
            <span className="text-xs text-destructive">
              No projects yet — create one on the Projects page first.
            </span>
          )}
          {projectOptions.length > 0 ? <FireAllButton projectSlug={selectedSlug} /> : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {SAMPLE_ENTRIES.map((entry) => (
          <PreviewCard key={entry.id} entry={entry} previewSlug={selectedSlug} />
        ))}
      </div>
    </div>
  );
}
