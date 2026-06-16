/**
 * Line icons in the IT Community house style — 24px viewBox, currentColor stroke,
 * rounded caps/joins. Small, focused, reused across the kiosk UI.
 */
type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function Svg({
  size = 16,
  className,
  strokeWidth = 2.2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
);

export const PrinterIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.3}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </Svg>
);

export const PlugIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <rect x="6" y="14" width="12" height="8" rx="1" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    <path d="M6 9V3h12v6" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <polyline points="6 9 12 15 18 9" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 3}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

/**
 * Decorative node-constellation texture — the brand's circuit/network motif.
 * Sits absolutely behind the dark frame (header + preview tray) at low opacity.
 */
export function NodeMesh({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 120"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <g stroke="#578032" strokeWidth="1" fill="#578032" opacity="0.5">
        <line x1="80" y1="20" x2="180" y2="80" />
        <line x1="180" y1="80" x2="300" y2="30" />
        <line x1="300" y1="30" x2="430" y2="90" />
        <line x1="430" y1="90" x2="560" y2="24" />
        <line x1="560" y1="24" x2="680" y2="84" />
        <line x1="680" y1="84" x2="760" y2="36" />
        <circle cx="80" cy="20" r="3" />
        <circle cx="180" cy="80" r="2.5" />
        <circle cx="300" cy="30" r="3" />
        <circle cx="430" cy="90" r="2.5" />
        <circle cx="560" cy="24" r="3" />
        <circle cx="680" cy="84" r="2.5" />
        <circle cx="760" cy="36" r="3" />
      </g>
    </svg>
  );
}
