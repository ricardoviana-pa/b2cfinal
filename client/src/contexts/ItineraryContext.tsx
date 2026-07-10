/* ==========================================================================
   ITINERARY CONTEXT — "My itinerary" system
   Replaces all cart/basket/checkout language.
   Persists to localStorage, generates structured WhatsApp messages.
   ========================================================================== */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Product, ItineraryItem, ItineraryFieldValue } from '@/lib/types';
import { pushEcommerce, ADDON_PREFIX } from '@/lib/datalayer';

interface ItineraryContextType {
  items: ItineraryItem[];
  itemCount: number;
  addItem: (product: Product, fields: ItineraryFieldValue, estimatedPrice?: number) => void;
  updateItem: (id: string, fields: ItineraryFieldValue, estimatedPrice?: number) => void;
  removeItem: (id: string) => void;
  clearItinerary: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  sendToWhatsApp: (guestName: string, guestEmail: string, property: string, generalNotes: string) => void;
  sendViaEmail: (guestName: string, guestEmail: string, property: string, generalNotes: string) => void;
}

const ItineraryContext = createContext<ItineraryContextType | undefined>(undefined);

const STORAGE_KEY = 'pa-itinerary';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFieldValue(key: string, value: string | number | boolean | string[]): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/_/g, ' ');
}

const SERVICE_EMOJIS: Record<string, string> = {
  'private-chef': '\u{1F37D}',
  'in-villa-spa': '\u{1F486}',
  'private-yoga': '\u{1F9D8}',
  'personal-training': '\u{1F3CB}',
  'grocery-delivery': '\u{1F6D2}',
  'babysitter': '\u{1F476}',
  'airport-shuttle': '\u{2708}',
  'daily-housekeeping': '\u{1F9F9}',
};

const ADVENTURE_EMOJI = '\u{1F30A}';

function buildMessage(items: ItineraryItem[], guestName: string, guestEmail: string, property: string, generalNotes: string): string {
  let msg = `Hello Portugal Active! I would like to add the following services to my stay:\n\n`;
  msg += `Name: ${guestName}\n`;
  msg += `Email: ${guestEmail}\n`;
  msg += `Property/Dates: ${property || 'Not yet booked'}\n`;

  for (const item of items) {
    const emoji = item.product.type === 'service'
      ? (SERVICE_EMOJIS[item.product.slug] || '\u{2728}')
      : ADVENTURE_EMOJI;

    msg += `\n${emoji} ${item.product.name}\n`;
    for (const [key, val] of Object.entries(item.fields)) {
      if (val !== '' && val !== undefined && val !== null && val !== 0 && !(Array.isArray(val) && val.length === 0)) {
        msg += `${formatFieldLabel(key)}: ${formatFieldValue(key, val)}\n`;
      }
    }
  }

  const total = items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);
  if (total > 0) {
    msg += `\nEstimated total: \u20AC${total.toLocaleString()}\n`;
  }

  if (generalNotes) {
    msg += `\nNotes: ${generalNotes}\n`;
  }

  msg += `\nThank you!`;

  return msg;
}

export function ItineraryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ItineraryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const itemCount = items.length;

  const addItem = useCallback((product: Product, fields: ItineraryFieldValue, estimatedPrice?: number) => {
    const newItem: ItineraryItem = {
      id: generateId(),
      product,
      fields,
      estimatedPrice,
      addedAt: new Date().toISOString(),
    };
    setItems(prev => [...prev, newItem]);
    setIsOpen(true);

    // GA4: add_to_cart
    const prefix = ADDON_PREFIX[product.slug] || 'ADDON';
    pushEcommerce({
      event: 'add_to_cart',
      ecommerce: {
        currency: 'EUR',
        value: estimatedPrice ?? product.priceFrom ?? 0,
        items: [
          {
            item_id: `${prefix}-${product.id}`,
            item_name: product.name,
            item_category: 'addon',
            item_category2: product.slug.replace(/-/g, '_'),
            price: estimatedPrice ?? product.priceFrom ?? 0,
            quantity: 1,
          },
        ],
      },
    });
  }, []);

  const updateItem = useCallback((id: string, fields: ItineraryFieldValue, estimatedPrice?: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, fields, estimatedPrice } : item
    ));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) {
        // GA4: remove_from_cart
        const prefix = ADDON_PREFIX[item.product.slug] || 'ADDON';
        pushEcommerce({
          event: 'remove_from_cart',
          ecommerce: {
            currency: 'EUR',
            value: item.estimatedPrice ?? item.product.priceFrom ?? 0,
            items: [
              {
                item_id: `${prefix}-${item.product.id}`,
                item_name: item.product.name,
                item_category: 'addon',
                item_category2: item.product.slug.replace(/-/g, '_'),
                price: item.estimatedPrice ?? item.product.priceFrom ?? 0,
                quantity: 1,
              },
            ],
          },
        });
      }
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const clearItinerary = useCallback(() => {
    setItems([]);
    setIsOpen(false);
  }, []);

  const sendToWhatsApp = useCallback((guestName: string, guestEmail: string, property: string, generalNotes: string) => {
    const msg = buildMessage(items, guestName, guestEmail, property, generalNotes);
    window.open(`https://wa.me/351927161771?text=${encodeURIComponent(msg)}`, '_blank');
    clearItinerary();
  }, [items, clearItinerary]);

  const sendViaEmail = useCallback((guestName: string, guestEmail: string, property: string, generalNotes: string) => {
    const msg = buildMessage(items, guestName, guestEmail, property, generalNotes);
    const subject = encodeURIComponent(`Itinerary Request from ${guestName}`);
    const body = encodeURIComponent(msg);
    window.open(`mailto:info@portugalactive.com?subject=${subject}&body=${body}`, '_blank');
    clearItinerary();
  }, [items, clearItinerary]);

  return (
    <ItineraryContext.Provider value={{
      items, itemCount, addItem, updateItem, removeItem, clearItinerary,
      isOpen, setIsOpen, sendToWhatsApp, sendViaEmail,
    }}>
      {children}
    </ItineraryContext.Provider>
  );
}

export function useItinerary() {
  const context = useContext(ItineraryContext);
  if (!context) throw new Error('useItinerary must be used within ItineraryProvider');
  return context;
}
