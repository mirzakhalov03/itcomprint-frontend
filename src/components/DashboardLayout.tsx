import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PrinterStatus } from './PrinterStatus';
import { MenuIcon } from './icons';

const TITLES: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/printer': 'Printer',
  '/app/settings': 'Settings',
};

/** Persistent shell: dark sidebar + dark header bar + light routed workspace. */
export function DashboardLayout() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Dashboard';
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever the route changes. Resetting one boolean on
  // navigation is intentional and cheap, so the cascading-render heuristic doesn't apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Scrim behind the drawer on small screens */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="animate-fade-in fixed inset-0 z-40 bg-ink/50 lg:hidden"
          aria-hidden
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 bg-ink px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            >
              <MenuIcon size={20} />
            </button>
            <span className="truncate font-display text-[15px] font-bold tracking-[.04em] text-white">
              {title}
            </span>
          </div>
          <PrinterStatus />
        </header>
        <main className="flex-1 overflow-y-auto px-4 pb-7 pt-5 sm:px-6">
          <div className="mx-auto max-w-[1120px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
