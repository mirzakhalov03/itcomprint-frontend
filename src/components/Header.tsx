import { PrinterStatus } from './PrinterStatus';

const APP_TITLE = 'ROADSHOW BADGES';

/** Dark branded frame: logo lockup + node-mesh texture + printer status. */
export function Header() {
  return (
    <header className="relative flex h-16 shrink-0 items-center justify-between overflow-hidden bg-ink px-6">
      {/* node-constellation texture */}
      <svg
        viewBox="0 0 600 64"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
        aria-hidden="true"
      >
        <g stroke="#578032" strokeWidth="1" fill="#578032" opacity="0.5">
          <line x1="60" y1="14" x2="120" y2="44" />
          <line x1="120" y1="44" x2="190" y2="20" />
          <line x1="190" y1="20" x2="250" y2="48" />
          <line x1="250" y1="48" x2="330" y2="16" />
          <line x1="330" y1="16" x2="400" y2="46" />
          <line x1="400" y1="46" x2="470" y2="22" />
          <line x1="470" y1="22" x2="540" y2="50" />
          <circle cx="60" cy="14" r="3" />
          <circle cx="120" cy="44" r="2.5" />
          <circle cx="190" cy="20" r="3" />
          <circle cx="250" cy="48" r="2.5" />
          <circle cx="330" cy="16" r="3" />
          <circle cx="400" cy="46" r="2.5" />
          <circle cx="470" cy="22" r="3" />
          <circle cx="540" cy="50" r="2.5" />
        </g>
      </svg>

      <div className="relative flex items-center gap-[13px]">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-brand">
          <img
            src="/brand/itcomuz-icon-white.png"
            alt="ITCOMUZ"
            className="h-[26px] w-[26px] object-contain"
          />
        </div>
        <div className="flex flex-col gap-px">
          <span className="font-display text-[15px] font-bold leading-none tracking-[.06em] text-white">
            {APP_TITLE}
          </span>
          <span className="font-body text-[11px] font-medium leading-none tracking-[.04em] text-faint">
            IT COMMUNITY OF UZBEKISTAN
          </span>
        </div>
      </div>

      <PrinterStatus />
    </header>
  );
}
