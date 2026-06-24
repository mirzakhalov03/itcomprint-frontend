import { useSetEventTemplate } from '../hooks/useTemplates';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import type { AppEvent, BadgeTemplate } from '../types';

/**
 * Picks which template this event prints with. The value is the event's
 * templateId, or the default template's id when the event has none set.
 */
export function TemplateSelect({
  event,
  templates,
}: {
  event: AppEvent;
  templates: BadgeTemplate[];
}) {
  const setTemplate = useSetEventTemplate();
  const defaultId = templates.find((t) => t.isDefault)?._id ?? '';
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

  return (
    <label className="inline-flex items-center gap-2">
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-faint">
        Template
      </span>
      <select
        value={value}
        onChange={onChange}
        disabled={setTemplate.isPending || templates.length === 0}
        className="h-9 rounded-[10px] border border-line-2 bg-surface px-2.5 text-sm text-ink outline-none"
      >
        {templates.map((t) => (
          <option key={t._id} value={t._id}>
            {t.name}
            {t.isDefault ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
