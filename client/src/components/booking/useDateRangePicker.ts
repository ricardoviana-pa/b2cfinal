import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectionPhase } from "@/lib/dateRangeSelection";

/**
 * Open/close and focus for a Check-in | Check-out field pair over an inline
 * AvailabilityCalendar. Each field opens the calendar on its own date —
 * clicking Check-out on a chosen stay moves just the departure. Clicking the
 * active field again, clicking outside, or Escape closes it.
 */
export function useDateRangePicker(hasCheckIn: boolean) {
  const [open, setOpen] = useState(false);
  const [rawPhase, setPhase] = useState<SelectionPhase>("check-in");
  const phase: SelectionPhase = rawPhase === "check-out" && !hasCheckIn ? "check-in" : rawPhase;
  const containerRef = useRef<HTMLDivElement>(null);

  const openField = useCallback((field: SelectionPhase) => {
    const target: SelectionPhase = field === "check-out" && !hasCheckIn ? "check-in" : field;
    if (open && phase === target) {
      setOpen(false);
      return;
    }
    setPhase(target);
    setOpen(true);
  }, [open, phase, hasCheckIn]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || containerRef.current?.contains(target)) return;
      // The phone picker is a portal dialog over us, outside the container.
      // (A dialog that holds the widget — the PDP's mobile drawer — is not.)
      const dialog = target.closest('[role="dialog"]');
      if (dialog && containerRef.current && !dialog.contains(containerRef.current)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, phase, setPhase, openField, close, containerRef };
}
