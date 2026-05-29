import { desc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NewProject } from './new-project';
import { ProjectRowActions } from './project-row-actions';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ProjectsPage() {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      githubRepo: projects.githubRepo,
      autofixEnabled: projects.autofixEnabled,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .orderBy(desc(projects.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Services that send events to Loop. Each holds one API key.
          </p>
        </div>
        <NewProject />
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No projects yet. Create one to mint an API key.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>GitHub repo</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.slug}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.githubRepo ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <ProjectRowActions
                        id={p.id}
                        slug={p.slug}
                        name={p.name}
                        githubRepo={p.githubRepo}
                        autofixEnabled={p.autofixEnabled}
                      />
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
