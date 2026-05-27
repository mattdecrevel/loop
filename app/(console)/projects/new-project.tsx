'use client';

import * as React from 'react';
import { Check, Copy, Plus, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createProject } from './actions';

export function NewProject() {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [mintedKey, setMintedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    setError(null);
    setPending(true);
    const result = await createProject(formData);
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setOpen(false);
    setMintedKey(result.apiKey);
  }

  async function copyKey() {
    if (!mintedKey) return;
    await navigator.clipboard.writeText(mintedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" />
            New project
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Registers a service and mints an API key for it. The key is shown once.
            </DialogDescription>
          </DialogHeader>
          <form ref={formRef} action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" placeholder="my-app" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="My App" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="githubRepo">GitHub repo (optional)</Label>
              <Input id="githubRepo" name="githubRepo" placeholder="owner/repo" />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? 'Creating…' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={mintedKey !== null} onOpenChange={(o) => !o && setMintedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this key now — it is hashed at rest and can never be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
            <code className="flex-1 truncate font-mono text-sm">{mintedKey}</code>
            <Button type="button" variant="outline" size="icon" onClick={copyKey}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              <span className="sr-only">Copy API key</span>
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>Store this in your secret manager now. There is no way to retrieve it later.</span>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setMintedKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
