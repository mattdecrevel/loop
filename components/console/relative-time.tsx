'use client';

import { useEffect, useState } from 'react';

/**
 * Format a date as relative time using Intl.RelativeTimeFormat.
 * Returns "5 minutes ago", "2 hours ago", "yesterday", etc. in the user's locale.
 */
function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffSec = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 604_800) return rtf.format(Math.round(diffSec / 86_400), 'day');
  if (abs < 2_592_000) return rtf.format(Math.round(diffSec / 604_800), 'week');
  if (abs < 31_536_000) return rtf.format(Math.round(diffSec / 2_592_000), 'month');
  return rtf.format(Math.round(diffSec / 31_536_000), 'year');
}

interface RelativeTimeProps {
  /** ISO 8601 timestamp (server should pre-serialize with `.toISOString()`). */
  iso: string;
  /** Server-rendered fallback so SSR/hydration is deterministic. Swapped to relative on mount. */
  fallback: string;
}

/**
 * Renders a timestamp as relative time in the user's locale, with the full
 * absolute time on hover (title attr).
 *
 * SSR/hydration-safe: server renders `fallback` (any deterministic string),
 * client swaps to the live relative format after mount and refreshes every 30s.
 */
export function RelativeTime({ iso, fallback }: RelativeTimeProps) {
  const [text, setText] = useState(fallback);
  const [title, setTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    setTitle(new Date(iso).toLocaleString());
    const update = () => setText(formatRelative(iso));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} title={title} suppressHydrationWarning>
      {text}
    </time>
  );
}
