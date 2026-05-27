import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  posted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  skipped: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  digested: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const SEVERITY_STYLES: Record<string, string> = {
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', SEVERITY_STYLES[severity])}>
      {severity}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return <Badge variant="outline">{category}</Badge>;
}
