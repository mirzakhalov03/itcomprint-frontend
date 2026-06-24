import { useState } from 'react';
import { useTemplates } from '../hooks/useTemplates';
import { TemplateCard } from '../components/TemplateCard';
import { TemplateEditor } from '../components/TemplateEditor';
import { Button } from '../components/ui/Button';
import { LoadingPanel } from '../components/ui/EmptyState';
import type { BadgeTemplate } from '../types';

export function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates();
  const [editing, setEditing] = useState<BadgeTemplate | 'new' | null>(null);

  if (editing) {
    return (
      <div className="max-w-[900px]">
        <h1 className="mb-5 font-display text-xl font-bold text-ink">
          {editing === 'new' ? 'New template' : 'Edit template'}
        </h1>
        <TemplateEditor initial={editing} onClose={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-[900px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Badge templates</h1>
        <Button onClick={() => setEditing('new')} className="h-10 rounded-full px-5 text-sm">
          New template
        </Button>
      </div>

      {isLoading ? (
        <LoadingPanel>Loading templates…</LoadingPanel>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t._id} template={t} onEdit={setEditing} />
          ))}
        </div>
      )}
    </div>
  );
}
