# Portugal Active — Design System

> **Source of truth** for replicating the exact visual language of the Portugal Active website.
> Visual references: Aesop, Aman Resorts, Sublime Comporta.
> Last updated: March 2026.

---

## 1. Colors

The palette is intentionally restrained — warm neutrals with a single gold accent. Every surface, text shade, and interactive element draws from these eight core values.

### Brand Palette

| Token | Hex | RGB | Role |
|---|---|---|---|
| `pa-cream` | `#FAFAF7` | `250, 250, 247` | Page background, primary-foreground |
| `pa-warm` | `#F5F1EB` | `245, 241, 235` | Secondary/muted background, hover surfaces |
| `pa-sand` | `#E8E4DC` | `232, 228, 220` | Borders, dividers, input borders, scrollbar |
| `pa-stone` | `#9E9A90` | `158, 154, 144` | Placeholder text, disabled states, icons |
| `pa-earth` | `#6B6860` | `107, 104, 96` | Body text, secondary text |
| `pa-dark` | `#1A1A18` | `26, 26, 24` | Headings, primary buttons, foreground |
| `pa-gold` | `#8B7355` | `139, 115, 85` | Accent, overlines, ring/focus, gold buttons |
| `pa-gold-light` | `#C4A87C` | `196, 168, 124` | Decorative accents, selection highlight, chart |

### Semantic Mapping

| Semantic Token | Value | Usage |
|---|---|---|
| `--background` | `#FAFAF7` | Page background |
| `--foreground` | `#1A1A18` | Default text color |
| `--card` | `#FFFFFF` | Card surfaces |
| `--card-foreground` | `#1A1A18` | Card text |
| `--popover` | `#FFFFFF` | Dropdown/popover surfaces |
| `--popover-foreground` | `#1A1A18` | Dropdown text |
| `--primary` | `#1A1A18` | Primary buttons, active states |
| `--primary-foreground` | `#FAFAF7` | Text on primary |
| `--secondary` | `#F5F1EB` | Secondary surfaces |
| `--secondary-foreground` | `#1A1A18` | Text on secondary |
| `--muted` | `#F5F1EB` | Muted backgrounds |
| `--muted-foreground` | `#6B6860` | Muted text |
| `--accent` | `#F5F1EB` | Accent surfaces |
| `--accent-foreground` | `#1A1A18` | Text on accent |
| `--destructive` | `#DC2626` | Error/danger states |
| `--destructive-foreground` | `#FAFAF7` | Text on destructive |
| `--border` | `#E8E4DC` | Default border color |
| `--input` | `#E8E4DC` | Input border color |
| `--ring` | `#8B7355` | Focus ring color |

### Interactive State Colors

| State | Value | Context |
|---|---|---|
| Button hover (primary) | `#333330` | Slightly lighter than `pa-dark` |
| Button active (primary) | `#0D0D0C` | Darker press state |
| Gold hover | `#7A6548` | Darker gold for hover |
| Selection highlight | `#C4A87C` text on `#1A1A18` | `::selection` pseudo-element |
| White overlay (hero) | `rgba(255,255,255,0.12)` | Ghost-light button hover |
| Dark overlay (hero) | `rgba(0,0,0,0.55)` to `transparent` | Hero gradient overlay |

### Chart Colors

```css
--chart-1: #8B7355;   /* Gold */
--chart-2: #C4A87C;   /* Light gold */
--chart-3: #6B6860;   /* Earth */
--chart-4: #9E9A90;   /* Stone */
--chart-5: #E8E4DC;   /* Sand */
```

---

## 2. Typography

Two typefaces form the entire typographic system. **Playfair Display** handles all editorial headlines with a serif warmth. **Inter** handles everything else — body, labels, buttons, navigation — with optical sizing for crispness at small sizes.

### Font Loading

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet" />
```

### Font Stacks

```css
--font-display: 'Playfair Display', Georgia, serif;
--font-body: 'Inter', system-ui, -apple-system, sans-serif;
```

### Headline Scale (Playfair Display)

All headlines use `font-weight: 400` and `letter-spacing: -0.01em` by default.

| Class | Mobile (375px) | Tablet (768px) | Desktop (1200px) | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| `headline-xl` | `2.25rem` (36px) | fluid | `4.25rem` (68px) | `1.08` | `-0.02em` |
| `headline-lg` | `1.75rem` (28px) | fluid | `3rem` (48px) | `1.12` | `-0.015em` |
| `headline-md` | `1.375rem` (22px) | fluid | `2rem` (32px) | `1.2` | `-0.01em` |
| `headline-sm` | `1.125rem` (18px) | fluid | `1.5rem` (24px) | `1.25` | `normal` |

Fluid sizing uses `clamp()`:

```css
.headline-xl { font-size: clamp(2.25rem, 5vw, 4.25rem); }
.headline-lg { font-size: clamp(1.75rem, 3.5vw, 3rem); }
.headline-md { font-size: clamp(1.375rem, 2.5vw, 2rem); }
.headline-sm { font-size: clamp(1.125rem, 2vw, 1.5rem); }
```

### HTML Heading Defaults

| Element | Mobile | Tablet (768px) | Desktop (1200px) | Line-height |
|---|---|---|---|---|
| `h1` | `2.25rem` | `3.25rem` | `4rem` | `1.1` |
| `h2` | `1.75rem` | `2.5rem` | `3rem` | `1.15` |
| `h3` | `1.375rem` | `1.75rem` | `2rem` | `1.2` |
| `h4` | `1.125rem` | `1.25rem` | `1.25rem` | `1.3` |

### Body Text Scale (Inter)

| Class | Size | Weight | Line-height | Color |
|---|---|---|---|---|
| `body-lg` | `clamp(1rem, 1.2vw, 1.125rem)` | `300` | `1.7` | `#6B6860` |
| `body-md` | `0.9375rem` (15px) | `300` | `1.7` | `#6B6860` |
| `body-sm` | `0.8125rem` (13px) | `300` | `1.6` | `#6B6860` |
| `<p>` default | `1rem` (16px) | `300` | `1.7` | `#6B6860` |

### Label & Caption Styles

| Style | Size | Weight | Letter-spacing | Transform | Color |
|---|---|---|---|---|---|
| `overline` | `0.6875rem` (11px) | `500` | `0.12em` | `uppercase` | `#8B7355` |
| `btn-text` | `0.6875rem` (11px) | `500` | `0.12em` | `uppercase` | inherit |
| Badge text | `0.625rem` (10px) | `600` | `0.12em` | `uppercase` | varies |
| Dropdown label | `0.625rem` (10px) | `500` | `0.06em` | `uppercase` | `#9E9A90` |

### Inline Font Sizes (Tailwind/Pixel)

The most frequently used inline sizes across components, ordered by usage frequency:

| Tailwind Class | Pixel Value | Typical Usage |
|---|---|---|
| `text-[13px]` | 13px | Navigation links, card metadata, body small |
| `text-[11px]` | 11px | CTA button labels, overlines, badges |
| `text-[12px]` | 12px | Captions, sub-labels, fine print |
| `text-[10px]` | 10px | Micro labels, dropdown section headers |
| `text-[14px]` | 14px | Card titles, USP titles, form labels |
| `text-[15px]` | 15px | Body text in modals, descriptions |
| `text-sm` | 14px | shadcn/ui components default |
| `text-xs` | 12px | shadcn/ui small text |

### Font Weights Used

| Tailwind Class | Weight | Usage |
|---|---|---|
| `font-light` (300) | 300 | Body paragraphs, descriptions |
| `font-normal` (400) | 400 | Headlines (Playfair), default |
| `font-medium` (500) | 500 | Navigation, labels, buttons, overlines |
| `font-semibold` (600) | 600 | Card titles, badge text, emphasis |
| `font-bold` (700) | 700 | Rare — stat numbers, strong emphasis |

---

## 3. Border Radius

The system uses sharp geometry for brand elements (badges, cards) and full pills for interactive elements (buttons, search bar, avatars).

| Element | Value | Tailwind Class |
|---|---|---|
| **Buttons (all variants)** | `9999px` | `rounded-full` |
| **Search bar** | `9999px` | `rounded-full` |
| **Avatars** | `9999px` | `rounded-full` |
| **Language pills** | `9999px` | `rounded-full` |
| **Cards (shadcn)** | `0.5rem` (8px) | `rounded-lg` |
| **Modals/Dialogs** | `0.375rem` (6px) | `rounded-md` |
| **Inputs (shadcn)** | `0.375rem` (6px) | `rounded-md` |
| **Dropdowns** | `0.375rem` (6px) | `rounded-md` |
| **Badges (tier)** | `0` (none) | No rounding |
| **Property images** | `0` (none) | No rounding |
| **Icon containers** | `0` (none) | No rounding (square) |
| **Scrollbar thumb** | `2px` | `border-radius: 2px` |

### Design Token Values

```css
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius: 0.5rem;       /* 8px — default */
```

---

## 4. Spacing Scale

The spacing system follows Tailwind's 4px base grid. The most commonly used values are documented below, grouped by frequency of use across the codebase.

### Core Spacing Values

| Tailwind | Value | Primary Usage |
|---|---|---|
| `gap-1` / `gap-1.5` | 4px / 6px | Icon-to-text gaps, tight inline elements |
| `gap-2` | 8px | Most common gap — list items, flex children |
| `gap-3` | 12px | Card content gaps, nav item spacing |
| `gap-4` | 16px | Section content gaps, form field spacing |
| `gap-5` | 20px | Card grid gaps, USP bar items |
| `gap-6` | 24px | Desktop nav link spacing, larger grids |
| `gap-8` | 32px | Desktop USP grid columns |

### Padding Patterns

| Pattern | Mobile | Tablet | Desktop | Usage |
|---|---|---|---|---|
| Container horizontal | `1.25rem` (20px) | `2rem` (32px) | `2.5rem` (40px) | `.container` class |
| Section vertical | `4rem` (64px) | `6rem` (96px) | `8rem` (128px) | `.section-padding` |
| Button padding | `0.875rem 2rem` | same | same | All `.btn-*` variants |
| Card content | `px-5 py-3` to `px-6 py-4` | same | same | Card inner content |
| Input padding | `px-3 py-2` | same | same | Form inputs |
| Modal/Drawer | `px-5` to `px-8` | `px-8` to `px-12` | `px-12` | PropertyModal content |

### Margin Patterns

| Pattern | Value | Usage |
|---|---|---|
| Section heading to content | `mb-8` (32px) | After section title blocks |
| Heading to subheading | `mb-3` to `mb-5` | Between headline and body text |
| Paragraph spacing | `mb-4` (16px) | Between paragraphs |
| Overline to headline | `mb-3` (12px) | Overline label above heading |
| Component to component | `mb-6` to `mb-8` | Between major content blocks |
| Fine print | `mt-3` (12px) | Below CTAs, below inputs |

### Container

```css
.container {
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-left: 1.25rem;     /* mobile: 20px */
}
@media (min-width: 768px) {
  .container { padding-left: 2rem; padding-right: 2rem; }     /* 32px */
}
@media (min-width: 1200px) {
  .container { padding-left: 2.5rem; padding-right: 2.5rem; max-width: 1400px; }  /* 40px, capped */
}
```

---

## 5. Shadows

Shadows are used sparingly — the design relies on borders and background shifts rather than heavy elevation. When shadows appear, they use the brand dark color at very low opacity.

| Token | CSS Value | Usage |
|---|---|---|
| **Card hover** | `0 8px 32px rgba(26, 26, 24, 0.08)` | `.pa-card:hover` |
| **Dropdown** | Tailwind `shadow-lg` | Header dropdowns, popovers |
| **Modal overlay** | Tailwind `shadow-2xl` | PropertyModal drawer |
| **Header (scrolled)** | No shadow — uses `border-b border-[#E8E4DC]/50` | Scrolled header |
| **Subtle elevation** | Tailwind `shadow-sm` | Form elements, small cards |
| **Medium elevation** | Tailwind `shadow-md` | Floating elements |
| **No shadow** | Tailwind `shadow-none` | Flat elements, reset states |

### Tailwind Shadow Reference

```css
shadow-xs:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
shadow-sm:  0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
shadow:     0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
```

---

## 6. Buttons

All buttons share a pill shape (`border-radius: 9999px`), uppercase text with wide letter-spacing, and a minimum touch target of 48px. The font is always Inter at `0.75rem` (12px), weight `500`.

### Shared Properties

```css
/* All .btn-* variants share: */
display: inline-flex;
align-items: center;
justify-content: center;
gap: 0.5rem;
font-family: var(--font-body);        /* Inter */
font-size: 0.75rem;                   /* 12px */
font-weight: 500;
letter-spacing: 0.12em;
text-transform: uppercase;
padding: 0.875rem 2rem;               /* 14px 32px */
min-height: 48px;
border-radius: 9999px;
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
cursor: pointer;
white-space: nowrap;
line-height: 1;
```

### Variants

| Variant | Background | Text | Border | Hover BG | Hover Text | Active BG |
|---|---|---|---|---|---|---|
| **Primary** (`.btn-primary`) | `#1A1A18` | `#FAFAF7` | `#1A1A18` | `#333330` | `#FAFAF7` | `#0D0D0C` |
| **Ghost** (`.btn-ghost`) | `transparent` | `#1A1A18` | `#1A1A18` | `#1A1A18` | `#FAFAF7` | — |
| **White** (`.btn-white`) | `#FFFFFF` | `#1A1A18` | `#FFFFFF` | `#F5F1EB` | `#1A1A18` | — |
| **Ghost Light** (`.btn-ghost-light`) | `transparent` | `rgba(255,255,255,0.85)` | `rgba(255,255,255,0.35)` | `rgba(255,255,255,0.12)` | `#FFFFFF` | — |
| **Gold** (`.btn-gold`) | `#8B7355` | `#FAFAF7` | `#8B7355` | `#7A6548` | `#FAFAF7` | — |

### Disabled State (General)

```css
/* Applied via Tailwind utilities on buttons: */
opacity: 0.5;
cursor: not-allowed;
pointer-events: none;
```

### CTA Button Pattern (Hero)

```html
<!-- Primary CTA -->
<a class="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full
          bg-white text-[#1A1A18] text-[11px] font-semibold hover:bg-[#F5F1EB]
          transition-colors" style="letter-spacing: 1.5px">
  EXPLORE OUR PROPERTIES <ArrowRight />
</a>

<!-- Secondary CTA -->
<a class="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full
          border border-white/50 text-white text-[11px] font-semibold
          hover:bg-white/10 transition-colors" style="letter-spacing: 1.5px">
  TALK TO OUR CONCIERGE <ArrowRight />
</a>
```

---

## 7. Inputs & Forms

Form elements use Inter, maintain a 16px minimum font size (prevents iOS zoom), and follow a consistent border/focus pattern.

### Text Input

```css
/* Base input styling */
font-family: var(--font-body);         /* Inter */
font-size: 16px;                       /* Prevents iOS zoom */
height: 2.5rem;                        /* 40px — h-10 */
padding: 0.5rem 0.75rem;              /* py-2 px-3 */
border: 1px solid #E8E4DC;            /* border-input */
border-radius: 0.375rem;              /* rounded-md */
background: transparent;
color: #1A1A18;
transition: border-color 0.2s ease, box-shadow 0.2s ease;
```

### Focus State

```css
/* Focus ring */
outline: 2px solid #8B7355;           /* ring color = gold */
outline-offset: 2px;
border-color: #8B7355;
```

### Placeholder

```css
color: #9E9A90;                        /* pa-stone */
font-weight: 400;
```

### Label

```css
font-family: var(--font-body);
font-size: 0.875rem;                  /* 14px — text-sm */
font-weight: 500;                     /* font-medium */
color: #1A1A18;
margin-bottom: 0.375rem;             /* ~6px */
```

### Error State

```css
border-color: #DC2626;                /* destructive */
color: #DC2626;
font-size: 0.75rem;                   /* 12px */
```

### Search Bar (Hero)

```css
height: 56px;
border-radius: 9999px;
background: #FFFFFF;
box-shadow: shadow-lg;
/* Inner fields: no borders, transparent bg, 13px text */
/* Search button: h-[44px] rounded-full bg-[#1A1A18] text-white */
```

---

## 8. Animations & Transitions

The animation language is deliberately understated — smooth, slow, and barely noticeable. The primary easing curve is a custom cubic-bezier that gives a slight deceleration.

### Primary Easing Curve

```css
cubic-bezier(0.4, 0, 0.2, 1)    /* Used on buttons, cards, dropdowns */
```

### Transition Durations

| Duration | Tailwind | Usage |
|---|---|---|
| `100ms` | `duration-100` | Micro-interactions (rare) |
| `200ms` | `duration-200` | Color changes, opacity, focus rings |
| `300ms` | `duration-300` | Button hovers, dropdown open/close |
| `400ms` | `duration-400` | Card hover transforms |
| `500ms` | `duration-500` | Header bg transition, logo filter, page transitions |
| `700ms` | `duration-700` | Image scale on hover (property cards) |
| `1000ms` | `duration-1000` | Slow ambient animations (rare) |

### Transition Properties

| Tailwind Class | Usage Frequency | Context |
|---|---|---|
| `transition-colors` | Very high (190+) | Links, buttons, text hover states |
| `transition-all` | High (40+) | Cards, buttons, header, dropdowns |
| `transition-transform` | Medium (25+) | Image zoom, chevron rotation |
| `transition-opacity` | Low (8) | Fade effects, overlay transitions |
| `transition-shadow` | Low (5) | Card elevation changes |

### Fade-In Animation (Scroll Reveal)

```css
.fade-in {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.fade-in.visible {
  opacity: 1;
  transform: translateY(0);
}
```

Triggered via `IntersectionObserver` with `threshold: 0.08`.

### Card Hover

```css
.pa-card {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.pa-card:hover {
  border-color: #9E9A90;
  box-shadow: 0 8px 32px rgba(26, 26, 24, 0.08);
  transform: translateY(-2px);
}
```

### Image Zoom on Hover

```css
/* Property card images */
transition: transform 500ms cubic-bezier(0.4, 0, 0.2, 1);
/* On group-hover: */
transform: scale(1.03);
```

### Dropdown Open/Close

```css
transition: all 200ms;
transform-origin: top;
/* Open: */  opacity: 1; transform: scale(1);
/* Closed: */ opacity: 0; transform: scale(0.95); pointer-events: none;
```

### Chevron Rotation

```css
transition: transform 200ms;
/* Open: */ transform: rotate(180deg);
```

### Other Animations

| Animation | Usage |
|---|---|
| `animate-bounce` | Scroll indicator chevron on hero |
| `animate-spin` | Loading spinners |
| `animate-pulse` | Skeleton loading states |
| `animate-in` / `animate-out` | shadcn/ui dialog/sheet enter/exit |

---

## 9. Breakpoints

The system is **mobile-first** starting at 375px. Three breakpoints define the responsive scale.

| Breakpoint | Min-width | Tailwind Prefix | Usage |
|---|---|---|---|
| **Mobile** | `0px` (default) | none | Base styles, single column |
| **Tablet** | `768px` | `md:` | 2-column grids, larger type, wider padding |
| **Desktop** | `1200px` | `lg:` / custom | 3-column grids, max-width container, full nav |

### Additional Tailwind Breakpoints Used

| Prefix | Width | Context |
|---|---|---|
| `sm:` | `640px` | Occasional 2-col on large phones |
| `md:` | `768px` | Primary tablet breakpoint |
| `lg:` | `1024px` | Desktop nav visibility, 3-col grids |
| `xl:` | `1280px` | Rare — extra-wide layouts |

### Container Max-Width

```css
@media (min-width: 1200px) {
  .container { max-width: 1400px; }
}
```

### Header Heights

```css
/* Mobile: */  h-16   /* 64px */
/* Desktop: */ md:h-20 /* 80px */
```

---

## 10. Component Patterns

The five most-used component patterns with their exact class compositions.

### 10.1 Property Card

```html
<article class="group block flex-shrink-0 w-[280px] sm:w-[320px] md:w-auto">
  <!-- Image container -->
  <div class="relative overflow-hidden bg-[#E8E4DC]" style="aspect-ratio: 4/3">
    <img class="w-full h-full object-cover transition-transform duration-500
                group-hover:scale-[1.03]" loading="lazy" />
    <!-- Tier badge (top-left) -->
    <span class="badge-signature absolute top-3 left-3">SIGNATURE</span>
    <!-- Save button (top-right) -->
    <button class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center
                   bg-white/70 backdrop-blur-sm hover:bg-white transition-colors">
      <Heart class="w-4 h-4" />
    </button>
  </div>
  <!-- Content -->
  <div class="pt-4">
    <p class="text-[11px] text-[#9E9A90] mb-1" style="font-family: var(--font-body)">
      Viana do Castelo, Minho Coast
    </p>
    <h3 class="text-[15px] font-semibold text-[#1A1A18] mb-1.5"
        style="font-family: var(--font-display)">
      Property Name
    </h3>
    <p class="text-[13px] text-[#6B6860] mb-3 line-clamp-2"
       style="font-family: var(--font-body); font-weight: 300">
      Description text...
    </p>
    <!-- Meta row -->
    <div class="flex items-center gap-3 text-[12px] text-[#9E9A90]">
      <span class="flex items-center gap-1"><BedDouble class="w-3.5 h-3.5" /> 4</span>
      <span class="flex items-center gap-1"><Users class="w-3.5 h-3.5" /> 8</span>
    </div>
  </div>
</article>
```

### 10.2 Tier Badge

```html
<!-- Signature (premium) -->
<span class="badge-signature">SIGNATURE</span>
<!-- CSS: bg-[#1A1A18] text-[#C4A87C] text-[0.625rem] font-semibold
     tracking-[0.12em] uppercase px-3 py-1.5 -->

<!-- Select (standard) -->
<span class="badge-select">SELECT</span>
<!-- CSS: bg-[#8B7355] text-[#FAFAF7] — same type treatment -->

<!-- New -->
<span class="badge-new">NEW</span>
<!-- CSS: bg-[#FAFAF7] text-[#1A1A18] border border-[#E8E4DC] — same type treatment -->
```

### 10.3 Section Header

```html
<div class="container">
  <!-- Overline -->
  <p class="overline mb-3">Section Label</p>
  <!-- or: text-[12px] font-medium text-[#8B7355] mb-3 tracking-[0.08em] -->

  <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
    <div>
      <h2 class="headline-lg text-[#1A1A18] mb-3">
        Section headline goes here.
      </h2>
      <p class="body-md max-w-2xl">
        Supporting paragraph text, max 3 lines.
      </p>
    </div>
    <!-- Optional CTA aligned right on desktop -->
    <a class="btn-ghost text-[11px]" style="letter-spacing: 1.5px">
      VIEW ALL <ArrowRight />
    </a>
  </div>
</div>
```

### 10.4 Navigation Item (Desktop)

```html
<!-- Standard nav link -->
<a href="/destinations"
   class="text-[13px] font-medium transition-colors tracking-[0.02em]
          text-[#6B6860] hover:text-[#1A1A18]">
  Destinations
</a>

<!-- Active state (transparent header): -->
class="text-white"

<!-- Active state (solid header): -->
class="text-[#1A1A18]"

<!-- Inactive (transparent): -->
class="text-white/75 hover:text-white"

<!-- Inactive (solid): -->
class="text-[#6B6860] hover:text-[#1A1A18]"
```

### 10.5 Modal / Drawer (PropertyModal)

```html
<!-- Backdrop -->
<div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

<!-- Drawer panel -->
<div class="fixed inset-y-0 right-0 z-50 w-full md:w-[560px] lg:w-[640px]
            bg-[#FAFAF7] shadow-2xl overflow-y-auto">

  <!-- Close button -->
  <button class="absolute top-4 right-4 z-10 w-10 h-10 flex items-center
                 justify-center bg-white/80 backdrop-blur-sm rounded-full
                 hover:bg-white transition-colors shadow-sm">
    <X class="w-5 h-5 text-[#1A1A18]" />
  </button>

  <!-- Image gallery (full-width, aspect-[4/3]) -->
  <!-- Content padding: px-5 md:px-8 lg:px-12 -->

  <!-- Stats bar: 4-column grid -->
  <div class="grid grid-cols-4 gap-2 md:gap-4 py-5 border-y border-[#E8E4DC]">
    <div class="flex flex-col items-center text-center gap-1">
      <div class="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#F5F1EB]
                  flex items-center justify-center">
        <Icon class="w-4 h-4 md:w-5 md:h-5 text-[#8B7355]" />
      </div>
      <span class="text-[15px] md:text-[18px] font-semibold text-[#1A1A18]">4</span>
      <span class="text-[10px] md:text-[11px] text-[#9E9A90]">Bedrooms</span>
    </div>
  </div>

  <!-- Sticky CTA bar (mobile) -->
  <div class="fixed bottom-0 left-0 right-0 md:hidden bg-white
              border-t border-[#E8E4DC] px-4 pt-3 pb-5 z-50 safe-area-bottom">
    <!-- Price row + buttons row -->
  </div>
</div>
```

---

## Appendix: Decorative Elements

### Divider Accent

```css
.divider-accent {
  width: 48px;
  height: 2px;
  background-color: #C4A87C;
}
```

### Full-Width Divider

```css
.pa-divider {
  height: 1px;
  background-color: #E8E4DC;
  width: 100%;
}
```

### Aspect Ratios

```css
.aspect-hero     { aspect-ratio: 16 / 9; }
.aspect-card     { aspect-ratio: 4 / 3; }
.aspect-thumb    { aspect-ratio: 1 / 1; }
.aspect-portrait { aspect-ratio: 3 / 4; }
```

### Scrollbar

```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #E8E4DC; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #9E9A90; }
```

### Safe Area (Mobile)

```css
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

### Touch Targets

```css
/* All interactive elements: */
min-height: 44px;
min-width: 44px;

/* Buttons specifically: */
min-height: 48px;
```
