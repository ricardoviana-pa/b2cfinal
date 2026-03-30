/* ==========================================================================
   ADD TO ITINERARY MODAL — Service-specific fields per Prompt 3
   Each service gets exact form fields as specified.
   ========================================================================== */

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useItinerary } from '@/contexts/ItineraryContext';
import type { Product, ItineraryFieldValue } from '@/lib/types';

interface Props {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'toggle';
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

function getFieldsForProduct(product: Product): FieldDef[] {
  const slug = product.slug;

  if (slug === 'private-chef') {
    return [
      { key: 'mealType', label: 'Meal type', type: 'select', required: true, options: ['Breakfast', 'Lunch', 'Dinner', 'Full day'] },
      { key: 'menuStyle', label: 'Menu style', type: 'select', required: true, options: ['Traditional Portuguese', 'International', 'Tasting menu', 'BBQ'] },
      { key: 'winePairing', label: 'Wine pairing', type: 'select', options: ['Yes', 'No'] },
      { key: 'dietaryRequirements', label: 'Dietary requirements', type: 'textarea', placeholder: 'Allergies, preferences...' },
      { key: 'guests', label: 'Number of guests', type: 'number', required: true, placeholder: '6' },
      { key: 'date', label: 'Preferred date', type: 'date', required: true },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  if (slug === 'in-villa-spa') {
    return [
      { key: 'treatmentType', label: 'Treatment type', type: 'select', required: true, options: ['Deep tissue', 'Hot stone', 'Aromatherapy', 'Couples', 'Facial'] },
      { key: 'duration', label: 'Duration', type: 'select', required: true, options: ['60 min', '90 min', '120 min'] },
      { key: 'people', label: 'Number of people', type: 'number', required: true, placeholder: '2' },
      { key: 'date', label: 'Preferred date', type: 'date', required: true },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  if (slug === 'private-yoga') {
    return [
      { key: 'sessionType', label: 'Session type', type: 'select', required: true, options: ['Hatha', 'Vinyasa', 'Yin', 'Meditation', 'Family'] },
      { key: 'duration', label: 'Duration', type: 'select', required: true, options: ['60 min', '90 min'] },
      { key: 'participants', label: 'Number of participants', type: 'number', required: true, placeholder: '2' },
      { key: 'date', label: 'Preferred date', type: 'date', required: true },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  if (slug === 'personal-training') {
    return [
      { key: 'trainingStyle', label: 'Training style', type: 'select', required: true, options: ['Strength', 'HIIT', 'Mobility', 'Outdoor', 'Family fitness'] },
      { key: 'duration', label: 'Duration', type: 'select', required: true, options: ['60 min', '90 min'] },
      { key: 'participants', label: 'Number of participants', type: 'number', required: true, placeholder: '1' },
      { key: 'date', label: 'Preferred date', type: 'date', required: true },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  if (slug === 'grocery-delivery') {
    return [
      { key: 'dietaryPreferences', label: 'Dietary preferences / restrictions', type: 'textarea', placeholder: 'Organic, gluten-free, vegan...' },
      { key: 'specialRequests', label: 'Special requests', type: 'textarea', placeholder: 'Specific brands, local products...' },
      { key: 'date', label: 'Preferred delivery date', type: 'date', required: true },
    ];
  }

  if (slug === 'babysitter') {
    return [
      { key: 'children', label: 'Number of children', type: 'number', required: true, placeholder: '2' },
      { key: 'ages', label: 'Ages of children', type: 'text', required: true, placeholder: '3 and 5' },
      { key: 'timeOfDay', label: 'Daytime or evening', type: 'select', required: true, options: ['Daytime', 'Evening'] },
      { key: 'date', label: 'Preferred date', type: 'date', required: true },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  if (slug === 'airport-shuttle') {
    return [
      { key: 'flightNumber', label: 'Flight number', type: 'text', placeholder: 'TP1234' },
      { key: 'airport', label: 'Arrival/departure airport', type: 'select', required: true, options: ['Porto OPO', 'Lisbon LIS', 'Faro FAO', 'Vigo VGO'] },
      { key: 'passengers', label: 'Number of passengers', type: 'number', required: true, placeholder: '4' },
      { key: 'luggage', label: 'Luggage pieces', type: 'number', placeholder: '4' },
      { key: 'date', label: 'Preferred date', type: 'date', required: true },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  if (slug === 'daily-housekeeping') {
    return [
      { key: 'tier', label: 'Service tier', type: 'select', required: true, options: ['Quick Refresh (1h)', 'Full Service (2 to 3h)', 'Custom'] },
      { key: 'frequency', label: 'Frequency', type: 'select', required: true, options: ['Daily', 'Every other day', 'One time'] },
      { key: 'time', label: 'Preferred time', type: 'time', required: true },
    ];
  }

  // Adventures and fallback — generic fields
  return [
    { key: 'date', label: 'Preferred date', type: 'date', required: true },
    { key: 'time', label: 'Preferred time', type: 'time' },
    { key: 'guests', label: 'Number of guests', type: 'number', required: true, placeholder: '2' },
    { key: 'notes', label: 'Special requests', type: 'textarea', placeholder: 'Anything we should know...' },
  ];
}

export default function AddToItineraryModal({ product, isOpen, onClose }: Props) {
  const { addItem } = useItinerary();
  const fields = getFieldsForProduct(product);

  const [values, setValues] = useState<Record<string, string | number | string[]>>(() => {
    const init: Record<string, string | number | string[]> = {};
    fields.forEach(f => {
      if (f.type === 'number') init[f.key] = 0;
      else init[f.key] = '';
    });
    return init;
  });

  const handleChange = (key: string, value: string | number | string[]) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldValues: ItineraryFieldValue = {};
    for (const [k, v] of Object.entries(values)) {
      if (v !== '' && v !== 0 && !(Array.isArray(v) && v.length === 0)) {
        fieldValues[k] = v;
      }
    }
    addItem(product, fieldValues, product.priceFrom);
    onClose();
    // Reset
    const init: Record<string, string | number | string[]> = {};
    fields.forEach(f => {
      if (f.type === 'number') init[f.key] = 0;
      else init[f.key] = '';
    });
    setValues(init);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[150]" onClick={onClose} />
      <div className="fixed inset-0 z-[151] flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-label={`Add ${product.name} to itinerary`} className="bg-white w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DC]">
            <div>
              <p className="text-[11px] font-medium text-[#8B7355] tracking-[0.08em] mb-1">ADD TO ITINERARY</p>
              <h3 className="text-[1rem] font-display text-[#1A1A18]">{product.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center text-[#6B6860] hover:text-[#1A1A18] transition-colors"
              style={{ minHeight: 'auto', minWidth: 'auto' }}
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {fields.map(field => (
              <div key={field.key}>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-1.5 block">
                  {field.label.toUpperCase()}{field.required ? ' *' : ''}
                </label>
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                )}
                {field.type === 'number' && (
                  <input
                    type="number"
                    min={1}
                    value={values[field.key] as number || ''}
                    onChange={(e) => handleChange(field.key, parseInt(e.target.value) || 0)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                )}
                {field.type === 'date' && (
                  <input
                    type="date"
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                    required={field.required}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors cursor-pointer"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                )}
                {field.type === 'time' && (
                  <input
                    type="time"
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                )}
                {field.type === 'select' && field.options && (
                  <select
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] bg-white focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  >
                    <option value="">Select...</option>
                    {field.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === 'toggle' && (
                  <select
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] bg-white focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  >
                    <option value="">Select...</option>
                    {field.options?.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === 'textarea' && (
                  <textarea
                    value={values[field.key] as string}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] resize-none transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                )}
              </div>
            ))}

            {(product.priceFrom ?? 0) > 0 && (
              <p className="text-[13px] text-[#9E9A90]">
                Starting from €{(product.priceFrom ?? 0).toLocaleString()} per {product.priceSuffix || 'session'}
              </p>
            )}
          </form>

          {/* Footer */}
          <div className="border-t border-[#E8E4DC] px-6 py-4 space-y-3">
            <p className="text-[11px] text-[#9E9A90] italic leading-relaxed">
              This is a request, not a confirmed booking. Our concierge will confirm availability and pricing.
            </p>
            <button
              onClick={handleSubmit as any}
              className="w-full bg-[#8B7355] text-white text-[12px] tracking-[0.12em] font-medium py-3.5 hover:bg-[#7A6548] transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              ADD TO MY ITINERARY
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
