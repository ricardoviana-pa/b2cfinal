import { editorialTripContext } from './editorialTripContext';

/** Keep planning context with an enquiry, without copying arbitrary URL data. */
export function contactEnquiryContext(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const trip = editorialTripContext(search);
  const context: Record<string, string> = {};
  for (const key of ['service', 'property', 'destination']) {
    const value = params.get(key);
    if (value && /^[a-z0-9][a-z0-9-]{0,119}$/.test(value)) context[key] = value;
  }
  if (trip.checkin && trip.checkout) {
    context.checkin = trip.checkin;
    context.checkout = trip.checkout;
  }
  if (trip.guests) context.guests = String(trip.guests);
  return context;
}

/** Included in the team email and CRM note even when the guest edits the message. */
export function contactEnquiryMessage(message: string, metadata?: Record<string, string>) {
  const context = contactEnquiryContext(new URLSearchParams(metadata).toString());
  const labels: Record<string, string> = {
    service: 'Service', property: 'Property', destination: 'Destination',
    checkin: 'Check-in', checkout: 'Check-out', guests: 'Guests',
  };
  const lines = Object.entries(context).map(([key, value]) => `${labels[key]}: ${value}`);
  return message + (lines.length ? `\n\n${lines.join('\n')}` : '');
}
