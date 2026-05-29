'use client';

import * as React from 'react';
import { Check, Copy, KeyRound, Pencil, RotateCw, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { rotateApiKey, updateProject } from './actions';

export interface ProjectRowProps {
	id: string;
	slug: string;
	name: string;
	githubRepo: string | null;
	autofixEnabled: boolean;
}

/**
 * Per-row actions panel for the Projects table. Drops in two affordances:
 *
 *   1. <Switch /> for autofix — flips inline, no dialog. Cheap to toggle.
 *   2. <EditProjectDialog /> — name + github repo + rotate-key flow.
 *
 * Rotating the key invalidates the old one immediately, so the new key is
 * shown in a "copy this once" dialog before dismissing.
 */
export function ProjectRowActions(props: ProjectRowProps) {
	return (
		<div className="flex items-center justify-end gap-2">
			<AutofixToggle id={props.id} initial={props.autofixEnabled} />
			<EditProjectDialog {...props} />
		</div>
	);
}

function AutofixToggle({ id, initial }: { id: string; initial: boolean }) {
	const [enabled, setEnabled] = React.useState(initial);
	const [pending, startTransition] = React.useTransition();

	function onChange(next: boolean) {
		setEnabled(next);
		startTransition(async () => {
			const result = await updateProject(id, { autofixEnabled: next });
			if ('error' in result) {
				// rollback on failure
				setEnabled(!next);
				console.error('[projects] toggle autofix failed:', result.error);
			}
		});
	}

	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="inline-flex items-center gap-2">
						<Switch
							id={`autofix-${id}`}
							checked={enabled}
							onCheckedChange={onChange}
							disabled={pending}
							aria-label="Toggle autofix"
						/>
						<Label htmlFor={`autofix-${id}`} className="cursor-pointer text-xs">
							autofix
						</Label>
					</div>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-xs">
					When enabled, the project&apos;s error / feedback Slack messages get a
					&ldquo;+ Auto-Fix&rdquo; button next to the &ldquo;Create Issue&rdquo; button. Clicking
					it opens the issue with the <code>claude-code</code> label so an agent
					can pick it up automatically.
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function EditProjectDialog(props: ProjectRowProps) {
	const [open, setOpen] = React.useState(false);
	const [name, setName] = React.useState(props.name);
	const [githubRepo, setGithubRepo] = React.useState(props.githubRepo ?? '');
	const [saving, startSaving] = React.useTransition();
	const [saveStatus, setSaveStatus] = React.useState<string | null>(null);

	// Rotate-key state
	const [rotating, startRotating] = React.useTransition();
	const [mintedKey, setMintedKey] = React.useState<string | null>(null);
	const [copied, setCopied] = React.useState(false);
	const [confirmRotate, setConfirmRotate] = React.useState(false);

	function reset() {
		setName(props.name);
		setGithubRepo(props.githubRepo ?? '');
		setMintedKey(null);
		setCopied(false);
		setConfirmRotate(false);
		setSaveStatus(null);
	}

	function onSave() {
		setSaveStatus(null);
		startSaving(async () => {
			const result = await updateProject(props.id, {
				name,
				githubRepo: githubRepo === '' ? null : githubRepo,
			});
			if ('error' in result) {
				setSaveStatus(`✗ ${result.error}`);
			} else {
				setSaveStatus('✓ saved');
			}
		});
	}

	function onRotate() {
		startRotating(async () => {
			const result = await rotateApiKey(props.id);
			if ('error' in result) {
				setSaveStatus(`✗ rotate failed: ${result.error}`);
				setConfirmRotate(false);
				return;
			}
			setMintedKey(result.apiKey);
			setConfirmRotate(false);
		});
	}

	async function copyKey() {
		if (!mintedKey) return;
		try {
			await navigator.clipboard.writeText(mintedKey);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard API blocked — fall back to selecting the code block
			console.warn('[projects] clipboard blocked; select the key manually');
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Pencil className="size-3.5" />
					Edit
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{props.slug} <span className="text-muted-foreground">·</span> Edit
					</DialogTitle>
					<DialogDescription>
						Slug is immutable. Rotating the API key takes effect immediately and invalidates the old one.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`name-${props.id}`}>Name</Label>
						<Input
							id={`name-${props.id}`}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Site or service name"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`repo-${props.id}`}>GitHub repo</Label>
						<Input
							id={`repo-${props.id}`}
							value={githubRepo}
							onChange={(e) => setGithubRepo(e.target.value)}
							placeholder="owner/repo (enables Create Issue buttons)"
						/>
						<p className="text-xs text-muted-foreground">
							When set, error and feedback events get a &ldquo;Create Issue&rdquo; button that opens the
							issue in this repo. Leave empty to disable.
						</p>
					</div>

					<div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2 text-sm font-medium">
								<KeyRound className="size-4" />
								API key
							</div>
							{!confirmRotate && !mintedKey ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setConfirmRotate(true)}
								>
									<RotateCw className="size-3.5" />
									Rotate
								</Button>
							) : null}
						</div>
						{!confirmRotate && !mintedKey ? (
							<p className="text-xs text-muted-foreground">
								The plaintext key is hashed at rest and can&apos;t be revealed.
								Rotate to mint a new one if you&apos;ve lost it or it&apos;s leaked.
							</p>
						) : null}
						{confirmRotate ? (
							<div className="flex flex-col gap-2 text-xs">
								<p className="text-muted-foreground">
									This invalidates the existing key the moment you click confirm. Every
									service still using it will start getting 401s until you update them.
								</p>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="destructive"
										size="sm"
										onClick={onRotate}
										disabled={rotating}
									>
										{rotating ? 'Rotating…' : 'Yes, rotate now'}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setConfirmRotate(false)}
										disabled={rotating}
									>
										Cancel
									</Button>
								</div>
							</div>
						) : null}
						{mintedKey ? (
							<div className="flex flex-col gap-2">
								<p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
									New key minted. Copy it now — it will not be shown again.
								</p>
								<div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
									<code className="flex-1 truncate font-mono text-xs">{mintedKey}</code>
									<Button type="button" variant="ghost" size="sm" onClick={copyKey}>
										{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
										<span className="sr-only">Copy API key</span>
									</Button>
								</div>
							</div>
						) : null}
					</div>
				</div>

				<DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
					<span className="text-xs text-muted-foreground">{saveStatus}</span>
					<div className="flex items-center gap-2">
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							<X className="size-4" />
							Close
						</Button>
						<Button type="button" onClick={onSave} disabled={saving}>
							<Save className="size-4" />
							{saving ? 'Saving…' : 'Save'}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
