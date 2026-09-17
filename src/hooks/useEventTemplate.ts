import { useTemplates } from './useTemplates';
import type { AppEvent } from '../types';

/** The template an event prints with: its own templateId, else the default. */
export function useEventTemplate(event: Pick<AppEvent, 'templateId'>) {
  const { data: templates = [] } = useTemplates();
  const defaultTemplate = templates.find((t) => t.isDefault);
  const template = templates.find((t) => t._id === event.templateId) ?? defaultTemplate;
  return { templates, template, defaultId: defaultTemplate?._id ?? '' };
}
