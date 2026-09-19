import { useSetEventTemplate } from '../hooks/useTemplates';
import { useEventTemplate } from '../hooks/useEventTemplate';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { cn } from '../lib/cn';
import { ChevronDownIcon } from './icons';
import type { AppEvent } from '../types';

/**
 * Picks which template this event prints with. The value is the event's
 * templateId, or the default template's id when the event has none set.
 */
export function TemplateSelect({ event, className }: { event: AppEvent; className?: string }) {
  const setTemplate = useSetEventTemplate();
  const { templates, defaultId } = useEventTemplate(event);
  const value = event.templateId ?? defaultId;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    // Choosing the default reverts the event to "no override" (null).
    const templateId = id === defaultId ? null : id;
    setTemplate.mutate(
      { eventId: event._id, templateId },
      { onError: (err) => toast(errMessage(err, 'Could not change template')) },
    );
  }

  // Caption sits inside the tile so the toolbar stays one compact row. The select
  // fills the whole tile (a <label> would only focus it), and the caption ignores clicks.
  return (
    <div
      className={cn(
        'relative h-10.5 rounded-[10px] border border-line-2 bg-surface transition-colors focus-within:border-brand focus-within:bg-white hover:bg-white',
        className,
      )}
    >
      <span className="pointer-events-none absolute left-3 top-1.75 font-display text-[9.5px] font-semibold uppercase leading-none tracking-[.1em] text-faint">
        Template
      </span>
      <select
        aria-label="Template"
        value={value}
        onChange={onChange}
        disabled={setTemplate.isPending || templates.length === 0}
        className="h-full w-full cursor-pointer appearance-none truncate rounded-[10px] bg-transparent pb-1.5 pl-3 pr-8 pt-4.5 font-display text-[13px] font-semibold leading-tight text-ink outline-none disabled:cursor-wait"
      >
        {templates.map((t) => (
          <option key={t._id} value={t._id}>
            {t.name}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        size={15}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  );
}
