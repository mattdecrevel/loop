import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { todos, projects } from '@/lib/db/schema';
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
import { TodoToggleButton } from './todo-controls';

export const dynamic = 'force-dynamic';

function fmtTime(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TODO_STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
};

function TodoStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', TODO_STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}

export default async function TodosPage() {
  // Open first, then newest-first within each group.
  const rows = await db
    .select({
      id: todos.id,
      text: todos.text,
      status: todos.status,
      projectSlug: projects.slug,
      createdAt: todos.createdAt,
    })
    .from(todos)
    .leftJoin(projects, eq(todos.projectId, projects.id))
    .orderBy(asc(todos.status), desc(todos.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">To-Dos</h1>
        <p className="text-sm text-muted-foreground">
          Action items captured from events. Open items first, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>To-Do list</CardTitle>
          <CardDescription>Mark items done as you handle them, or reopen if needed.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No to-dos yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To-do</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell
                      className={cn(
                        'font-medium',
                        t.status === 'done' && 'text-muted-foreground line-through',
                      )}
                    >
                      {t.text}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {t.projectSlug ?? '—'}
                    </TableCell>
                    <TableCell>
                      <TodoStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtTime(t.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <TodoToggleButton id={t.id} status={t.status} />
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
