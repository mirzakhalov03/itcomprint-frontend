# Roadshow Badge Printing — Layout Contract

You are designing the UI. **Be creative and make it visually appealing.** You own all visual decisions: colors, type, spacing, motion, components.

This file defines only **what must exist and how it must behave**. Honor every item below; design everything else freely. Do not add features that aren't listed.

**Context:** internal kiosk tool used by staff at a live event to find an attendee and print their name badge. Speed and clarity under pressure matter more than decoration. It is used on a laptop/desktop in a browser.

---

## Required regions

1. **Header**
   - App title.
   - Printer status indicator with three states: `Preview mode`, `Printer connected`, `Printer not connected`.
   - A **Connect printer** action — visible only in the not-connected state.

2. **Event bar**
   - **Event selector** (choose the active event; each option shows its attendee count).
   - **Import spreadsheet** action.

3. **Attendee workspace** (only when an event is selected)
   - **Search field** (filters attendees live).
   - **Status filter** with three choices: all, printed, not printed.
   - **Batch print** action for selected attendees.
   - **Attendee list**, where each entry has:
     - a select control,
     - the attendee name,
     - their extra fields,
     - a status indicator showing printed vs. not printed and the reprint count,
     - a **Print** action that becomes **Reprint** once already printed.

4. **Empty state** — shown when no event is selected.

5. **Badge preview area** (appears after printing in preview mode)
   - One preview card per badge, sized to a real **80mm × 60mm** badge, name in uppercase.
   - A **Download** action per badge and a **Clear all** action.

6. **Import dialog** (overlay)
   - File picker.
   - Event name input.
   - Event date input.
   - A selector to pick which spreadsheet column is the attendee name.
   - A count of detected rows.
   - **Cancel** and **Import** actions; Import stays disabled until the form is valid.

---

## Behavioral rules

- The **Print** action must be unmistakable and easy to hit fast — it is the primary task.
- Printed vs. not-printed status must be readable at a glance across a long list.
- Search and filter must feel instant.
- The badge preview card must visually match real badge proportions (80×60), not a generic card.

Design the rest. Surprise me.
