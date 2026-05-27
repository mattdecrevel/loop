import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { events, projects } from '@/lib/db/schema';
import { CATEGORIES, type Category } from '@/lib/events/schemas';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CategoryBadge, SeverityBadge, StatusBadge } from '@/components/console/badges';

export const dynamic = 'force-dynamic';

function fmtTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isCategory(value: string | undefined): value is Category {
  return !!value && (CATEGORIES as readonly string[]).includes(value);
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active = isCategory(category) ? category : undefined;

  const base = db
    .select({
      id: events.id,
      createdAt: events.createdAt,
      projectSlug: projects.slug,
      type: events.type,
      category: events.category,
      severity: events.severity,
      status: events.status,
      slackChannelId: events.slackChannelId,
    })
    .from(events)
    .leftJoin(projects, eq(events.projectId, projects.id));

  const rows = await (active ? base.where(eq(events.category, active)) : base)
    .orderBy(desc(events.createdAt))
    .limit(100);

  const filters: { label: string; value: string | undefined }[] = [
    { label: 'All', value: undefined },
    ...CATEGORIES.map((c) => ({ label: c, value: c })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">The 100 most recent events, newest first.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const isActive = f.value === active;
          return (
            <Link
              key={f.label}
              href={f.value ? `/events?category=${f.value}` : '/events'}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event log</CardTitle>
          <CardDescription>
            {active ? `Filtered to "${active}".` : 'Across all categories.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No events{active ? ` in "${active}"` : ''} yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Slack channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{fmtTime(e.createdAt)}</TableCell>
                    <TableCell className="font-mono text-sm">{e.projectSlug ?? '—'}</TableCell>
                    <TableCell className="font-medium">{e.type}</TableCell>
                    <TableCell>
                      <CategoryBadge category={e.category} />
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={e.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.slackChannelId ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
