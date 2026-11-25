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
  it('blocks an already-discounted public Guesty quote on 19 Nov even if supplier expiry is valid',()=>{
    const prelaunch = Date.parse('2026-11-19T18:00:00Z');
    const q = { ...raw(), createdAt:'2026-11-19T12:00:00Z',
      expiresAt:'2026-11-20T12:00:00Z',
      coupons: [{code:'PABF15GERAL26'}] };
    expect(()=>canonicalStayQuote(q,stay,prelaunch)).toThrow(/not valid yet/);
  });
  it('blocks a pre-launch discount preserved in the browser even when Guesty exposes no code',()=>{
    const prelaunch = Date.parse('2026-11-19T18:00:00Z');
    const q = { ...raw(), createdAt:'2026-11-19T12:00:00Z',
      expiresAt:'2026-11-20T12:00:00Z' };
    expect(()=>canonicalStayQuote(q,{...stay,quote:{couponCode:'PABF15GERAL26'}},prelaunch)).toThrow(/not valid yet/);
  });
  it('does not block other seasonal coupons before Black Friday',()=>{
    const prelaunch = Date.parse('2026-11-19T18:00:00Z');
    const q = { ...raw(), createdAt:'2026-11-19T12:00:00Z',
      expiresAt:'2026-11-20T12:00:00Z', coupons:[{code:'RECUPERA5'}] };
    expect(()=>canonicalStayQuote(q,stay,prelaunch)).not.toThrow();
  });
  it('keeps the supplier-confirmed Black Friday coupon visible in checkout when Guesty supplies only an internal name',()=>{
    const dated = Date.parse('2026-11-24T18:00:00Z');
    const q = { ...raw(), createdAt:'2026-11-24T17:00:00Z', expiresAt:'2026-11-25T17:00:00Z',
      coupons:[{name:'BlackFirday 2026 General Host'}],
      rates:{ratePlans:[{ratePlan:{_id:'flex',name:'Flexible',money:{
        currency:'EUR',subTotalPrice:1451.25,fareAccommodation:1060,
        fareAccommodationAdjusted:901,fareCleaning:550.25,
        invoiceItems:[
          {title:'Accommodation fare',type:'ACCOMMODATION_FARE',amount:1060},
          {title:'Cleaning fee',type:'CLEANING_FEE',amount:550.25},
          {title:'BlackFirday 2026 General Host',type:'DISCOUNT',amount:-159,description:'PABF15GERAL26'},
        ],
      }}}]},
    };
    const result=canonicalStayQuote(q,stay,dated);
    expect(result.quote).toMatchObject({couponCode:'PABF15GERAL26',total:1451.25});
    expect(result.couponReference).toBe('BlackFirday 2026 General Host');
  });
  it('does not infer a Black Friday code from the client quote or supplier name alone',()=>{
    const dated=Date.parse('2026-11-24T18:00:00Z');
    const q={...raw(), createdAt:'2026-11-24T17:00:00Z',expiresAt:'2026-11-25T17:00:00Z',
      coupons:[{name:'BlackFirday 2026 General Host'}]};
    const result=canonicalStayQuote(q,{...stay,quote:{couponCode:'PABF15GERAL26'}},dated);
    expect(result.quote.couponCode).toBeUndefined();
  });
  it('blocks an invoice-confirmed public campaign code before its launch even if Guesty misspells its internal name',()=>{
    const dated=Date.parse('2026-11-23T18:00:00Z');
    const q={...raw(),createdAt:'2026-11-23T17:00:00Z',expiresAt:'2026-11-24T17:00:00Z',
      coupons:[{name:'BlackFirday 2026 General Host'}],
      rates:{ratePlans:[{ratePlan:{_id:'flex',name:'Flexible',money:{
        currency:'EUR',subTotalPrice:1451.25,fareCleaning:550.25,
        invoiceItems:[{type:'DISCOUNT',amount:-159,description:'PABF15GERAL26'}],
      }}}]},
    };
    expect(()=>canonicalStayQuote(q,stay,dated)).toThrow(/not valid yet/);
  });
  describe('code sent to Guesty when the reservation is created (reservationCouponCode)',()=>{
    const dated=Date.parse('2026-11-25T18:00:00Z');
    const withPlan=(invoiceItems:any[],coupons?:any)=>({...raw(),createdAt:'2026-11-25T17:00:00Z',expiresAt:'2026-11-26T17:00:00Z',
      ...(coupons===undefined?{}:{coupons}),
      rates:{ratePlans:[{ratePlan:{_id:'flex',name:'Flexible',money:{currency:'EUR',subTotalPrice:1451.25,fareCleaning:550.25,invoiceItems}}}]}});
    const bfLine={title:'BlackFirday 2026 General Host',type:'DISCOUNT',amount:-159,description:'PABF15GERAL26'};
    it('is the code of the coupon Guesty applied',()=>{
      expect(canonicalStayQuote(withPlan([],[{code:'RECUPERA5'}]),stay,dated).reservationCouponCode).toBe('RECUPERA5');
    });
    it('is the exact Black Friday code from the DISCOUNT line when Guesty only names the coupon',()=>{
      const r=canonicalStayQuote(withPlan([bfLine],[{name:'BlackFirday 2026 General Host'}]),stay,dated);
      expect(r.reservationCouponCode).toBe('PABF15GERAL26');
    });
    it('is the Black Friday code from the DISCOUNT line even when Guesty lists no coupon at all (GY-hZ7nb4fp)',()=>{
      const r=canonicalStayQuote(withPlan([bfLine]),stay,dated);
      expect(r.reservationCouponCode).toBe('PABF15GERAL26');
      // the checkout display rule is unchanged
      expect(r.quote.couponCode).toBeUndefined();
    });
    it('never comes from the browser quote',()=>{
      expect(canonicalStayQuote(withPlan([],[{name:'BlackFirday 2026 General Host'}]),{...stay,quote:{couponCode:'PABF15VIP26'}},dated).reservationCouponCode).toBeUndefined();
      expect(canonicalStayQuote(withPlan([]),{...stay,quote:{couponCode:'PABF15VIP26'}},dated).reservationCouponCode).toBeUndefined();
    });
    it('ignores a DISCOUNT line whose description is not a known campaign code',()=>{
      const other={...bfLine,description:'Long stay 10%'};
      expect(canonicalStayQuote(withPlan([other],[{name:'Long stay'}]),stay,dated).reservationCouponCode).toBeUndefined();
    });
    it('ignores a DISCOUNT line on another rate plan',()=>{
      const q=withPlan([]);
      q.rates.ratePlans.push({ratePlan:{_id:'nr',name:'Non-refundable',money:{currency:'EUR',subTotalPrice:1300,fareCleaning:550.25,invoiceItems:[bfLine]}}} as any);
      expect(canonicalStayQuote(q,stay,dated).reservationCouponCode).toBeUndefined();
    });
  });
  it('requires customer-visible total and currency to match before charging',()=>{
    expect(()=>assertQuotedTotal({total:1,currency:'EUR'},{total:1234.56,currency:'EUR'})).toThrow();
    expect(()=>assertQuotedTotal({total:1234.56,currency:'USD'},{total:1234.56,currency:'EUR'})).toThrow();
    expect(()=>assertQuotedTotal({total:1234.56,currency:'EUR'},{total:1234.56,currency:'EUR'})).not.toThrow();
  });
});
