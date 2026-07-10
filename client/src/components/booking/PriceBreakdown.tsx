import { useTranslation } from "react-i18next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { formatEurCents } from "@/lib/format";

interface PriceBreakdownProps {
  currency?: string;
  nights: number;
  baseRent: number;
  cleaningFee: number;
  serviceFee: number;
  touristTax: number;
  vat: number;
  totalBeforeTax: number;
  totalAfterTax: number;
  loading?: boolean;
}

export default function PriceBreakdown({
  currency = "EUR",
  nights,
  baseRent,
  cleaningFee,
  serviceFee,
  touristTax,
  vat,
  totalBeforeTax,
  totalAfterTax,
  loading = false,
}: PriceBreakdownProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (loading) {
    return <div className="rounded-lg bg-[#F5F1EB] border border-[#E8E4DC] h-[120px] animate-pulse" />;
  }

  const perNight = nights > 0 ? totalAfterTax / nights : totalAfterTax;

  return (
    <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-2">{t("priceBreakdown.title")}</p>
          <p className="headline-sm text-[#1A1A18]">{formatEurCents(totalAfterTax, lang)}</p>
          <p className="body-sm mt-1">{t("priceBreakdown.perNightLabel", { amount: formatEurCents(perNight, lang) })}</p>
        </div>
        <p className="text-[12px] text-[#9E9A90]">{t("priceBreakdown.nights", { count: nights })}</p>
      </div>

      <Accordion type="single" collapsible defaultValue="closed">
        <AccordionItem value="breakdown" className="border-b-0">
          <AccordionTrigger className="py-0 hover:no-underline text-[13px] text-[#1A1A18]">
            {t("priceBreakdown.viewDetails")}
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#6B6860]">{t("priceBreakdown.accommodation")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(baseRent, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B6860]">{t("priceBreakdown.cleaning")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(cleaningFee, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B6860]">{t("priceBreakdown.serviceFee")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(serviceFee, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B6860]">{t("priceBreakdown.touristTax")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(touristTax, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B6860]">{t("priceBreakdown.vat")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(vat, lang)}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-[#E8E4DC]">
                <span className="text-[#6B6860]">{t("priceBreakdown.subtotal")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(totalBeforeTax, lang)}</span>
              </div>
              <div className="flex justify-between text-[14px] font-medium">
                <span className="text-[#1A1A18]">{t("property.total")}</span>
                <span className="text-[#1A1A18]">{formatEurCents(totalAfterTax, lang)}</span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
