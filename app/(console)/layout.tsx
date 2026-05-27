import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SidebarNav } from '@/components/console/sidebar-nav';
import { logout } from '../login/actions';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            L
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Loop</span>
            <span className="text-xs text-muted-foreground">Operator console</span>
          </div>
        </div>
        <div className="mt-2 flex-1">
          <SidebarNav />
        </div>
        <div className="border-t p-3">
          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-6 py-3 md:hidden">
          <span className="text-sm font-semibold">Loop</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
