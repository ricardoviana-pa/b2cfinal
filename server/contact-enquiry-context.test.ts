import { describe, expect, it } from 'vitest';
import { contactEnquiryContext, contactEnquiryMessage } from '../shared/contactEnquiryContext';
import { withEditorialTrip } from '../shared/editorialTripContext';

describe('destination to contact enquiry', () => {
  it('keeps the selected service, destination and valid trip through the team message', () => {
    const href = withEditorialTrip('/contact?service=airport-shuttle&destination=minho', 'checkin=2099-10-01&checkout=2099-10-05&guests=4&email=private%40example.invalid');
    const metadata = contactEnquiryContext(href.split('?')[1]);
    expect(metadata).toEqual({ service: 'airport-shuttle', destination: 'minho', checkin: '2099-10-01', checkout: '2099-10-05', guests: '4' });
    expect(contactEnquiryMessage('Please arrange pickup', metadata)).toBe('Please arrange pickup\n\nService: airport-shuttle\nDestination: minho\nCheck-in: 2099-10-01\nCheck-out: 2099-10-05\nGuests: 4');
  });
  it('does not forward arbitrary URL fields, invalid dates or HTML', () => {
    expect(contactEnquiryContext('checkin=2099-02-30&checkout=2099-03-04&guests=101&service=%3Cscript%3E&token=secret&email=private')).toEqual({});
    expect(contactEnquiryMessage('Edited message')).toBe('Edited message');
  });
  it('keeps a property enquiry with one guest and no dates', () => {
    expect(contactEnquiryContext('property=synthetic-home&guests=1&checkin=2099-10-01')).toEqual({ property: 'synthetic-home', guests: '1' });
  });
  it('preserves a collection choice and dates in the team message, even after the guest edits their message', () => {
    const href = withEditorialTrip('/contact?subject=plan-my-stay&collection=beach-villas', 'checkin=2099-06-01&checkout=2099-06-08&guests=6&token=private');
    const context = contactEnquiryContext(href.split('?')[1]);
    expect(context).toEqual({ collection: 'beach-villas', checkin: '2099-06-01', checkout: '2099-06-08', guests: '6' });
    expect(contactEnquiryMessage('Please help us choose', context)).toContain('Collection: beach-villas\nCheck-in: 2099-06-01\nCheck-out: 2099-06-08\nGuests: 6');
  });
});
