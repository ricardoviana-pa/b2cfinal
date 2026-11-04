import { describe, expect, it } from 'vitest';
import { selectDestinationHomes } from '../client/src/data/destination-discovery';
import { withEditorialTrip } from '../shared/editorialTripContext';
import { contactEnquiryContext } from '../shared/contactEnquiryContext';

describe('destination recommendations', () => {
  it('never injects a curated home absent from the destination inventory', () => {
    const available = [{ guestyId: 'another-home', isActive: true }];
    expect(selectDestinationHomes(available, 'minho')).toEqual(available);
    expect(selectDestinationHomes([], 'viana-do-castelo')).toEqual([]);
  });
  it('prioritises present curated homes, excludes inactive homes and fills gaps without duplicates', () => {
    const homes = [
      { guestyId: 'other-1', isActive: true },
      { guestyId: '696533466d209c001510ecfe', isActive: false },
      { guestyId: 'other-2', isActive: true },
      { guestyId: '69653365bf04fe0013743511', isActive: true },
      { guestyId: 'other-3', isActive: true },
    ];
    expect(selectDestinationHomes(homes, 'minho').map(home => home.guestyId)).toEqual(['69653365bf04fe0013743511', 'other-1', 'other-2']);
    expect(homes[0].guestyId).toBe('other-1');
  });
  it('retains destination, dates and party size through the recommendation CTA without forwarding unrelated fields', () => {
    const link = withEditorialTrip('/contact?subject=plan-my-stay&destination=minho', '?checkin=2099-10-01&checkout=2099-10-05&guests=4&email=private@example.com');
    const query = link.split('?')[1];
    expect(contactEnquiryContext(query)).toEqual({ destination: 'minho', checkin: '2099-10-01', checkout: '2099-10-05', guests: '4' });
    expect(link).not.toContain('email');
    expect(link).toContain('subject=plan-my-stay');
  });
});
