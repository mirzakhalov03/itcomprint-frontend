import { useMemo, useState, type RefObject } from 'react';
import { usePrintAttendee, useUnprintAttendee } from '../hooks/usePrintAttendee';
import { useUpdateTemplate, useTemplateFieldKeys } from '../hooks/useTemplates';
import { useEventTemplate } from '../hooks/useEventTemplate';
import { useBadgeCanvas } from '../hooks/useBadgeCanvas';
import { normalizeLegacyZone, FONT_SIZES } from '../printer/renderBadge';
import { Button } from './ui/Button';
import { NumberField } from './ui/NumberField';
import { DoublePrintToggle } from './DoublePrintToggle';
import { CloseIcon, PrinterIcon } from './icons';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import type { Attendee, AppEvent, BadgeTemplate, TemplateZone } from '../types';

type Tab = 'fields' | 'template';

export function BadgePrintPanel({
  attendee,
  event,
  onClose,
  onPrinted,
  printRef,
}: {
  attendee: Attendee;
  event: AppEvent;
  onClose: () => void;
  /** Fires after a successful print; the kiosk returns focus to search for the next attendee. */
  onPrinted?: () => void;
  /** Autofocused on open, so a second Enter prints. */
  printRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { template } = useEventTemplate(event);
  const { data: fieldKeys = [] } = useTemplateFieldKeys();

  const print = usePrintAttendee();
  const unprint = useUnprintAttendee();
  const updateTemplate = useUpdateTemplate();

  const [tab, setTab] = useState<Tab>('fields');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<BadgeTemplate | null>(null);

  // Re-seed on template switch or remote save so printing never uses a stale layout (render-phase update).
  const templateKey = template ? `${template._id}:${template.updatedAt ?? ''}` : null;
  const [draftKey, setDraftKey] = useState<string | null>(null);
  if (template && templateKey !== draftKey) {
    setDraftKey(templateKey);
    setDraft({ ...template, zones: template.zones.map(normalizeLegacyZone) });
  }

  const effectiveTemplate = draft ?? template ?? null;

  // Attendee with field overrides applied — memoized so the canvas preview only re-renders on real changes
  const merged = useMemo(() => {
    const { __fullName__: fullName, ...extraOverrides } = overrides;
    return {
      ...attendee,
      fullName: fullName ?? attendee.fullName,
      extra: { ...attendee.extra, ...extraOverrides },
    };
  }, [attendee, overrides]);

  const { canvasRef } = useBadgeCanvas(merged, effectiveTemplate, 120);

  const visibleZones = effectiveTemplate
    ? effectiveTemplate.zones
        .map(normalizeLegacyZone)
        .filter((z) => !z.hidden && z.type === 'field')
    : [];

  // ── Field override helpers ──────────────────────────────────────────────────

  function getFieldValue(zone: TemplateZone): string {
    const key = zone.field === 'fullName' ? '__fullName__' : (zone.field ?? '');
    return (
      overrides[key] ??
      (zone.field === 'fullName' ? attendee.fullName : (attendee.extra[zone.field ?? ''] ?? ''))
    );
  }

  function setFieldValue(zone: TemplateZone, val: string) {
    const key = zone.field === 'fullName' ? '__fullName__' : (zone.field ?? '');
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
      type: 'field',
      field: 'fullName',
      fontFamily: 'Inter',
      fontSize: 16,
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
        attendee: merged,
        eventName: event.name,
        template: effectiveTemplate,
      });
      onPrinted?.();
    } catch (e) {
      toast(errMessage(e, 'Printer not connected'));
    }
  }

  async function handleUnprint() {
    try {
      await unprint.mutateAsync(attendee);
      toast(`${attendee.fullName} marked as not printed`);
    } catch (e) {
      toast(errMessage(e, 'Could not mark as not printed'));
    }
  }

  const isReprint = attendee.printStatus === 'printed';
  const busy = print.isPending || unprint.isPending;

  // flex-1 + min-h-0 (not h-full) so it fills the desktop column and shrinks inside the mobile sheet.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
          aria-label="Close"
          className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-ink"
        >
          <CloseIcon size={15} />
        </button>
      </div>

      {/* Live badge preview */}
      <div className="flex shrink-0 justify-center border-b border-line-3 bg-surface-2 px-5 py-4 lg:py-5">
        {effectiveTemplate ? (
          <canvas
            ref={canvasRef}
            aria-label={`Badge preview for ${merged.fullName}`}
            className="h-auto w-full max-w-[240px] rounded-md lg:max-w-[280px] border border-line bg-white shadow-[0_8px_24px_rgba(0,0,0,.10)]"
            style={{
              aspectRatio: `${effectiveTemplate.labelWidthMm} / ${effectiveTemplate.labelHeightMm}`,
            }}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'fields' ? (
          <div className="flex flex-col gap-4">
            {visibleZones.length > 0 ? (
              <div className="flex flex-col gap-3">
                {visibleZones.map((z) => (
                  <label key={z.id} className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold capitalize text-muted">
                      {z.field === 'fullName' ? 'Full Name' : (z.field ?? '')}
                    </span>
                    <input
                      value={getFieldValue(z)}
                      onChange={(e) => setFieldValue(z, e.target.value)}
                      className="h-10 rounded-lg border border-line-2 bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-brand lg:h-9"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">No visible zones in this template.</p>
            )}
            <DoublePrintToggle />
          </div>
        ) : draft ? (
          <div className="flex flex-col gap-4">
            {/* Label dimensions */}
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[12px] font-semibold text-muted">Width (mm)</span>
                <NumberField
                  value={draft.labelWidthMm}
                  onChange={(v) => setDraft({ ...draft, labelWidthMm: v })}
                  className="h-9 rounded-lg border border-line-2 bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[12px] font-semibold text-muted">Height (mm)</span>
                <NumberField
                  value={draft.labelHeightMm}
                  onChange={(v) => setDraft({ ...draft, labelHeightMm: v })}
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
                      value={z.field ?? ''}
                      onChange={(e) => patchZone(z.id, { field: e.target.value })}
                      placeholder="field"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-white px-2.5 text-sm outline-none"
                    />
                    <select
                      value={z.fontSize}
                      onChange={(e) => patchZone(z.id, { fontSize: Number(e.target.value) })}
                      className="h-8 rounded-lg border border-line-2 bg-white px-1.5 text-sm"
                    >
                      {FONT_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}pt
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
      <div className="flex shrink-0 gap-2 border-t border-line px-5 pb-safe pt-4">
        <Button
          ref={printRef}
          autoFocus
          onClick={handlePrint}
          disabled={busy || !effectiveTemplate}
          className="h-12 flex-1 gap-2 rounded-xl lg:h-11 text-sm tracking-[.01em] shadow-[0_6px_16px_rgba(111,162,63,.26)]"
        >
          <PrinterIcon size={15} />
          {print.isPending ? 'Printing…' : isReprint ? 'Reprint Badge' : 'Print Badge'}
          <kbd className="ml-1 hidden rounded border border-white/40 px-1.5 font-sans text-[11px] font-semibold leading-4.5 lg:inline">
            ↵
          </kbd>
        </Button>
        {isReprint && (
          <Button
            variant="secondary"
            onClick={handleUnprint}
            disabled={busy}
            title="Printed by mistake? Count this attendee as not arrived again."
            className="h-12 shrink-0 rounded-xl px-4 lg:h-11 text-[13px]"
          >
            {unprint.isPending ? 'Saving…' : 'Mark unprinted'}
          </Button>
        )}
      </div>
    </div>
  );
}
