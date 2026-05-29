'use client';

import * as React from 'react';
import { Flame } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SAMPLE_ENTRIES } from '@/lib/render/samples';
import { fireAllPreviews, type FireAllResult } from './actions';

/**
 * Fires one sample of every event type sequentially through the real ingest
 * pipeline. Sequential keeps the order deterministic in Slack and stays well
 * under any rate limit. Result list renders inline so you can see which types
 * posted vs which failed.
 */
export function FireAllButton({ projectSlug }: { projectSlug: string }) {
	const [pending, setPending] = React.useState(false);
	const [result, setResult] = React.useState<FireAllResult | { error: string } | null>(null);

	async function onClick() {
		setPending(true);
		setResult(null);
		const r = await fireAllPreviews(projectSlug);
		setResult(r);
		setPending(false);
	}

	return (
		<div className="space-y-2">
			<Button onClick={onClick} disabled={pending} variant="default" size="sm">
				<Flame className="size-3.5" />
				{pending ? `Firing all ${SAMPLE_ENTRIES.length} samples…` : `Fire all ${SAMPLE_ENTRIES.length} samples at ${projectSlug}`}
			</Button>

			{result && 'error' in result ? (
				<p className="text-xs text-destructive">{result.error}</p>
			) : null}

			{result && 'results' in result ? (
				<div className="flex flex-wrap gap-1.5">
					{result.results.map((r) => {
						const failed = !!r.error || r.status === 'failed';
						const cls = failed
							? 'border-destructive/40 bg-destructive/10 text-destructive'
							: r.status === 'duplicate' || r.status === 'skipped' || r.status === 'digested'
								? 'border-muted bg-muted text-muted-foreground'
								: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
						return (
							<span
								key={r.id}
								title={r.error ?? r.status}
								className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${cls}`}
							>
								<span className="font-medium">{r.label}</span>
								<span className="opacity-70">{failed ? 'fail' : r.status}</span>
							</span>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
