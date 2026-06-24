import { useState } from 'react';
import { BadgePreview } from './BadgePreview';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ArrowLeftIcon } from './icons';
import { renderBadgeLines, SAMPLE_ATTENDEE } from '../printer/buildBadgeTSPL';
import {
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useTemplateFieldKeys,
} from '../hooks/useTemplates';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import type { BadgeTemplate, TemplateZone } from '../types';

const newZone = (): TemplateZone => ({
  id: crypto.randomUUID(),
  field: 'fullName',
  fontSize: 3,
  bold: false,
  align: 'center',
  hidden: false,
});

const blankDraft = (): BadgeTemplate => ({
  _id: '',
  name: '',
  labelWidthMm: 80,
  labelHeightMm: 60,
  zones: [newZone()],
  isDefault: false,
});

export function TemplateEditor({
  initial,
  onClose,
}: {
  initial: BadgeTemplate | 'new';
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BadgeTemplate>(initial === 'new' ? blankDraft() : initial);
  const { data: fieldKeys = [] } = useTemplateFieldKeys();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const isNew = draft._id === '';

  function patchZone(id: string, patch: Partial<TemplateZone>) {
    setDraft((d) => ({ ...d, zones: d.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
  }
  function moveZone(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const zones = [...d.zones];
      const target = index + dir;
      if (target < 0 || target >= zones.length) return d;
      [zones[index], zones[target]] = [zones[target], zones[index]];
      return { ...d, zones };
    });
  }

  async function save() {
    const payload = {
      name: draft.name.trim(),
      labelWidthMm: draft.labelWidthMm,
      labelHeightMm: draft.labelHeightMm,
      zones: draft.zones,
    };
    if (!payload.name) return toast('Name is required');
    try {
      if (isNew) await create.mutateAsync(payload);
      else await update.mutateAsync({ id: draft._id, payload });
      toast('Template saved');
      onClose();
    } catch (e) {
      toast(errMessage(e, 'Save failed'));
    }
  }

  async function del() {
    try {
      await remove.mutateAsync(draft._id);
      toast('Template deleted');
      onClose();
    } catch (e) {
      toast(errMessage(e, 'Delete failed'));
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* Editor column */}
      <div className="flex flex-col gap-5">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeftIcon size={16} /> All templates
        </button>

        <label className="flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">Template name</span>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Width (mm)</span>
            <Input
              type="number"
              value={draft.labelWidthMm}
              onChange={(e) => setDraft({ ...draft, labelWidthMm: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Height (mm)</span>
            <Input
              type="number"
              value={draft.labelHeightMm}
              onChange={(e) => setDraft({ ...draft, labelHeightMm: Number(e.target.value) })}
            />
          </label>
        </div>

        <datalist id="field-keys">
          <option value="fullName" />
          {fieldKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        <div className="flex flex-col gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-faint">
            Zones
          </span>
          {draft.zones.map((z, i) => (
            <div
              key={z.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3"
            >
              <input
                list="field-keys"
                value={z.field}
                onChange={(e) => patchZone(z.id, { field: e.target.value })}
                placeholder="field"
                className="h-9 min-w-32 flex-1 rounded-lg border border-line-2 bg-white px-2.5 text-sm outline-none"
              />
              <select
                value={z.fontSize}
                onChange={(e) => patchZone(z.id, { fontSize: Number(e.target.value) })}
                className="h-9 rounded-lg border border-line-2 bg-white px-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    Size {n}
                  </option>
                ))}
              </select>
              <select
                value={z.align}
                onChange={(e) =>
                  patchZone(z.id, { align: e.target.value as TemplateZone['align'] })
                }
                className="h-9 rounded-lg border border-line-2 bg-white px-2 text-sm"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
              <label className="inline-flex items-center gap-1 text-sm text-ink-3">
                <input
                  type="checkbox"
                  checked={z.bold}
                  onChange={(e) => patchZone(z.id, { bold: e.target.checked })}
                />
                Bold
              </label>
              <label className="inline-flex items-center gap-1 text-sm text-ink-3">
                <input
                  type="checkbox"
                  checked={z.hidden}
                  onChange={(e) => patchZone(z.id, { hidden: e.target.checked })}
                />
                Hide
              </label>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => moveZone(i, -1)}
                  className="px-1.5 text-muted hover:text-ink"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveZone(i, 1)}
                  className="px-1.5 text-muted hover:text-ink"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() =>
                    setDraft((d) => ({ ...d, zones: d.zones.filter((x) => x.id !== z.id) }))
                  }
                  className="px-1.5 text-danger hover:opacity-70"
                  aria-label="Remove zone"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => setDraft((d) => ({ ...d, zones: [...d.zones, newZone()] }))}
            className="h-10 self-start rounded-full px-4 text-sm"
          >
            + Add zone
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving} className="h-11 rounded-full px-5 text-sm">
            {saving ? 'Saving…' : 'Save template'}
          </Button>
          {!isNew && !draft.isDefault && (
            <Button
              variant="danger"
              onClick={del}
              disabled={remove.isPending}
              className="h-11 rounded-full px-5 text-sm"
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Live preview column */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <span className="mb-2 block font-display text-xs font-semibold uppercase tracking-wide text-faint">
          Preview
        </span>
        <BadgePreview
          lines={renderBadgeLines(SAMPLE_ATTENDEE, draft)}
          widthMm={draft.labelWidthMm || 80}
          heightMm={draft.labelHeightMm || 60}
          className="w-full shadow-[0_8px_24px_rgba(0,0,0,.06)]"
        />
        <p className="mt-2 text-xs text-faint">Sample data shown. Empty fields render blank.</p>
      </div>
    </div>
  );
}
