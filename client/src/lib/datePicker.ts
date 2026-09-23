/* ==========================================================================
   DATE PICKER — open the native calendar from anywhere in the field
   --------------------------------------------------------------------------
   A native <input type="date"> only opens its calendar when the click lands on
   the little indicator glyph at the right edge. Everywhere else in the box the
   click just moves focus, which reads as "the field is broken".

   Two halves fix it, and both are needed:
   - CSS (`.pa-date-hit`) stretches ::-webkit-calendar-picker-indicator over the
     whole field, so the native path works before React has hydrated.
   - This helper, wired to the field's click, covers Firefox (no such
     pseudo-element) and anything the CSS misses.
   ========================================================================== */

/** Open an input's native date picker. Safe to call on every click. */
export function openDatePicker(input: HTMLInputElement | null | undefined): void {
  if (!input || input.disabled || input.readOnly) return;
  try {
    input.showPicker?.();
  } catch {
    // Either the browser already opened the picker from the (now full-width)
    // indicator, or it has no showPicker. Both mean the guest is fine.
  }
}

/** Open the date picker of the first date input inside `container`. */
export function openDatePickerWithin(container: Element | null | undefined): void {
  openDatePicker(container?.querySelector<HTMLInputElement>('input[type="date"]'));
}
