'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createChannel, deleteChannel } from './actions';

export function NewChannelForm() {
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    setError(null);
    setWarning(null);
    setPending(true);
    const result = await createChannel(formData);
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    if (result.warning) setWarning(result.warning);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="users" required />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="slackChannelId">Slack channel ID</Label>
          <Input id="slackChannelId" name="slackChannelId" placeholder="C0123ABCD" required />
        </div>
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" />
          {pending ? 'Adding…' : 'Add channel'}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{warning}</p>
      ) : null}
    </form>
  );
}

export function DeleteChannelButton({ id, name }: { id: string; name: string }) {
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    if (!confirm(`Delete channel "${name}"? Routes targeting it must be reassigned.`)) return;
    setPending(true);
    await deleteChannel(id);
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
      <span className="sr-only">Delete channel</span>
    </Button>
  );
}
