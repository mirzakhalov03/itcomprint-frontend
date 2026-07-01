import { useState, useRef, useEffect, useCallback } from 'react';
import type { DragEvent } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ArrowLeftIcon } from './icons';
import {
  renderBadgeToCanvas,
  normalizeLegacyZone,
  FONT_FAMILIES,
  FONT_SIZES,
  SAMPLE_ATTENDEE,
} from '../printer/renderBadge';
import {
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useTemplateFieldKeys,
} from '../hooks/useTemplates';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import type { BadgeTemplate, TemplateZone } from '../types';

const newFieldZone = (): TemplateZone => ({
  id: crypto.randomUUID(),
  type: 'field',
  field: 'fullName',
  fontFamily: 'Inter',
  fontSize: 16,
  bold: false,
  align: 'center',
  hidden: false,
});

const newStaticZone = (): TemplateZone => ({
  id: crypto.randomUUID(),
  type: 'static',
  staticText: '',
  fontFamily: 'Inter',
  fontSize: 14,
  bold: false,
  align: 'center',
  hidden: false,
});

const blankDraft = (): BadgeTemplate => ({
  _id: '',
  name: '',
  labelWidthMm: 80,
  labelHeightMm: 60,
  zones: [newFieldZone()],
  isDefault: false,
});

export function TemplateEditor({
  initial,
  onClose,
}: {
  initial: BadgeTemplate | 'new';
  onClose: () => void;
}) {
  const raw = initial === 'new' ? blankDraft() : initial;
  const [draft, setDraft] = useState<BadgeTemplate>({
    ...raw,
    zones: raw.zones.map(normalizeLegacyZone),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragSrcId = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: fieldKeys = [] } = useTemplateFieldKeys();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const isNew = draft._id === '';
  const selected = draft.zones.find((z) => z.id === selectedId) ?? null;

  // ── Canvas preview ─────────────────────────────────────────────────────────
  const updatePreview = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const rendered = await renderBadgeToCanvas(SAMPLE_ATTENDEE, draft);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d')!.drawImage(rendered, 0, 0);
    } catch {
      // fonts may not be ready on first paint — the next draft change retries
    }
  }, [draft]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(updatePreview, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [updatePreview]);

  // ── Zone mutations ──────────────────────────────────────────────────────────
  function patchZone(id: string, patch: Partial<TemplateZone>) {
    setDraft((d) => ({
      ...d,
      zones: d.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    }));
  }

  function patchSelected(patch: Partial<TemplateZone>) {
    if (selectedId) patchZone(selectedId, patch);
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

  function removeZone(id: string) {
    if (selectedId === id) setSelectedId(null);
    setDraft((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== id) }));
  }

  function addZone(zone: TemplateZone) {
    setDraft((d) => ({ ...d, zones: [...d.zones, zone] }));
    setSelectedId(zone.id);
  }

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
  function onDragStart(e: DragEvent, id: string) {
    dragSrcId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  }

  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragSrcId.current;
    if (!srcId || srcId === targetId) return;
    setDraft((d) => {
      const zones = [...d.zones];
      const srcIdx = zones.findIndex((z) => z.id === srcId);
      const tgtIdx = zones.findIndex((z) => z.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return d;
      const [removed] = zones.splice(srcIdx, 1);
      zones.splice(tgtIdx, 0, removed);
      return { ...d, zones };
    });
  }

  function onDragEnd() {
    dragSrcId.current = null;
    setDragOverId(null);
  }

  // ── Save / delete ───────────────────────────────────────────────────────────
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* ── Left: editor column ── */}
      <div className="flex flex-col gap-4">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeftIcon size={16} /> All templates
        </button>

        {/* Template name */}
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">Template name</span>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>

        {/* Label size */}
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

        {/* Formatting toolbar */}
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 transition-all ${
            selected
              ? 'border-line bg-surface'
              : 'pointer-events-none border-transparent bg-transparent opacity-30'
          }`}
        >
          {/* Font family */}
          <select
            value={selected?.fontFamily ?? 'Inter'}
            onChange={(e) => patchSelected({ fontFamily: e.target.value })}
            className="h-8 max-w-[130px] rounded-lg border border-line-2 bg-white px-2 text-sm"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          {/* Font size */}
          <select
            value={selected?.fontSize ?? 16}
            onChange={(e) => patchSelected({ fontSize: Number(e.target.value) })}
            className="h-8 w-[70px] rounded-lg border border-line-2 bg-white px-2 text-sm"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}pt
              </option>
            ))}
          </select>

          {/* Bold */}
          <button
            onClick={() => patchSelected({ bold: !selected?.bold })}
            className={`h-8 w-8 rounded-lg border text-sm font-bold transition-colors ${
              selected?.bold
                ? 'border-brand bg-brand-tint text-brand-deep'
                : 'border-line-2 bg-white text-ink-3 hover:border-line'
            }`}
          >
            B
          </button>

          {/* Alignment */}
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              title={a}
              onClick={() => patchSelected({ align: a })}
              className={`h-8 w-8 rounded-lg border text-xs transition-colors ${
                selected?.align === a
                  ? 'border-brand bg-brand-tint text-brand-deep'
                  : 'border-line-2 bg-white text-ink-3 hover:border-line'
              }`}
            >
              {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
            </button>
          ))}

          <div className="h-5 w-px shrink-0 bg-line-2" />

          {/* Zone type */}
          <select
            value={selected?.type ?? 'field'}
            onChange={(e) => {
              const type = e.target.value as 'field' | 'static';
              patchSelected(
                type === 'field' ? { type, field: 'fullName' } : { type, staticText: '' },
              );
            }}
            className="h-8 rounded-lg border border-line-2 bg-white px-2 text-sm"
          >
            <option value="field">Field</option>
            <option value="static">Text</option>
          </select>

          {/* Field picker */}
          {selected?.type === 'field' && (
            <>
              <datalist id="zone-field-keys">
                <option value="fullName" />
                {fieldKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <input
                list="zone-field-keys"
                value={selected.field ?? ''}
                onChange={(e) => patchSelected({ field: e.target.value })}
                placeholder="field key"
                className="h-8 min-w-[110px] rounded-lg border border-line-2 bg-white px-2.5 text-sm outline-none focus:border-brand"
              />
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {/* Hide */}
            <button
              onClick={() => patchSelected({ hidden: !selected?.hidden })}
              className={`h-8 rounded-lg border px-2.5 text-xs transition-colors ${
                selected?.hidden
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-line-2 bg-white text-ink-3 hover:border-line'
              }`}
            >
              {selected?.hidden ? 'Hidden' : 'Hide'}
            </button>
            {/* Delete zone */}
            <button
              onClick={() => selected && removeZone(selected.id)}
              className="h-8 rounded-lg border border-line-2 bg-white px-2.5 text-xs text-danger transition-colors hover:border-danger"
            >
              Delete
            </button>
          </div>
        </div>

        {/* WYSIWYG badge surface */}
        <div
          className="relative w-full cursor-default select-none overflow-hidden rounded-xl border-2 border-dashed border-line bg-white"
          style={{ aspectRatio: `${draft.labelWidthMm} / ${draft.labelHeightMm}` }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {draft.zones.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-faint">No zones yet — add one below</span>
            </div>
          ) : (
            <div className="flex h-full flex-col items-stretch justify-center gap-0.5 px-3 py-2">
              {draft.zones.map((z, i) => {
                const norm = normalizeLegacyZone(z);
                const isSelected = z.id === selectedId;
                const isDragTarget = z.id === dragOverId;

                const zoneStyle = {
                  fontSize: `${norm.fontSize}pt`,
                  fontWeight: norm.bold ? 700 : 400,
                  textAlign: norm.align as 'left' | 'center' | 'right',
                  fontFamily: norm.fontFamily,
                };

                const sampleText =
                  norm.type === 'static'
                    ? (norm.staticText ?? '')
                    : norm.field === 'fullName'
                      ? SAMPLE_ATTENDEE.fullName
                      : (SAMPLE_ATTENDEE.extra[norm.field ?? ''] ?? norm.field ?? '');

                return (
                  <div
                    key={z.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, z.id)}
                    onDragOver={(e) => onDragOver(e, z.id)}
                    onDrop={(e) => onDrop(e, z.id)}
                    onDragEnd={onDragEnd}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(z.id);
                    }}
                    className={`group relative flex cursor-pointer items-center rounded px-1 py-0.5 transition-all ${
                      isSelected ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-line'
                    } ${z.hidden ? 'opacity-30' : ''} ${isDragTarget ? 'border-t-2 border-brand' : ''}`}
                  >
                    {/* Drag handle */}
                    <span className="mr-1 shrink-0 cursor-grab text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100">
                      ⠿
                    </span>

                    {/* Zone content */}
                    {norm.type === 'static' && isSelected ? (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="min-w-0 flex-1 outline-none"
                        style={zoneStyle}
                        onBlur={(e) =>
                          patchZone(z.id, {
                            staticText: e.currentTarget.textContent ?? '',
                          })
                        }
                      >
                        {norm.staticText}
                      </div>
                    ) : (
                      <span className="block min-w-0 flex-1 truncate" style={zoneStyle}>
                        {sampleText || (
                          <span
                            className="text-faint italic"
                            style={{ fontFamily: norm.fontFamily }}
                          >
                            {norm.type === 'static' ? 'empty text' : norm.field}
                          </span>
                        )}
                      </span>
                    )}

                    {/* Up/down arrows — keyboard fallback for drag */}
                    {isSelected && (
                      <div className="ml-1 flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveZone(i, -1);
                          }}
                          className="px-1 text-xs text-muted hover:text-ink"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveZone(i, 1);
                          }}
                          className="px-1 text-xs text-muted hover:text-ink"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add zone buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => addZone(newFieldZone())}
            className="h-9 rounded-full px-4 text-sm"
          >
            + Add field zone
          </Button>
          <Button
            variant="outline"
            onClick={() => addZone(newStaticZone())}
            className="h-9 rounded-full px-4 text-sm"
          >
            + Add text zone
          </Button>
        </div>

        {/* Save / delete */}
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

      {/* ── Right: print simulation column ── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <span className="mb-2 block font-display text-xs font-semibold uppercase tracking-wide text-faint">
          Print simulation · 203 DPI
        </span>
        <canvas
          ref={canvasRef}
          className="w-full rounded-md border border-line shadow-[0_8px_24px_rgba(0,0,0,.06)]"
          style={{ imageRendering: 'pixelated' }}
        />
        <p className="mt-2 text-xs text-faint">
          Pixel-accurate preview. Updates 150 ms after each change.
        </p>
      </div>
    </div>
  );
}
