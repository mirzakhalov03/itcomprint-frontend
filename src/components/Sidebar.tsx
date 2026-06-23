import { NavLink } from 'react-router-dom';
import { NodeMesh, GridIcon, PrinterIcon, SettingsIcon } from './icons';
import { UserMenu } from './UserMenu';

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-semibold transition-colors ${
    isActive ? 'bg-brand text-white' : 'text-faint hover:bg-white/5 hover:text-white'
  }`;

/** Dark branded shell rail: brand lockup, section nav, signed-in user. */
export function Sidebar() {
  return (
    <aside className="relative flex h-full w-[244px] shrink-0 flex-col overflow-hidden bg-ink">
      <NodeMesh className="pointer-events-none absolute inset-x-0 top-0 h-24 w-full opacity-40" />

      <div className="relative flex items-center gap-[13px] px-5 pb-6 pt-6">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-brand">
          <img src="/brand/itcomuz-icon-white.png" alt="ITCOMUZ" className="h-[26px] w-[26px] object-contain" />
        </div>
        <div className="flex flex-col gap-px">
          <span className="font-display text-[14px] font-bold leading-tight text-white">IT Community</span>
          <span className="font-display text-[14px] font-bold leading-tight text-white">Registration</span>
        </div>
      </div>

      <nav className="relative flex flex-1 flex-col gap-1 px-3">
        <NavLink to="/app" end className={navItem}>
          <GridIcon size={18} /> Dashboard
        </NavLink>
        <NavLink to="/app/printer" className={navItem}>
          <PrinterIcon size={18} /> Printer
        </NavLink>
        <NavLink to="/app/settings" className={navItem}>
          <SettingsIcon size={18} /> Settings
        </NavLink>
      </nav>

      <div className="relative border-t border-white/10 px-4 py-4">
        <UserMenu />
      </div>
    </aside>
  );
}
