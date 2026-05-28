import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { reminders, projects } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
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
import { CancelReminderButton } from './reminder-controls';

export const dynamic = 'force-dynamic';

function fmtTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const REMINDER_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

function ReminderStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', REMINDER_STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}

export default async function RemindersPage() {
  // Pending first, then by remindAt (soonest first).
  const rows = await db
    .select({
      id: reminders.id,
      text: reminders.text,
      status: reminders.status,
      projectSlug: projects.slug,
      remindAt: reminders.remindAt,
    })
    .from(reminders)
    .leftJoin(projects, eq(reminders.projectId, projects.id))
    .orderBy(
      sql`case when ${reminders.status} = 'pending' then 0 else 1 end`,
      asc(reminders.remindAt),
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled Slack nudges. Pending first, soonest due first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reminder queue</CardTitle>
          <CardDescription>Cancel a pending reminder to stop it from being sent.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No reminders yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reminder</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Remind at</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.text}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {r.projectSlug ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtTime(r.remindAt)}</TableCell>
                    <TableCell>
                      <ReminderStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === 'pending' ? <CancelReminderButton id={r.id} /> : null}
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
