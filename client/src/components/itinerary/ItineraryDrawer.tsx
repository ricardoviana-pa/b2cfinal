/* ==========================================================================
   ITINERARY DRAWER — Side panel from right
   Shows all items grouped by Services/Adventures.
   Guest info, notes, estimated total, dual CTAs.
   ========================================================================== */

import { useState, useEffect } from 'react';
import { X, Trash2, ClipboardCheck, MessageCircle, Mail } from 'lucide-react';
import { useItinerary } from '@/contexts/ItineraryContext';

export default function ItineraryDrawer() {
  const { items, itemCount, removeItem, isOpen, setIsOpen, sendToWhatsApp, sendViaEmail, clearItinerary } = useItinerary();
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [propertyDates, setPropertyDates] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  const services = items.filter(i => i.product.type === 'service');
  const adventures = items.filter(i => i.product.type === 'adventure');
  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);

  const canSend = guestName.trim() && guestEmail.trim();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, setIsOpen]);

  const handleWhatsApp = () => {
    if (!canSend) return;
    sendToWhatsApp(guestName, guestEmail, propertyDates || 'Not yet booked', generalNotes);
    resetForm();
  };

  const handleEmail = () => {
    if (!canSend) return;
    sendViaEmail(guestName, guestEmail, propertyDates || 'Not yet booked', generalNotes);
    resetForm();
  };

  const resetForm = () => {
    setGuestName('');
    setGuestEmail('');
    setPropertyDates('');
    setGeneralNotes('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[120] transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div role="dialog" aria-modal="true" aria-label="Your itinerary" className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-[121] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DC]">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#8B7355]" />
            <h2 className="text-[1.125rem] font-display text-[#1A1A18]">My Itinerary</h2>
            {itemCount > 0 && (
              <span className="text-[12px] text-[#9E9A90]">({itemCount})</span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-10 h-10 flex items-center justify-center text-[#6B6860] hover:text-[#1A1A18] transition-colors"
            style={{ minHeight: 'auto', minWidth: 'auto' }}
            aria-label="Close itinerary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardCheck className="w-10 h-10 text-[#E8E4DC] mx-auto mb-4" />
              <p className="text-[15px] text-[#9E9A90] mb-2">Your itinerary is empty</p>
              <p className="text-[13px] text-[#9E9A90]/70 leading-relaxed">Browse our services and adventures to start building your perfect stay.</p>
              <button
                onClick={() => setIsOpen(false)}
                className="mt-6 text-[12px] tracking-[0.08em] font-medium text-[#8B7355] hover:text-[#1A1A18] transition-colors"
                style={{ minHeight: 'auto' }}
              >
                CONTINUE BROWSING
              </button>
            </div>
          ) : (
            <>
              {/* Guest info */}
              <div className="space-y-3 mb-6">
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-1.5 block">
                    YOUR NAME *
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your full name"
                    required
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-1.5 block">
                    YOUR EMAIL *
                  </label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-1.5 block">
                    PROPERTY / DATES
                  </label>
                  <input
                    type="text"
                    value={propertyDates}
                    onChange={(e) => setPropertyDates(e.target.value)}
                    placeholder="e.g. Eben Lodge / 15 to 22 July"
                    className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
              </div>

              {/* Services */}
              {services.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] font-medium tracking-[0.12em] text-[#8B7355] mb-3">SERVICES</p>
                  {services.map(item => (
                    <div key={item.id} className="flex items-start justify-between py-3 border-b border-[#E8E4DC]/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#1A1A18]">{item.product.name}</p>
                        <div className="text-[12px] text-[#9E9A90] mt-1 space-y-0.5">
                          {Object.entries(item.fields).map(([key, val]) => {
                            if (!val || val === 0 || (Array.isArray(val) && val.length === 0)) return null;
                            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                            return <p key={key}>{label}: {Array.isArray(val) ? val.join(', ') : String(val)}</p>;
                          })}
                        </div>
                        {(item.estimatedPrice ?? 0) > 0 && (
                          <p className="text-[13px] text-[#8B7355] mt-1">From €{(item.estimatedPrice ?? 0).toLocaleString()}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-8 h-8 flex items-center justify-center text-[#9E9A90] hover:text-[#DC2626] transition-colors flex-shrink-0"
                        style={{ minHeight: 'auto', minWidth: 'auto' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Adventures */}
              {adventures.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] font-medium tracking-[0.12em] text-[#8B7355] mb-3">ADVENTURES</p>
                  {adventures.map(item => (
                    <div key={item.id} className="flex items-start justify-between py-3 border-b border-[#E8E4DC]/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#1A1A18]">{item.product.name}</p>
                        <div className="text-[12px] text-[#9E9A90] mt-1 space-y-0.5">
                          {Object.entries(item.fields).map(([key, val]) => {
                            if (!val || val === 0 || (Array.isArray(val) && val.length === 0)) return null;
                            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                            return <p key={key}>{label}: {Array.isArray(val) ? val.join(', ') : String(val)}</p>;
                          })}
                        </div>
                        {(item.estimatedPrice ?? 0) > 0 && (
                          <p className="text-[13px] text-[#8B7355] mt-1">From €{(item.estimatedPrice ?? 0).toLocaleString()}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-8 h-8 flex items-center justify-center text-[#9E9A90] hover:text-[#DC2626] transition-colors flex-shrink-0"
                        style={{ minHeight: 'auto', minWidth: 'auto' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div className="mb-5">
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-1.5 block">
                  NOTES FOR YOUR CONCIERGE
                </label>
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Anything else we should know..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-[#E8E4DC] text-[14px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] resize-none transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-[#E8E4DC] px-6 py-4 space-y-3">
            {estimatedTotal > 0 && (
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[14px] text-[#6B6860]">Estimated services total (confirmed by concierge)</span>
                <span className="text-[18px] font-display text-[#1A1A18]">€{estimatedTotal.toLocaleString()}</span>
              </div>
            )}
            <p className="text-[11px] text-[#9E9A90] leading-relaxed">
              Prices are estimated. Your concierge will confirm final pricing and availability.
            </p>
            <button
              onClick={handleWhatsApp}
              disabled={!canSend}
              className="w-full bg-[#8B7355] text-white text-[11px] tracking-[0.15em] font-medium py-3.5 hover:bg-[#7A6548] transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageCircle className="w-4 h-4" />
              SEND TO CONCIERGE VIA WHATSAPP
            </button>
            <button
              onClick={handleEmail}
              disabled={!canSend}
              className="w-full border border-[#1A1A18] text-[#1A1A18] text-[11px] tracking-[0.15em] font-medium py-3.5 hover:bg-[#1A1A18] hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mail className="w-4 h-4" />
              SEND VIA EMAIL
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="w-full text-center text-[12px] tracking-[0.08em] text-[#9E9A90] hover:text-[#1A1A18] transition-colors py-2"
              style={{ minHeight: 'auto' }}
            >
              CONTINUE BROWSING
            </button>
          </div>
        )}
      </div>
    </>
  );
}
