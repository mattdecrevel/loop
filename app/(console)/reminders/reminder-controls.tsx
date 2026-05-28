'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cancelReminder } from './actions';

export function CancelReminderButton({ id }: { id: string }) {
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    if (!confirm('Cancel this reminder? It will not be sent.')) return;
    setPending(true);
    await cancelReminder(id);
    setPending(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      <X className="size-3.5" />
      {pending ? '…' : 'Cancel'}
    </Button>
  );
}
