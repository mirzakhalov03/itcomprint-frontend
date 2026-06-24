import { BadgePreview } from './BadgePreview';
import { renderBadgeLines, SAMPLE_ATTENDEE } from '../printer/buildBadgeTSPL';
import type { BadgeTemplate } from '../types';

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
      <BadgePreview
        lines={renderBadgeLines(SAMPLE_ATTENDEE, template)}
        widthMm={template.labelWidthMm}
        heightMm={template.labelHeightMm}
        className="w-full"
      />
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
