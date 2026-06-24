import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TemplateInput } from '../types';

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
    refetchOnWindowFocus: true,
  });
}

export function useTemplateFieldKeys() {
  return useQuery({ queryKey: ['template-field-keys'], queryFn: api.templateFieldKeys });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TemplateInput) => api.createTemplate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TemplateInput }) =>
      api.updateTemplate(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      qc.invalidateQueries({ queryKey: ['events'] }); // referencing events may revert to default
    },
  });
}

export function useSetEventTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, templateId }: { eventId: string; templateId: string | null }) =>
      api.setEventTemplate(eventId, templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}
