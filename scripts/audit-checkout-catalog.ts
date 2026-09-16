import { readFileSync, writeFileSync } from 'node:fs';
import { CHECKOUT_EXTRAS } from '../server/config/checkout-extras';
const products = JSON.parse(readFileSync(new URL('../client/src/data/products.json', import.meta.url), 'utf8'));
const legacy = JSON.parse(readFileSync(new URL('../client/src/data/services.json', import.meta.url), 'utf8')).services;
const mappings = [
  ['private-chef', 'private-chef', 'private-chef'], ['in-villa-spa','massage','massage-therapist'],
  ['private-yoga','private-yoga','private-yoga'], ['personal-training','personal-trainer','personal-trainer'],
  ['grocery-delivery','grocery-setup','grocery-setup'], ['babysitter','babysitter','babysitter'],
  ['airport-shuttle','transfer-porto','airport-shuttle'], ['daily-housekeeping','daily-cleaning',''],
];
const units: Record<string,string> = { per_person:'por pessoa',per_person_per_unit:'por pessoa × sessão/unidade',per_stay:'por estadia',per_unit:'por unidade' };
let md = '# Serviços — reconciliação comercial\n\n16-09-2026. Extraído do código; não altera preços. As prestações podem diferir: a operação deve validar âmbito, unidade, região e inclusões antes de unificar.\n\n';
md += '| Serviço | Catálogo público atual (products.json) | Checkout | Catálogo legado (services.json) |\n| --- | --- | --- | --- |\n';
for (const [slug,sku,old] of mappings) {
  const p=products.find((p:any)=>p.slug===slug), e=CHECKOUT_EXTRAS.find(e=>e.sku===sku)!, l=legacy.find((p:any)=>p.slug===old);
  let current=`€${e.unitPrice} ${units[e.pricingModel] || e.pricingModel}`;
  if(e.minPeople) current+=`; mínimo ${e.minPeople} pessoas`;
  if(e.unitKey) current+=`; unidade: ${e.unitKey}`;
  if(sku==='daily-cleaning') current='Por casa/tipologia; valor base €65 (não é uma tarifa universal)';
  if(sku==='transfer-porto') current+='; Porto base €120, van €160; Lisboa €280/€350';
  md+=`| ${slug} | Desde €${p.priceFrom} ${p.priceSuffix||''} | ${current} | ${l?.price||'—'} |\n`;
}
md += '\n## Decisão necessária\n\nPara cada linha, aprovar: serviço exato; preço e unidade; mínimo de participantes/horas/sessões; regiões; inclusões e despesas adicionais; impostos; confirmação e cancelamento.\n\nDepois de aprovada a matriz, ligar catálogo, detalhe, dados estruturados e checkout à mesma definição comercial. Não substituir preços públicos pelos do checkout por suposição.\n\n## Limites\n\nA listagem pública atual usa products.json. services.json é uma fonte legada ainda presente no repositório, não prova de um terceiro preço atualmente visível em todas as páginas. O babysitting e treino/yoga precisam particularmente de clarificar se a unidade é pessoa ou grupo.\n';
writeFileSync(new URL('../docs/website-progress/SERVICOS_PRECOS.md',import.meta.url),md);
console.log('Generated comparison for 8 public services; no prices changed.');
