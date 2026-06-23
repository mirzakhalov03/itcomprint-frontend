import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PrinterStatus } from './PrinterStatus';

const TITLES: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/printer': 'Printer',
  '/app/settings': 'Settings',
};

/** Persistent shell: dark sidebar + dark header bar + light routed workspace. */
export function DashboardLayout() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between bg-ink px-6">
          <span className="font-display text-[15px] font-bold tracking-[.04em] text-white">{title}</span>
          <PrinterStatus />
        </header>
        <main className="flex-1 overflow-y-auto px-6 pb-7 pt-5">
          <div className="mx-auto max-w-[1120px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
