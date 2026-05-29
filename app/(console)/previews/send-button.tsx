'use client';

import * as React from 'react';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { sendPreview } from './actions';

export function SendLiveButton({ sampleId, projectSlug }: { sampleId: string; projectSlug: string }) {
  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function onClick() {
    setPending(true);
    setStatus(null);
    const result = await sendPreview(sampleId, projectSlug);
    setPending(false);
    if ('error' in result) {
      setStatus({ kind: 'error', text: result.error });
    } else {
      setStatus({ kind: 'ok', text: result.status });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
        <Send className="size-3.5" />
        {pending ? 'Sending…' : 'Send live'}
      </Button>
      {status ? (
        <span
          className={
            status.kind === 'ok'
              ? 'text-xs text-emerald-600 dark:text-emerald-400'
              : 'text-xs text-destructive'
          }
        >
          {status.text}
        </span>
      ) : null}
    </div>
  );
}
