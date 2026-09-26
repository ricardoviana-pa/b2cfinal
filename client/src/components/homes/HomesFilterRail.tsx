/**
 * The catalogue rail — one hairline row that holds everything a guest does
 * to the list: house or apartment, space, price, features, sort, list/map.
 *
 * Typographic on purpose: text triggers on a rule, panels that open under
 * them, a small gold mark when something is set. No chips, no coloured
 * pills; the cards below are the colour. Mobile folds the same panels into
 * a bottom sheet with a live "Show N homes" button.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Check, ChevronDown, LayoutGrid, Map as MapIcon, SlidersHorizontal, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import type { SortOption } from '@/lib/types';
import {
  BEDROOM_BANDS, BUDGET_BANDS, FEATURE_KEYS, HOME_KINDS, SLEEPS_STEPS,
  type BedroomBand, type BudgetBand, type FacetCounts, type FeatureKey, type HomeFacets, type HomeKind,
} from '@/lib/homeFacets';

export type CatalogueView = 'list' | 'map';

export interface FilterToken { key: string; label: string; onRemove: () => void }

export interface HomesFilterRailProps {
  facets: HomeFacets;
  /** "Sleeps at least" (the `guests` query param). 0 = any. */
  guests: number;
  counts: FacetCounts;
  resultLabel: ReactNode;
  pending?: boolean;
  activeCount: number;
  view: CatalogueView;
  onView: (v: CatalogueView) => void;
  sortOptions: { value: SortOption; label: string }[];
  onKind: (kind: HomeKind) => void;
  onBedrooms: (band: BedroomBand) => void;
  onBudget: (band: BudgetBand) => void;
  onFeature: (key: FeatureKey, on: boolean) => void;
  onSleeps: (guests: number) => void;
  onSort: (sort: SortOption) => void;
  onClearAll: () => void;
  /** Active filters, in reading order, each removable on its own. */
  tokens: FilterToken[];
}

const dim = (count: number) => (count === 0 ? 'opacity-40' : '');

/* ───────────── small parts ───────────── */

function KindSwitch({ value, counts, onChange, className = '' }: {
  value: HomeKind; counts: Record<HomeKind, number>; onChange: (k: HomeKind) => void; className?: string;
}) {
  const { t } = useTranslation();
  const label: Record<HomeKind, string> = {
    houses: t('homes.filters.housesVillas', 'Houses & villas'),
    apartments: t('homes.filters.apartments', 'Apartments'),
    all: t('homes.filters.all', 'All'),
  };
  return (
    <div role="group" aria-label={t('homes.filters.type', 'Home type')} className={`flex items-stretch ${className}`}>
      {HOME_KINDS.map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(k)}
            className={`relative flex items-center font-body text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
              active ? 'text-pa-dark' : 'text-pa-stone hover:text-pa-dark'
            } ${dim(counts[k])}`}
          >
            {label[k]}
            {active && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-pa-gold" />}
          </button>
        );
      })}
    </div>
  );
}

function MenuTrigger({ label, value, open }: { label: string; value?: string | null; open?: boolean }) {
  return (
    <span className={`relative inline-flex items-center gap-1.5 font-body text-[13px] leading-none transition-colors ${
      value ? 'text-pa-dark font-medium' : 'text-pa-dark hover:text-pa-gold-aa'
    }`}>
      <span className="truncate max-w-[180px]">{value || label}</span>
      <ChevronDown className={`w-3 h-3 shrink-0 text-pa-stone transition-transform ${open ? 'rotate-180' : ''}`} />
      {value && <span aria-hidden className="absolute -top-1 -right-2.5 h-1.5 w-1.5 rounded-full bg-pa-gold" />}
    </span>
  );
}

function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={`px-5 py-4 ${first ? '' : 'border-t border-pa-sand'}`}>
      <p className="eyebrow mb-3">{title}</p>
      {children}
    </div>
  );
}

function OptionRow({ label, count, selected, onClick, box }: {
  label: string; count?: number; selected: boolean; onClick: () => void; box?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between h-10 font-body text-[13px] text-pa-dark ${dim(count ?? 1)}`}
    >
      <span className="flex items-center gap-3">
        {box && (
          <span aria-hidden className={`flex h-[15px] w-[15px] items-center justify-center rounded-[3px] border transition-colors ${
            selected ? 'bg-pa-dark border-pa-dark' : 'border-pa-stone/50'
          }`}>
            {selected && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
          </span>
        )}
        <span className={selected ? 'font-medium' : ''}>{label}</span>
      </span>
      <span className="flex items-center gap-2">
        {typeof count === 'number' && <span className="font-body text-[11px] tabular-nums text-pa-stone">{count}</span>}
        {!box && selected && <Check className="w-3.5 h-3.5 text-pa-gold" strokeWidth={2} />}
      </span>
    </button>
  );
}

/** A row of equal cells on one rule: the right shape for a short numeric scale. */
function Strip<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string; count: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="grid rounded-lg border border-pa-sand overflow-hidden divide-x divide-pa-sand" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center justify-center h-12 font-body transition-colors ${
              active ? 'bg-pa-dark text-white' : `bg-white text-pa-dark hover:bg-pa-warm ${dim(o.count)}`
            }`}
          >
            <span className="text-[13px] leading-none">{o.label}</span>
            <span className={`mt-1 text-[10px] leading-none tabular-nums ${active ? 'text-white/60' : 'text-pa-stone'}`}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ViewSwitch({ value, onChange, compact }: { value: CatalogueView; onChange: (v: CatalogueView) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const items: { v: CatalogueView; icon: typeof MapIcon; label: string }[] = [
    { v: 'list', icon: LayoutGrid, label: t('homes.filters.list', 'List') },
    { v: 'map', icon: MapIcon, label: t('homes.filters.map', 'Map') },
  ];
  return (
    <div role="group" aria-label={t('homes.filters.view', 'View')} className="inline-flex items-center rounded-full border border-pa-sand bg-white p-0.5">
      {items.map(({ v, icon: Icon, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            aria-label={label}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 h-8 rounded-full font-body text-[12px] transition-colors ${compact ? 'px-2.5' : 'px-3.5'} ${
              active ? 'bg-pa-dark text-white' : 'text-pa-earth hover:text-pa-dark'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── panels (shared by popovers and the sheet) ───────────── */

function usePanelCopy() {
  const { t } = useTranslation();
  const bedroomLabel = (b: BedroomBand) => (b === 'all' ? t('homes.filters.any', 'Any') : b.replace('-', '–'));
  const budgetLabel = (b: BudgetBand) => (b === 'all' ? t('homes.filters.any', 'Any') : t(`homes.filters.${b}`));
  const featureLabel: Record<FeatureKey, string> = {
    pool: t('homes.filters.pool', 'Pool'),
    heatedPool: t('homes.filters.heatedPool', 'Heated pool'),
    jacuzzi: t('homes.filters.jacuzzi', 'Jacuzzi'),
    seaView: t('homes.filters.seaView', 'Sea view'),
    pets: t('property.petFriendly', 'Pet-friendly'),
  };
  return { t, bedroomLabel, budgetLabel, featureLabel };
}

function SpacePanel({ facets, guests, counts, onBedrooms, onSleeps, first }: Pick<HomesFilterRailProps, 'facets' | 'guests' | 'counts' | 'onBedrooms' | 'onSleeps'> & { first?: boolean }) {
  const { t, bedroomLabel } = usePanelCopy();
  return (
    <>
      <Section title={t('searchUx.bedrooms', 'Bedrooms')} first={first}>
        <Strip<BedroomBand>
          value={facets.bedrooms}
          onChange={onBedrooms}
          options={(['all', ...BEDROOM_BANDS] as BedroomBand[]).map((b) => ({ value: b, label: bedroomLabel(b), count: counts.bedrooms[b] }))}
        />
      </Section>
      <Section title={t('homes.filters.sleeps', 'Sleeps')}>
        <Strip<number>
          value={SLEEPS_STEPS.includes(guests) ? guests : 0}
          onChange={onSleeps}
          options={[0, ...SLEEPS_STEPS].map((n) => ({ value: n, label: n === 0 ? t('homes.filters.any', 'Any') : `${n}+`, count: counts.sleeps[n] ?? 0 }))}
        />
      </Section>
    </>
  );
}

function PricePanel({ facets, counts, onBudget, first }: Pick<HomesFilterRailProps, 'facets' | 'counts' | 'onBudget'> & { first?: boolean }) {
  const { t, budgetLabel } = usePanelCopy();
  return (
    <Section title={t('homes.filters.perNight', 'Per night')} first={first}>
      {(['all', ...BUDGET_BANDS] as BudgetBand[]).map((b) => (
        <OptionRow key={b} label={budgetLabel(b)} count={counts.budget[b]} selected={facets.budget === b} onClick={() => onBudget(b)} />
      ))}
      <p className="caption mt-2">{t('homes.filters.priceNote', 'From-prices per night. Add dates for exact totals.')}</p>
    </Section>
  );
}

function FeaturesPanel({ facets, counts, onFeature, first }: Pick<HomesFilterRailProps, 'facets' | 'counts' | 'onFeature'> & { first?: boolean }) {
  const { t, featureLabel } = usePanelCopy();
  return (
    <Section title={t('homes.filters.features', 'Features')} first={first}>
      {FEATURE_KEYS.map((k) => (
        <OptionRow key={k} box label={featureLabel[k]} count={counts.features[k]} selected={facets.features[k]} onClick={() => onFeature(k, !facets.features[k])} />
      ))}
    </Section>
  );
}

function SortPanel({ facets, sortOptions, onSort, first }: Pick<HomesFilterRailProps, 'facets' | 'sortOptions' | 'onSort'> & { first?: boolean }) {
  const { t } = useTranslation();
  return (
    <Section title={t('homes.filters.sort', 'Sort')} first={first}>
      {sortOptions.map((o) => (
        <OptionRow key={o.value} label={o.label} selected={facets.sort === o.value} onClick={() => onSort(o.value)} />
      ))}
    </Section>
  );
}

/* ───────────── the rail ───────────── */

export default function HomesFilterRail(props: HomesFilterRailProps) {
  const { facets, guests, counts, resultLabel, pending, activeCount, view, onView, sortOptions, onKind, onClearAll, tokens } = props;
  const { t, bedroomLabel, budgetLabel, featureLabel } = usePanelCopy();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'space' | 'price' | 'features' | 'sort' | null>(null);

  const spaceValue = [
    facets.bedrooms !== 'all' ? t('homes.filters.bedroomsCount', { range: bedroomLabel(facets.bedrooms), defaultValue: '{{range}} bedrooms' }) : null,
    guests > 0 ? t('homes.filters.sleepsAtLeast', { count: guests, defaultValue: '{{count}}+ guests' }) : null,
  ].filter(Boolean).join(' · ') || null;
  const priceValue = facets.budget !== 'all' ? budgetLabel(facets.budget).replace(/\s*\/\s*.*$/, '') : null;
  const onFeatures = FEATURE_KEYS.filter((k) => facets.features[k]);
  const featuresValue = onFeatures.length === 0 ? null
    : onFeatures.length === 1 ? featureLabel[onFeatures[0]]
    : t('homes.filters.featuresCount', { count: onFeatures.length, defaultValue: '{{count}} features' });
  const sortLabel = sortOptions.find((o) => o.value === facets.sort)?.label ?? '';

  const menu = (key: NonNullable<typeof openMenu>, label: string, value: string | null, panel: ReactNode, align: 'start' | 'end' = 'start') => (
    <Popover open={openMenu === key} onOpenChange={(o) => setOpenMenu(o ? key : null)}>
      <PopoverTrigger asChild>
        <button type="button" className="h-[52px] outline-none focus-visible:ring-2 focus-visible:ring-pa-gold rounded-sm">
          <MenuTrigger label={label} value={value} open={openMenu === key} />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={0} className="w-[300px] rounded-xl border border-pa-sand bg-white p-0 shadow-[0_24px_60px_-20px_rgba(26,26,24,0.28)]">
        {panel}
      </PopoverContent>
    </Popover>
  );

  const trail = tokens.length > 0 && (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 py-2.5 caption">
      {tokens.map((tk) => (
        <button key={tk.key} type="button" onClick={tk.onRemove} className="inline-flex items-center gap-1 text-pa-dark hover:text-pa-gold-aa" aria-label={`${t('homes.filters.remove', 'Remove')}: ${tk.label}`}>
          <span>{tk.label}</span>
          <X className="w-3 h-3 text-pa-stone" />
        </button>
      ))}
      <button type="button" onClick={onClearAll} className="text-pa-stone underline underline-offset-4 hover:text-pa-dark">
        {t('homes.filters.clearAll', 'Clear all')}
      </button>
    </div>
  );

  const status = (
    <span className="inline-flex items-center gap-2 font-body text-[13px] text-pa-stone-aa whitespace-nowrap" role="status">
      {pending && <span aria-hidden className="w-3 h-3 rounded-full border-2 border-pa-gold border-t-transparent animate-spin" />}
      {resultLabel}
    </span>
  );

  return (
    <div data-testid="plp-filters">
      {/* Desktop and tablet: one rule, everything on it. */}
      <div className="hidden md:block border-y border-pa-sand">
        <div className="flex items-stretch gap-x-7 min-h-[52px]">
          <KindSwitch value={facets.kind} counts={counts.kind} onChange={onKind} className="gap-x-6" />
          <div className="flex items-stretch gap-x-6 pl-7 border-l border-pa-sand">
            {menu('space', t('homes.filters.space', 'Space'), spaceValue, <><SpacePanel {...props} first /></>)}
            {menu('price', t('homes.filters.price', 'Price'), priceValue, <PricePanel {...props} first />)}
            {menu('features', t('homes.filters.features', 'Features'), featuresValue, <FeaturesPanel {...props} first />)}
          </div>
          <div className="ml-auto flex items-center gap-x-5">
            {status}
            <span aria-hidden className="h-4 w-px bg-pa-sand" />
            {menu('sort', t('homes.filters.sort', 'Sort'), null, <SortPanel {...props} first />, 'end')}
            <ViewSwitch value={view} onChange={onView} />
          </div>
        </div>
      </div>
      <div className="hidden md:block">{trail}</div>

      {/* Phone: the type switch on its own rule, then filters · count · view. */}
      <div className="md:hidden">
        <KindSwitch value={facets.kind} counts={counts.kind} onChange={onKind} className="justify-between border-y border-pa-sand h-11 [&>button]:px-0" />
        <div className="flex items-center justify-between gap-3 h-12 border-b border-pa-sand">
          <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex items-center gap-2 h-full font-body text-[13px] text-pa-dark">
            <SlidersHorizontal className="w-4 h-4" />
            <span>{t('conversion.filters', 'Filters')}</span>
            {activeCount > 0 && <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pa-dark px-1 text-[10px] font-medium text-white">{activeCount}</span>}
          </button>
          {status}
          <ViewSwitch value={view} onChange={onView} compact />
        </div>
        {trail}

        <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
          <DrawerContent className="bg-pa-cream max-h-[90dvh] rounded-t-2xl">
            <div className="px-5 pt-2 pb-2">
              <DrawerTitle className="font-display text-2xl font-normal text-pa-dark text-left">{t('conversion.filters', 'Filters')}</DrawerTitle>
              <DrawerDescription className="caption text-left mt-0.5">{t('conversion.filterIntro')}</DrawerDescription>
            </div>
            <div className="overflow-y-auto">
              <SortPanel {...props} first />
              <SpacePanel {...props} />
              <PricePanel {...props} />
              <FeaturesPanel {...props} />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-pa-sand bg-pa-cream px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={onClearAll} className="min-h-11 font-body text-[13px] text-pa-stone underline underline-offset-4">
                {t('homes.filters.clearAll', 'Clear all')}
              </button>
              <button type="button" onClick={() => setSheetOpen(false)} className="btn-primary min-h-11">
                {t('filters.showHomes', { count: counts.kind[facets.kind] })}
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
