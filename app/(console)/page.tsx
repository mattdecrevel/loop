import { desc, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, channels, routes, events } from '@/lib/db/schema';
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
import { CategoryBadge, SeverityBadge, StatusBadge } from '@/components/console/badges';
import { RelativeTime } from '@/components/console/relative-time';

export const dynamic = 'force-dynamic';

async function count(table: typeof projects | typeof channels | typeof routes): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

function fmtTime(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage() {
  const [projectCount, channelCount, routeCount, recent] = await Promise.all([
    count(projects),
    count(channels),
    count(routes),
    db
      .select({
        id: events.id,
        type: events.type,
        category: events.category,
        severity: events.severity,
        status: events.status,
        createdAt: events.createdAt,
      })
      .from(events)
      .orderBy(desc(events.createdAt))
      .limit(20),
  ]);

  const stats = [
    { label: 'Projects', value: projectCount, hint: 'Registered services sending events' },
    { label: 'Channels', value: channelCount, hint: 'Slack delivery targets' },
    { label: 'Routes', value: routeCount, hint: 'Active routing overrides' },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of your Loop deployment.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>The last 20 events processed by Loop.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">
                      {e.createdAt ? <RelativeTime iso={e.createdAt.toISOString()} fallback={fmtTime(e.createdAt)} /> : '—'}
                    </TableCell>
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
