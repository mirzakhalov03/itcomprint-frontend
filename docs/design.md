# Design Spec — Roadshow Badge Printing

Synthesis of `layout.md` (structure) + `brand.md` (identity) into concrete, buildable design decisions. Tokens and component specs are opinionated and final; micro-craft (exact easing curves, illustration detail, motif placement) is the implementer's to perfect.

---

## 0. North star

A **calm, fast kiosk tool** operated by staff standing at a live event. Every decision serves: _find a person → confirm status at a glance → print → move on_, in seconds, under pressure. Branded and crafted, never decorative at the cost of speed.

**Three principles**

1. **Glanceable status.** Printed vs. not-printed must be legible across a 200-row list from a meter away.
2. **The primary action is obvious.** Print is the loudest interactive element on any row.
3. **Branded chrome, legible canvas.** The brand's drama lives in the frame; the data lives on a quiet, high-legibility surface.

### Key design decision — light work surface, dark branded frame

`brand.md` calls for a charcoal-dominant canvas. That's right for marketing, wrong for a data-dense operational tool scanned fast (long lists, possible event glare, sustained reading). **Decision:** charcoal + green own the **app frame** (top bar, side accents, empty states, dialogs' backdrops, badge preview stage); the **attendee workspace sits on a light surface** for legibility and speed. This honors the identity where it has impact and protects the operator where it matters. _(If a fully dark workspace is preferred for room ambiance, invert §2 surface tokens — structure and motif stay identical.)_

---

## 1. Color tokens

Confirm hexes against official brand assets; values below are calibrated from the brand screenshots.

| Token             | Hex       | Use                                                                  |
| ----------------- | --------- | -------------------------------------------------------------------- |
| `--green-500`     | `#6CBE45` | Primary brand green — primary actions, active states, printed status |
| `--green-600`     | `#4FA431` | Pressed/hover-deep, gradient anchor                                  |
| `--green-700`     | `#2E9E33` | Deep green — gradient end, dark-on-green text edge                   |
| `--green-300`     | `#8FD46A` | Glow/focus ring, subtle highlights                                   |
| `--green-50`      | `#EEF8E7` | Light-mode green tint — chips, selected rows                         |
| `--ink-900`       | `#1A1A1A` | Frame canvas (top bar, dialog backdrop, badge stage)                 |
| `--ink-800`       | `#242424` | Raised dark elements                                                 |
| `--ink-700`       | `#2F2F2F` | Dark borders / motif lines on dark                                   |
| `--surface`       | `#FFFFFF` | Cards, table, dialogs                                                |
| `--surface-muted` | `#F6F7F5` | Workspace background, input fills                                    |
| `--border`        | `#E6E8E6` | Hairlines, dividers, input borders                                   |
| `--text`          | `#1A1A1A` | Primary text on light                                                |
| `--text-muted`    | `#6B7280` | Secondary text, extra fields, placeholders                           |
| `--text-on-dark`  | `#FFFFFF` | Text on frame/green                                                  |
| `--amber-500`     | `#E8A33D` | Not-printed accent (warm, "needs action")                            |
| `--danger-500`    | `#E0533D` | Errors, printer-not-connected                                        |

**Discipline:** green is an accent, not a fill. Depth comes from layering `green-500 → green-700` and green-on-ink — never one flat block.

---

## 2. Type

Geometric, confident. **Headings:** Space Grotesk or Sora (bold, slightly uppercase for top-level). **Body/UI:** Inter. **Badge name:** the heaviest geometric weight available, uppercase.

| Role                 | Size / weight            | Notes                               |
| -------------------- | ------------------------ | ----------------------------------- |
| App title            | 20 / 700                 | Uppercase, tracked +2%              |
| Section / event name | 18 / 600                 |                                     |
| Attendee name        | 16 / 600                 | The anchor of each row              |
| Extra fields         | 13 / 400, `--text-muted` | Comma-joined, single line, truncate |
| Body / controls      | 14 / 500                 |                                     |
| Pills / meta         | 12 / 600                 | Uppercase for status                |
| Badge preview name   | clamp 28–44 / 800        | Uppercase, auto-fit to card         |

---

## 3. Foundations

- **Grid:** 8px base. Workspace max-width ~1120px, centered.
- **Radius:** `--r-sm 8`, `--r-md 12`, `--r-lg 16` (cards/dialogs), pills fully rounded.
- **Elevation:** light, single soft shadow on cards/dialogs (`0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)`). No heavy drops.
- **Hit targets:** ≥ 40px tall for every interactive element (kiosk, fast taps). Print button ≥ 44px.
- **Focus:** 2px `--green-300` ring, 2px offset, on every focusable element. Never remove.

---

## 4. Signature motif

The logo's **node-and-branch / network** language is the through-line. Apply subtly:

- A faint connected-node constellation in the **top bar** and **empty state**, low opacity on ink.
- **Hexagon / faceted** clip on the empty-state illustration and the badge-preview stage backdrop.
- Selected/active states may carry a single hairline node accent — never busy.
- Rule: motif is texture and edge, never foreground. If it competes with a name or a button, it's too strong.

---

## 5. Components (mapped to `layout.md`)

### 5.1 Header — frame, `--ink-900`, full-bleed, ~64px

- Left: logo mark + app title (`--text-on-dark`).
- Faint node constellation behind, `green-700` at ~8% opacity.
- Right: **printer status pill** + **Connect** (conditional).

**Printer status pill** — three explicit states:
| State | Visual |
|---|---|
| `Preview mode` | ink-800 pill, `green-500` dot, white text |
| `Printer connected` | `green-500` fill, white text, solid dot |
| `Printer not connected` | transparent pill, `danger-500` dot + text, 1px danger border |

**Connect printer** (only when not connected): solid `green-500` button, white text, hover `green-600`. This is the _only_ place an action lives in the dark frame.

### 5.2 Event bar — on `--surface-muted`, below header, ~72px

- **Event selector:** pill-shaped dropdown, white fill, `--border`. Each option: event name + a muted count chip (`green-50` bg, `green-700` text) e.g. `148`.
- **Import spreadsheet:** secondary button — white fill, `--border`, leading upload glyph. Sits right of the selector.

### 5.3 Attendee workspace — white card on muted bg, `--r-lg`

Toolbar row (sticky on scroll):

- **Search:** grows to fill, leading magnifier, `--surface-muted` fill, instant filter. Placeholder "Search attendees…".
- **Status filter:** segmented control — `All · Printed · Not printed`. Active segment `green-500`, white text; rest muted.
- **Batch print:** appears/enables only when ≥1 row selected; shows count: `Print 6 badges`. Solid `green-500`.

**Attendee row** (anatomy, ~56px, divider hairlines):

```
[ ✓ ]   NAME (16/600)              [ status pill ]      [ Print / Reprint ]
        role · company (13 muted)
```

- **Select** checkbox left; green when checked.
- **Name** anchor; extra fields muted beneath, truncated.
- **Status pill** (glanceable — see §6).
- **Action button**, right-aligned, the loudest thing on the row:
  - Not printed → **Print** — solid `green-500`, white, ≥44px.
  - Printed → **Reprint** — quieter: white fill, `green-600` text + border (deliberately calmer so unprinted rows draw the eye first).
- Row hover: `green-50` wash. Selected: `green-50` + 2px left `green-500` edge.

### 5.4 Empty state (no event selected)

Centered on muted bg. Hexagon/node illustration in greens on a soft ink panel. One line: "Select or import an event to begin." Primary **Import spreadsheet** button beneath. This is a moment to let the brand breathe.

### 5.5 Badge preview tray (preview mode, after printing)

- Appears as a **dark stage** strip (`--ink-900`, node texture) so badges pop like physical objects.
- **Badge card: exactly 80×60 proportion (4:3).** White, crisp 1px edge, name **uppercase, centered, auto-fit** (clamp 28–44). This must read as a real badge, not a UI card.
- Per card: **Download** (ghost, white text on ink). Tray header: count + **Clear all** (ghost).

### 5.6 Import dialog (overlay)

- Backdrop: `--ink-900` at 55%, blurred.
- Panel: white, `--r-lg`, max ~520px, generous padding.
- Title "Import event spreadsheet".
- Fields in order: file picker (dashed dropzone, green on hover) → event name → event date → **name-column selector** → muted "{n} rows detected · other columns kept for search".
- Footer: **Cancel** (ghost) · **Import** (solid `green-500`, disabled until valid + during submit shows "Importing…").

---

## 6. Status semantics (the most important visual system)

Printed vs. not-printed is the operator's core signal. Make them **opposite in weight, not just hue** (color-blind safe):

| State               | Pill                                                                               | Row feel                                  |
| ------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| **Not printed**     | Outline pill, `--amber-500` text + dot, transparent fill — reads as "open / to do" | Full-contrast name, loud Print button     |
| **Printed**         | Solid `green-50` fill, `green-700` text, check glyph, e.g. `Printed ✓`             | Slightly receded; Reprint button is quiet |
| **Reprinted (n>1)** | Same green pill + count `Printed ×2`                                               | count in `green-700`                      |

Never rely on hue alone — fill vs. outline + glyph carry the meaning too.

---

## 7. Motion

Fast, functional, never blocking the operator.

- Filter/search results: 120ms cross-fade, no layout jank.
- Row print success: brief `green-300` pulse on the status pill (~300ms) then settle to printed — the operator's confirmation.
- Dialog: 160ms scale-from-98% + fade. Backdrop fades in.
- Badge card enters tray: 200ms rise + fade.
- Respect `prefers-reduced-motion`: drop transforms, keep opacity.

---

## 8. Accessibility & resilience

- **Contrast:** all text ≥ WCAG AA. Green-on-white text must use `green-700`, not `green-500` (the bright green fails on white for text — use it for fills only).
- **Keyboard:** full tab order; Enter prints the focused row; `/` focuses search. Every control has a visible focus ring.
- **States to design, not forget:** loading (skeleton rows), empty-after-filter ("No matches"), error toast (`danger-500`), printer-not-connected blocking a print attempt (inline hint, not a dead click).
- **Density:** comfortable by default; rows must stay scannable at 200 entries — no decoration inside rows.

---

## 9. Responsive

Primary target **laptop/desktop (≥1024px)** — kiosk reality. Below that: status filter collapses to a dropdown, action buttons stay full-size (touch), event bar stacks. Never shrink the Print button.

---

## 10. Definition of done (design)

- Printed vs not-printed readable in a half-second across a full list. ✓
- Print is unmistakably the primary action on every row. ✓
- Identity present (green, ink frame, node/shape motif) without slowing the operator. ✓
- Badge preview reads as a true 80×60 badge. ✓
- Every interactive element ≥40px, AA contrast, visible focus. ✓
