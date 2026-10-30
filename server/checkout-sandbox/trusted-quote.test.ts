import './setup';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: vi.fn() } }));
import { canonicalStayQuote, assertQuotedTotal } from '../services/trusted-checkout-quote';
const stay = { listingId:'synthetic-home', guestyQuoteId:'aaaaaaaaaaaaaaaaaaaaaaaa', checkIn:'2099-11-10', checkOut:'2099-11-14', guests:4, ratePlanId:'flex' };
const raw = () => ({ _id:stay.guestyQuoteId, unitTypeId:stay.listingId, guestsCount:4,
  checkInDateLocalized:stay.checkIn, checkOutDateLocalized:stay.checkOut,
  createdAt:'2099-01-01T00:00:00Z',expiresAt:'2099-01-02T00:00:00Z',
  rates:{ratePlans:[{ratePlan:{_id:'flex',name:'Flexible',money:{currency:'EUR',subTotalPrice:1234.56,fareCleaning:100}}}]},
});
const now=Date.parse('2099-01-01T12:00:00Z');
describe('supplier quote identity and price binding',()=>{
  it('uses actual supplier amounts and expiry',()=>{
    const result=canonicalStayQuote(raw(),stay,now);
    expect(result.quote).toMatchObject({total:1234.56,totalNights:1134.56,cleaningFee:100,nights:4,currency:'EUR'});
    expect(result.expiresAt.toISOString()).toBe('2099-01-02T00:00:00.000Z');
  });
  it.each([
    ['quote ID',{_id:'bbbbbbbbbbbbbbbbbbbbbbbb'}],['property',{unitTypeId:'another-home'}],
    ['arrival',{checkInDateLocalized:'2099-11-11'}],['departure',{checkOutDateLocalized:'2099-11-15'}],
    ['guests',{guestsCount:2}],['expired',{expiresAt:'2098-01-01'}],['expiry missing',{expiresAt:undefined}],
  ])('rejects a quote with mismatched %s',(_name,patch)=>expect(()=>canonicalStayQuote({...raw(),...patch},stay,now)).toThrow());
  it('rejects unknown plans and currencies',()=>{
    expect(()=>canonicalStayQuote(raw(),{...stay,ratePlanId:'invented'},now)).toThrow();
    const usd=raw();usd.rates.ratePlans[0].ratePlan.money.currency='USD';
    expect(()=>canonicalStayQuote(usd,stay,now)).toThrow();
  });
  it('without a plan on the stay, preselects the cheapest open refundable rate (never the supplier default by name)',()=>{
    // Decisão de 29 out 2026: a reembolsável vem pré-selecionada. O parse do
    // Guesty escolhia por nome ("Flexible" ganhava à "Rembolsável Standard",
    // mais barata e com a mesma política); a regra partilhada escolhe a
    // reembolsável mais barata cuja janela ainda está aberta.
    const plan=(id:string,name:string,policy:string,subTotalPrice:number)=>({ratePlan:{_id:id,name,cancellationPolicy:[policy],money:{currency:'EUR',subTotalPrice,fareCleaning:100}}});
    const two={...raw(),rates:{ratePlans:[plan('nr','Não-Reembolsável','SUPER_STRICT',1100),plan('flex','Flexible','MODERATE',1234.56),plan('flex-std','Rembolsável Standard','MODERATE',1200)]}};
    const picked=canonicalStayQuote(two,{...stay,ratePlanId:undefined},now);
    expect(picked.ratePlanId).toBe('flex-std');
    expect(picked.quote.total).toBe(1200);
    // a escolha do hóspede continua a mandar
    expect(canonicalStayQuote(two,{...stay,ratePlanId:'nr'},now).ratePlanId).toBe('nr');
  });
  it('requires customer-visible total and currency to match before charging',()=>{
    expect(()=>assertQuotedTotal({total:1,currency:'EUR'},{total:1234.56,currency:'EUR'})).toThrow();
    expect(()=>assertQuotedTotal({total:1234.56,currency:'USD'},{total:1234.56,currency:'EUR'})).toThrow();
    expect(()=>assertQuotedTotal({total:1234.56,currency:'EUR'},{total:1234.56,currency:'EUR'})).not.toThrow();
  });
});
