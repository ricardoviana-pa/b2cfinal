/* ==========================================================================
   GUIDE SECTION — a section of a destination guide that opens on tap on a
   phone (design audit, decisão E15 do Ricardo, 20 nov 2026)
   ==========================================================================

   The Minho guide was 30 phone screens long, the Algarve 24 and the older
   template (fr, es, it, de, nl, sv, fi) 23. Below 768 px each long section
   now shows its heading (and its intro line) and opens when the heading is
   tapped. From 768 px nothing changes: every section is open and its heading
   is a plain heading.

   How it stays honest for search, for assistive technology and for desktop:

   - The body is ALWAYS rendered, on the server and on the client, open or
     closed. Closing only sets data-open="false" on the section, and one rule
     in GuideSection.css hides the body for `screen and (max-width: 767.98px)`.
     There is no conditional rendering and no display:none on a wider screen
     or on paper.
   - The heading keeps its element, its level and its text: the text is in
     the HTML once. The control is a real <button> right after the heading,
     named by it (aria-labelledby), with aria-expanded and aria-controls. On
     a phone it is stretched over the whole heading, so the heading is the
     tap target. From 768 px, and in print, it is display:none: no chevron,
     no pointer, nothing to focus, nothing announced.
   - State starts the same on the server and in the browser (defaultOpen);
     the URL is only read in an effect, after hydration.

   Anchors: a page opened with #hash, a hashchange, or a click on an in-page
   link (the chapter row, "Explore this moment") that points at a section, or
   at something inside it, opens that section. The browser still does the
   scrolling, exactly as before; the section only scrolls by itself when the
   target sat inside a closed body and so had no position to scroll to.

   Use, in any guide template:

     <GuideSection id="destination-taste" className="minho-section">
       …the kicker… <GuideHeading>The heading</GuideHeading> …the intro line…
       <GuideBody>…what opens…</GuideBody>
     </GuideSection>

   The hero, the first section and the homes (the way to a booking) are not
   GuideSections: on a phone they are always open.
   ========================================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { ChevronDown } from "lucide-react";
import "./GuideSection.css";

interface GuideSectionState {
  open: boolean;
  toggle: () => void;
  /** id of the heading text: the button's accessible name. */
  titleId: string;
  /** Every body this heading opens, for aria-controls. */
  controls: string;
  bodyId: (part?: string) => string;
}

const GuideSectionContext = createContext<GuideSectionState | null>(null);

const classes = (...names: Array<string | undefined>) =>
  names.filter(Boolean).join(" ");

/** "#destination-taste" → "destination-taste"; "" and "#" → null. */
export function anchorId(hash: string | null | undefined): string | null {
  if (!hash || !hash.startsWith("#") || hash.length < 2) return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

export interface GuideSectionProps extends Omit<
  ComponentPropsWithoutRef<"section">,
  "id"
> {
  /** The section's own anchor, when it has one. */
  id?: string;
  /** Anchors that lead here but sit on an element around the section. */
  anchors?: readonly string[];
  /** Bodies besides the main one (`<GuideBody part="…">`). */
  parts?: readonly string[];
  /** Open on a phone before any tap. From 768 px every section is open. */
  defaultOpen?: boolean;
}

export function GuideSection({
  id,
  anchors,
  parts,
  defaultOpen = false,
  className,
  children,
  ...rest
}: GuideSectionProps) {
  const generated = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const base = id ?? `guide-${generated}`;
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement>(null);
  const scrollAfterOpen = useRef<HTMLElement | null>(null);
  const anchorList = anchors?.join(" ") ?? "";
  const partList = parts?.join(" ") ?? "";

  useEffect(() => {
    const leadHere = anchorList ? anchorList.split(" ") : [];
    const reveal = (target: string | null) => {
      const section = sectionRef.current;
      if (!target || !section) return;
      const element = document.getElementById(target);
      const mine =
        leadHere.includes(target) || (!!element && section.contains(element));
      if (!mine) return;
      // Inside a closed body the target has no box, so the browser had
      // nowhere to scroll: do it once the body is back. Only then: a target
      // with a position is the browser's to scroll to, as it always was.
      const closed = section.dataset.open === "false";
      const boxless = !!element && element.getClientRects().length === 0;
      scrollAfterOpen.current = closed && boxless ? element : null;
      setOpen(true);
    };
    const fromUrl = () => reveal(anchorId(window.location.hash));
    const fromClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest('a[href^="#"]')
          : null;
      if (link) reveal(anchorId(link.getAttribute("href")));
    };
    fromUrl();
    window.addEventListener("hashchange", fromUrl);
    document.addEventListener("click", fromClick);
    return () => {
      window.removeEventListener("hashchange", fromUrl);
      document.removeEventListener("click", fromClick);
    };
  }, [anchorList]);

  useEffect(() => {
    const target = scrollAfterOpen.current;
    if (!open || !target) return;
    scrollAfterOpen.current = null;
    // No options: the page's own scroll-behavior applies (smooth, or instant
    // with prefers-reduced-motion), and the target's scroll-margin.
    target.scrollIntoView();
  }, [open]);

  const toggle = useCallback(() => setOpen(value => !value), []);
  const state = useMemo<GuideSectionState>(() => {
    const bodyId = (part?: string) =>
      part ? `${base}-body-${part}` : `${base}-body`;
    return {
      open,
      toggle,
      titleId: `${base}-title`,
      controls: [undefined, ...(partList ? partList.split(" ") : [])]
        .map(bodyId)
        .join(" "),
      bodyId,
    };
  }, [base, open, partList, toggle]);

  return (
    <GuideSectionContext.Provider value={state}>
      <section
        {...rest}
        ref={sectionRef}
        id={id}
        className={classes("guide-section", className)}
        data-open={open ? "true" : "false"}
      >
        {children}
      </section>
    </GuideSectionContext.Provider>
  );
}

/**
 * The section's heading: the same element, level and text as before (h2
 * unless `as` says otherwise), with the phone-only button right after it.
 * The button is a sibling, not a child, so a screen reader meets one heading
 * and then one button named after it. Outside a GuideSection this is just
 * the heading.
 */
export function GuideHeading({
  as: Heading = "h2",
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"h2">, "id"> & { as?: "h2" | "h3" }) {
  const section = useContext(GuideSectionContext);
  if (!section)
    return (
      <Heading {...rest} className={className}>
        {children}
      </Heading>
    );
  return (
    <div className="guide-heading">
      <Heading {...rest} id={section.titleId} className={className}>
        {children}
      </Heading>
      <button
        type="button"
        className="guide-toggle"
        aria-expanded={section.open}
        aria-controls={section.controls}
        aria-labelledby={section.titleId}
        onClick={section.toggle}
      >
        <ChevronDown size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * What opens. Always in the HTML; hidden only on a phone while the section
 * is closed (GuideSection.css). Keep the heading and the intro line outside.
 */
export function GuideBody({
  part,
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"div">, "id"> & { part?: string }) {
  const section = useContext(GuideSectionContext);
  return (
    <div
      {...rest}
      id={section?.bodyId(part)}
      className={classes("guide-body", className)}
    >
      {children}
    </div>
  );
}
