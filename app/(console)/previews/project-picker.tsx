'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface ProjectOption {
	slug: string;
	name: string;
}

/**
 * Project-scope picker for the /previews page. Updates the `?project=<slug>`
 * search param so the page server-rerenders with the new context and the
 * Fire All / Send Live buttons target the chosen project.
 */
export function ProjectPicker({ projects, selectedSlug }: { projects: ProjectOption[]; selectedSlug: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const [pending, startTransition] = useTransition();

	function onChange(slug: string) {
		const next = new URLSearchParams(params.toString());
		next.set('project', slug);
		startTransition(() => {
			router.push(`${pathname}?${next.toString()}`);
		});
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-muted-foreground">Send as project:</span>
			<Select value={selectedSlug} onValueChange={onChange} disabled={pending}>
				<SelectTrigger className="h-8 w-56 text-sm">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{projects.map((p) => (
						<SelectItem key={p.slug} value={p.slug}>
							{p.name} <span className="text-xs text-muted-foreground">· {p.slug}</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
