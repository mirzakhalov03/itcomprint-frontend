import { normalizeLegacyZone, SAMPLE_ATTENDEE } from '../printer/renderBadge';
import type { BadgeTemplate } from '../types';

function BadgeCardPreview({ template }: { template: BadgeTemplate }) {
  const zones = template.zones.map(normalizeLegacyZone).filter((z) => !z.hidden);
  return (
    <div
      className="flex flex-col items-center justify-center overflow-hidden rounded-md border border-line bg-white px-3 py-2 text-center"
      style={{ aspectRatio: `${template.labelWidthMm} / ${template.labelHeightMm}` }}
    >
      {zones.length === 0 ? (
        <span className="text-[11px] text-faint">Empty template</span>
      ) : (
        zones.map((z, i) => {
          const text =
            z.type === 'static'
              ? z.staticText || ''
              : z.field === 'fullName'
                ? SAMPLE_ATTENDEE.fullName
                : (SAMPLE_ATTENDEE.extra[z.field ?? ''] ?? z.field ?? '');
          return (
            <span
              key={i}
              className="block w-full truncate leading-tight text-ink"
              style={{
                fontSize: `${Math.round(z.fontSize * 0.45 + 3)}px`,
                fontWeight: z.bold ? 700 : 400,
                textAlign: z.align,
                fontFamily: z.fontFamily,
              }}
            >
              {text || ' '}
            </span>
          );
        })
      )}
    </div>
  );
}

export function TemplateCard({
  template,
  onEdit,
}: {
  template: BadgeTemplate;
  onEdit: (t: BadgeTemplate) => void;
}) {
  return (
    <button
      onClick={() => onEdit(template)}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 text-left transition-all hover:border-brand-line hover:shadow-[0_8px_24px_rgba(0,0,0,.06)]"
    >
      <BadgeCardPreview template={template} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-display text-sm font-bold text-ink group-hover:text-brand-deep">
          {template.name}
        </span>
        {template.isDefault && (
          <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-brand-deep">
            Default
          </span>
        )}
      </div>
    </button>
  );
}
