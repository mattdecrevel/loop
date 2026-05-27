'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { createRoute, deleteRoute } from './actions';

type Option = { value: string; label: string };

export function NewRouteForm({
  projects,
  channels,
  categories,
}: {
  projects: Option[];
  channels: Option[];
  categories: string[];
}) {
  const [projectId, setProjectId] = React.useState('__all__');
  const [category, setCategory] = React.useState('__all__');
  const [targetKind, setTargetKind] = React.useState<'channel' | 'webhook'>('channel');
  const [channelId, setChannelId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set('projectId', projectId);
    fd.set('category', category);
    fd.set('targetKind', targetKind);
    fd.set('targetChannelId', targetKind === 'channel' ? channelId : '');
    setPending(true);
    const result = await createRoute(fd);
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    // Reset target inputs; keep scope selections for quick repeat entry.
    setChannelId('');
    (e.target as HTMLFormElement).reset();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All projects (global)</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Target</Label>
        <div className="flex gap-2">
          {(['channel', 'webhook'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setTargetKind(kind)}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                targetKind === kind
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {kind}
            </button>
          ))}
        </div>
      </div>

      {targetKind === 'channel' ? (
        <div className="flex flex-col gap-2">
          <Label>Channel</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a channel" />
            </SelectTrigger>
            <SelectContent>
              {channels.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No channels — create one first
                </SelectItem>
              ) : (
                channels.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="targetWebhookUrl">Webhook URL</Label>
          <Input
            id="targetWebhookUrl"
            name="targetWebhookUrl"
            placeholder="https://hooks.slack.com/services/…"
          />
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" />
          {pending ? 'Adding…' : 'Add route'}
        </Button>
      </div>
    </form>
  );
}

export function DeleteRouteButton({ id }: { id: string }) {
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    if (!confirm('Delete this route?')) return;
    setPending(true);
    await deleteRoute(id);
    setPending(false);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-4" />
      <span className="sr-only">Delete route</span>
    </Button>
  );
}
