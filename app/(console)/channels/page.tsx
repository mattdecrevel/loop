import { desc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { channels } from '@/lib/db/schema';
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
import { DeleteChannelButton, NewChannelForm } from './channel-controls';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ChannelsPage() {
  const rows = await db
    .select({
      id: channels.id,
      name: channels.name,
      slackChannelId: channels.slackChannelId,
      createdAt: channels.createdAt,
    })
    .from(channels)
    .orderBy(desc(channels.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="text-sm text-muted-foreground">
          Logical Slack delivery targets that routes point at.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a channel</CardTitle>
          <CardDescription>
            Give it a one-word name and the Slack channel ID it maps to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewChannelForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No channels yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slack channel ID</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {c.slackChannelId}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DeleteChannelButton id={c.id} name={c.name} />
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
