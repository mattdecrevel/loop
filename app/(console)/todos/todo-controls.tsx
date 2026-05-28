'use client';

import * as React from 'react';
import { Check, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { markTodoDone, reopenTodo } from './actions';

export function TodoToggleButton({ id, status }: { id: string; status: string }) {
  const [pending, setPending] = React.useState(false);
  const done = status === 'done';

  async function onClick() {
    setPending(true);
    if (done) {
      await reopenTodo(id);
    } else {
      await markTodoDone(id);
    }
    setPending(false);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {done ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
      {pending ? '…' : done ? 'Reopen' : 'Mark done'}
    </Button>
  );
}
