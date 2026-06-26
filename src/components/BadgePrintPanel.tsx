import { useState } from 'react';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { useTemplates, useUpdateTemplate, useTemplateFieldKeys } from '../hooks/useTemplates';
import { renderBadgeLines } from '../printer/buildBadgeTSPL';
import { BadgePreview } from './BadgePreview';
import { Button } from './ui/Button';
import { CloseIcon, PrinterIcon } from './icons';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import type { Attendee, AppEvent, BadgeTemplate, TemplateZone } from '../types';

type Tab = 'fields' | 'template';

export function BadgePrintPanel({
  attendee,
  event,
  onClose,
}: {
  attendee: Attendee;
  event: AppEvent;
  onClose: () => void;
}) {
  const { data: templates = [] } = useTemplates();
  const { data: fieldKeys = [] } = useTemplateFieldKeys();
  const template =
    templates.find((t) => t._id === event.templateId) ?? templates.find((t) => t.isDefault);

  const print = usePrintAttendee();
  const updateTemplate = useUpdateTemplate();

  const [tab, setTab] = useState<Tab>('fields');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<BadgeTemplate | null>(null);

  // Initialize draft when template resolves (render-time update avoids useEffect cascade)
  if (template && !draft) {
    setDraft({ ...template, zones: template.zones.map((z) => ({ ...z })) });
  }

  const effectiveTemplate = draft ?? template ?? null;

  // Attendee with field overrides applied — used for both preview and printing
  function mergedAttendee() {
    const extraOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([k]) => k !== '__fullName__'),
    );
    return {
      ...attendee,
      fullName: overrides['__fullName__'] ?? attendee.fullName,
      extra: { ...attendee.extra, ...extraOverrides },
    };
  }

  const lines = effectiveTemplate ? renderBadgeLines(mergedAttendee(), effectiveTemplate) : [];
  const visibleZones = effectiveTemplate?.zones.filter((z) => !z.hidden) ?? [];

  // ── Field override helpers ──────────────────────────────────────────────────

  function getFieldValue(zone: TemplateZone): string {
    const key = zone.field === 'fullName' ? '__fullName__' : zone.field;
    return (
      overrides[key] ??
      (zone.field === 'fullName' ? attendee.fullName : (attendee.extra[zone.field] ?? ''))
    );
  }

  function setFieldValue(zone: TemplateZone, val: string) {
    const key = zone.field === 'fullName' ? '__fullName__' : zone.field;
    setOverrides((prev) => ({ ...prev, [key]: val }));
  }

  // ── Template draft helpers ──────────────────────────────────────────────────

  function patchZone(id: string, patch: Partial<TemplateZone>) {
    setDraft((d) =>
      d ? { ...d, zones: d.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) } : d,
    );
  }

  function moveZone(index: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const zones = [...d.zones];
      const target = index + dir;
      if (target < 0 || target >= zones.length) return d;
      [zones[index], zones[target]] = [zones[target], zones[index]];
      return { ...d, zones };
    });
  }

  function addZone() {
    const zone: TemplateZone = {
      id: crypto.randomUUID(),
      field: 'fullName',
      fontSize: 3,
      bold: false,
      align: 'center',
      hidden: false,
    };
    setDraft((d) => (d ? { ...d, zones: [...d.zones, zone] } : d));
  }

  async function saveTemplate() {
    if (!draft) return;
    try {
      await updateTemplate.mutateAsync({
        id: draft._id,
        payload: {
          name: draft.name,
          labelWidthMm: draft.labelWidthMm,
          labelHeightMm: draft.labelHeightMm,
          zones: draft.zones,
        },
      });
      toast('Template saved');
    } catch (e) {
      toast(errMessage(e, 'Save failed'));
    }
  }

  // ── Print ───────────────────────────────────────────────────────────────────

  async function handlePrint() {
    if (!effectiveTemplate) return toast('No template selected');
    try {
      await print.mutateAsync({
        attendee: mergedAttendee(),
        eventName: event.name,
        template: effectiveTemplate,
      });
      onClose();
    } catch (e) {
      toast(errMessage(e, 'Printer not connected'));
    }
  }

  const isReprint = attendee.printStatus === 'printed';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[.1em] text-faint">
            Badge preview
          </p>
          <h3 className="truncate font-display text-base font-bold leading-snug text-ink">
            {attendee.fullName}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-ink"
        >
          <CloseIcon size={15} />
        </button>
      </div>

      {/* Live badge preview */}
      <div className="border-b border-line-3 bg-surface-2 px-5 py-5">
        {effectiveTemplate ? (
          <BadgePreview
            lines={lines}
            widthMm={effectiveTemplate.labelWidthMm}
            heightMm={effectiveTemplate.labelHeightMm}
            className="mx-auto max-w-[240px] shadow-[0_8px_24px_rgba(0,0,0,.10)]"
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line-2 text-sm text-faint">
            No template selected
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-line">
        {(['fields', 'template'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-2.5 font-display text-[13px] font-semibold capitalize transition-colors ${
              tab === t
                ? 'border-brand text-brand-deep'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'fields' ? (
          visibleZones.length > 0 ? (
            <div className="flex flex-col gap-3">
              {visibleZones.map((z) => (
                <label key={z.id} className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold capitalize text-muted">
                    {z.field === 'fullName' ? 'Full Name' : z.field}
                  </span>
                  <input
                    value={getFieldValue(z)}
                    onChange={(e) => setFieldValue(z, e.target.value)}
                    className="h-9 rounded-lg border border-line-2 bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-brand"
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">No visible zones in this template.</p>
          )
        ) : draft ? (
          <div className="flex flex-col gap-4">
            {/* Label dimensions */}
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[12px] font-semibold text-muted">Width (mm)</span>
                <input
                  type="number"
                  value={draft.labelWidthMm}
                  onChange={(e) => setDraft({ ...draft, labelWidthMm: Number(e.target.value) })}
                  className="h-9 rounded-lg border border-line-2 bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[12px] font-semibold text-muted">Height (mm)</span>
                <input
                  type="number"
                  value={draft.labelHeightMm}
                  onChange={(e) => setDraft({ ...draft, labelHeightMm: Number(e.target.value) })}
                  className="h-9 rounded-lg border border-line-2 bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
            </div>

            {/* Zones */}
            <datalist id="panel-field-keys">
              <option value="fullName" />
              {fieldKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>

            <div className="flex flex-col gap-2">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[.1em] text-faint">
                Zones
              </span>
              {draft.zones.map((z, i) => (
                <div key={z.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      list="panel-field-keys"
                      value={z.field}
                      onChange={(e) => patchZone(z.id, { field: e.target.value })}
                      placeholder="field"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-white px-2.5 text-sm outline-none"
                    />
                    <select
                      value={z.fontSize}
                      onChange={(e) => patchZone(z.id, { fontSize: Number(e.target.value) })}
                      className="h-8 rounded-lg border border-line-2 bg-white px-1.5 text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          S{n}
                        </option>
                      ))}
                    </select>
                    <select
                      value={z.align}
                      onChange={(e) =>
                        patchZone(z.id, { align: e.target.value as TemplateZone['align'] })
                      }
                      className="h-8 rounded-lg border border-line-2 bg-white px-1.5 text-sm"
                    >
                      <option value="left">L</option>
                      <option value="center">C</option>
                      <option value="right">R</option>
                    </select>
                    <label className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-muted">
                      <input
                        type="checkbox"
                        checked={z.bold}
                        onChange={(e) => patchZone(z.id, { bold: e.target.checked })}
                        className="accent-brand"
                      />
                      Bold
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-muted">
                      <input
                        type="checkbox"
                        checked={z.hidden}
                        onChange={(e) => patchZone(z.id, { hidden: e.target.checked })}
                        className="accent-brand"
                      />
                      Hide
                    </label>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-0.5">
                    <button
                      onClick={() => moveZone(i, -1)}
                      disabled={i === 0}
                      className="px-2 text-sm text-muted hover:text-ink disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveZone(i, 1)}
                      disabled={i === draft.zones.length - 1}
                      className="px-2 text-sm text-muted hover:text-ink disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() =>
                        setDraft({ ...draft, zones: draft.zones.filter((x) => x.id !== z.id) })
                      }
                      className="px-2 text-sm text-danger hover:opacity-70"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addZone}
                className="mt-1 h-9 self-start rounded-full border border-line-2 px-4 font-display text-[13px] font-semibold text-muted hover:border-brand hover:text-brand-deep"
              >
                + Add zone
              </button>
            </div>

            <Button
              variant="outline"
              onClick={saveTemplate}
              disabled={updateTemplate.isPending}
              className="h-10 rounded-xl text-sm"
            >
              {updateTemplate.isPending ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-faint">Loading template…</p>
        )}
      </div>

      {/* Print action */}
      <div className="border-t border-line px-5 py-4">
        <Button
          onClick={handlePrint}
          disabled={print.isPending || !effectiveTemplate}
          className="h-11 w-full gap-2 rounded-xl text-sm tracking-[.01em] shadow-[0_6px_16px_rgba(111,162,63,.26)]"
        >
          <PrinterIcon size={15} />
          {print.isPending ? 'Printing…' : isReprint ? 'Reprint Badge' : 'Print Badge'}
        </Button>
      </div>
    </div>
  );
}
