import './setup';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const fake=vi.hoisted(()=>({getIntent:vi.fn(),createQuote:vi.fn(),trusted:vi.fn(),facts:vi.fn()}));
vi.mock('../db',()=>({getBookingIntent:fake.getIntent}));
vi.mock('../services/guesty-booking',()=>({createBEQuote:fake.createQuote}));
vi.mock('../services/trusted-checkout-quote',()=>({trustedStayQuote:fake.trusted,assertQuotedTotal:(a:any,b:any)=>{if(a.total!==b.total)throw new Error('price changed')}}));
vi.mock('../routers/checkout',()=>({listingFacts:fake.facts}));
vi.mock('../services/checkout-card-charge',()=>({breakdownFromIntent:(m:any)=>({totalCents:Math.round(m.quote.total*100)})}));
import {trustedWalletPrice,assertWalletConfirmation} from '../services/wallet-price-validation';
const input={amount:100000,currency:'EUR',listingId:'synthetic-home',checkIn:'2099-10-10',checkOut:'2099-10-14',numberOfAdults:2,numberOfChildren:0,numberOfInfants:0,ratePlanId:'plan'};
beforeEach(()=>{
 vi.resetAllMocks();fake.facts.mockResolvedValue({pets:false});
 fake.createQuote.mockResolvedValue({currency:'EUR',ratePlanId:'plan',ratePlanOptions:[{ratePlanId:'plan',total:1000}]});
 fake.trusted.mockResolvedValue({ratePlanId:'plan',quote:{total:1000,currency:'EUR'}});
 fake.getIntent.mockResolvedValue({listingId:input.listingId,checkIn:input.checkIn,checkOut:input.checkOut,guests:2,ratePlanId:'plan',quote:{total:1000},expiresAt:new Date(Date.now()+60000),status:'draft'});
});
describe('PayPal/Klarna price authority',()=>{
 it('checks the legacy amount against a supplier rate plan',async()=>expect(await trustedWalletPrice(input)).toEqual({amount:100000,ratePlanId:'plan'}));
 it('rejects browser-only prices and unknown rate plans',async()=>{
  await expect(trustedWalletPrice({...input,amount:1000})).rejects.toThrow();
  await expect(trustedWalletPrice({...input,ratePlanId:'fabricated'})).rejects.toThrow();
 });
 it('rejects unsupported currency',async()=>{await expect(trustedWalletPrice({...input,currency:'USD'})).rejects.toThrow();expect(fake.createQuote).not.toHaveBeenCalled()});
 it('binds V2 payment to the verified intent',async()=>expect((await trustedWalletPrice({...input,intentId:'synthetic-intent'})).amount).toBe(100000));
 it.each([{listingId:'other'},{checkIn:'2099-10-11'},{checkOut:'2099-10-15'},{numberOfAdults:3},{ratePlanId:'other'}])('rejects mismatched V2 booking details %j',async patch=>{
  await expect(trustedWalletPrice({...input,...patch,intentId:'synthetic-intent'})).rejects.toThrow();
 });
 it('does not fall back to browser amounts on provider failure',async()=>{fake.createQuote.mockRejectedValue(new Error('offline'));await expect(trustedWalletPrice(input)).rejects.toThrow()});
});
describe('wallet confirmation binding',()=>{
 const confirmation={...input,totalAmount:1000,guestEmail:'guest@checkout.invalid'};
 const payment=()=>({status:'succeeded',amount:100000,currency:'eur',metadata:{source:'website-paypal',listingId:input.listingId,checkIn:input.checkIn,checkOut:input.checkOut,numberOfAdults:'2',numberOfChildren:'0',numberOfInfants:'0',ratePlanId:'plan',guestEmail:'guest@checkout.invalid'}});
 it('accepts the matching provider-confirmed payment',()=>expect(()=>assertWalletConfirmation(payment(),confirmation,'website-paypal')).not.toThrow());
 it.each([{listingId:'other'},{checkIn:'2099-10-12'},{numberOfAdults:5},{guestEmail:'other@checkout.invalid'},{totalAmount:10},{currency:'USD'},{ratePlanId:'other'}])('rejects payment reuse for changed selection %j',patch=>{
  expect(()=>assertWalletConfirmation(payment(),{...confirmation,...patch},'website-paypal')).toThrow();
 });
 it('rejects incomplete payment and wrong payment flow',()=>{
  expect(()=>assertWalletConfirmation({...payment(),status:'processing'},confirmation,'website-paypal')).toThrow();
  expect(()=>assertWalletConfirmation(payment(),confirmation,'website-klarna')).toThrow();
 });
});
