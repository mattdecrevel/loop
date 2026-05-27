import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { routes, projects, channels } from '@/lib/db/schema';
import { CATEGORIES } from '@/lib/events/schemas';
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
import { DeleteRouteButton, NewRouteForm } from './route-controls';

export const dynamic = 'force-dynamic';

// Mirrors lib/routing.ts precedence: project+category=4, project+all=3,
// all+category=2, all+all=1. Higher = more specific = wins.
function specificity(projectId: string | null, category: string | null): number {
  if (projectId && category) return 4;
  if (projectId && !category) return 3;
  if (!projectId && category) return 2;
  return 1;
}

const SPEC_LABEL: Record<number, string> = {
  4: 'project + category',
  3: 'project (all categories)',
  2: 'category (all projects)',
  1: 'global fallback',
};

export default async function RoutesPage() {
  const [routeRows, projectRows, channelRows] = await Promise.all([
    db
      .select({
        id: routes.id,
        projectId: routes.projectId,
        projectSlug: projects.slug,
        category: routes.category,
        targetChannelId: routes.targetChannelId,
        channelName: channels.name,
        targetWebhookUrl: routes.targetWebhookUrl,
        createdAt: routes.createdAt,
      })
      .from(routes)
      .leftJoin(projects, eq(routes.projectId, projects.id))
      .leftJoin(channels, eq(routes.targetChannelId, channels.id))
      .orderBy(desc(routes.createdAt)),
    db.select({ id: projects.id, slug: projects.slug }).from(projects).orderBy(projects.slug),
    db.select({ id: channels.id, name: channels.name }).from(channels).orderBy(channels.name),
  ]);

  const sorted = [...routeRows].sort(
    (a, b) => specificity(b.projectId, b.category) - specificity(a.projectId, a.category),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Routes</h1>
        <p className="text-sm text-muted-foreground">
          Per-project routing overrides. For any event, Loop picks the single most-specific
          matching rule.
        </p>
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">How precedence works</CardTitle>
          <CardDescription>
            Most-specific match wins. Exactly one rule fires per event, in this order:
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <ol className="flex flex-col gap-1.5">
            <li className="flex items-center gap-2">
              <Badge>4</Badge>
              <span>
                <span className="font-medium">project × category</span> — most specific
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="secondary">3</Badge>
              <span>
                <span className="font-medium">project × ALL categories</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="secondary">2</Badge>
              <span>
                <span className="font-medium">ALL projects × category</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">1</Badge>
              <span>
                <span className="font-medium">ALL projects × ALL categories</span> — global
                fallback
              </span>
            </li>
          </ol>
          <p className="text-muted-foreground">
            If no rule matches, the event falls back to the deployment&rsquo;s default channel.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a route</CardTitle>
          <CardDescription>
            Choose the scope (project / category) and a single target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewRouteForm
            projects={projectRows.map((p) => ({ value: p.id, label: p.slug }))}
            channels={channelRows.map((c) => ({ value: c.id, label: c.name }))}
            categories={[...CATEGORIES]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing rules</CardTitle>
          <CardDescription>Ordered most-specific first — top rules win ties.</CardDescription>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No routes yet. Without any rule, events use the default fallback channel.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Precedence</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => {
                  const spec = specificity(r.projectId, r.category);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge
                          variant={spec === 4 ? 'default' : spec === 1 ? 'outline' : 'secondary'}
                          title={SPEC_LABEL[spec]}
                        >
                          {spec}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.projectSlug ? (
                          <span className="font-mono text-sm">{r.projectSlug}</span>
                        ) : (
                          <span className="text-muted-foreground">ALL</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.category ? (
                          <Badge variant="outline">{r.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">ALL</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.channelName ? (
                          <span className="font-medium">#{r.channelName}</span>
                        ) : r.targetWebhookUrl ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            webhook → {r.targetWebhookUrl}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteRouteButton id={r.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
