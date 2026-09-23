import { Checkbox } from './ui/Checkbox';
import { Input } from './ui/Input';
import { movePhrase } from '../lib/busRoutes';
import type { BusRoute } from '../types';

/** Rename, regroup and hide the bus routes sync detected for this event. */
export function BusRoutesEditor({
  routes,
  onChange,
}: {
  routes: BusRoute[];
  onChange: (routes: BusRoute[]) => void;
}) {
  const update = (i: number, patch: Partial<BusRoute>) =>
    onChange(routes.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="mt-6">
      <h3 className="font-display text-xs font-semibold text-ink-3">Bus routes</h3>
      <p className="mt-1 text-xs text-faint">
        Found in the sheet's answers. Move a phrase to fix how they're grouped.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {routes.map((route, i) => (
          // Index key: the label is being edited, so keying by it would steal focus per keystroke.
          <div key={i} className="rounded-[10px] border border-line-2 p-3">
            <div className="flex items-center gap-3">
              <span aria-hidden>🚌</span>
              <Input
                value={route.label}
                onChange={(e) => update(i, { label: e.target.value, autoLabel: false })}
                aria-label="Bus name"
                className="min-w-0 flex-1"
              />
              <label className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
                <Checkbox
                  checked={route.hidden}
                  onClick={() => update(i, { hidden: !route.hidden })}
                  label="Hide on kiosk"
                />
                Hide
              </label>
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {route.phrases.map((phrase) => (
                <li key={phrase} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-2">{phrase}</span>
                  {(routes.length > 1 || route.phrases.length > 1) && (
                    <select
                      value=""
                      onChange={(e) =>
                        onChange(
                          movePhrase(
                            routes,
                            phrase,
                            e.target.value === 'new' ? 'new' : Number(e.target.value),
                          ),
                        )
                      }
                      aria-label={`Move "${phrase}"`}
                      className="h-8 rounded-lg border border-line-2 bg-surface px-2 text-xs text-ink-3"
                    >
                      <option value="" disabled>
                        Move to…
                      </option>
                      {routes.map(
                        (r, j) =>
                          j !== i && (
                            <option key={j} value={j}>
                              {r.label || 'Untitled bus'}
                            </option>
                          ),
                      )}
                      {route.phrases.length > 1 && <option value="new">New bus</option>}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
