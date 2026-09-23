import { PhoneInput as RIPPhoneInput } from "react-international-phone";
import { useTranslation } from "react-i18next";
import "react-international-phone/style.css";

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

/** L9 (auditoria set/2026): o indicativo por omissão era sempre +351 — um
 *  hóspede francês tinha de o descobrir e trocar. A língua do site é o melhor
 *  palpite do país; PT continua o fallback (mercado inglês é misto). */
const LANG_TO_COUNTRY: Record<string, string> = {
  pt: "pt", es: "es", fr: "fr", de: "de", it: "it", nl: "nl", sv: "se", fi: "fi",
};

export default function PhoneInput({ id, value, onChange, onBlur, placeholder = "Phone number *", className }: PhoneInputProps) {
  const { i18n } = useTranslation();
  const defaultCountry = LANG_TO_COUNTRY[(i18n.language || "").slice(0, 2)] ?? "pt";
  return (
    <div className={className}>
      <RIPPhoneInput
        defaultCountry={defaultCountry}
        value={value}
        onChange={onChange}
        disableCountryGuess
        forceDialCode
        placeholder={placeholder}
        inputProps={{ id, autoComplete: 'tel', inputMode: 'tel', 'aria-label': placeholder, onBlur }}
        inputClassName="!w-full !h-full !bg-white !border-0 !border-r-0 !rounded-none !rounded-r-md !text-[16px] !text-[#1A1A18] !px-3 focus:!outline-none focus:!ring-0 !font-[inherit]"
        countrySelectorStyleProps={{
          buttonClassName: "!bg-white !border-0 !rounded-none !rounded-l-md !px-3 !h-full hover:!bg-[#F5F1EB] !transition-colors",
          dropdownStyleProps: {
            className: "!bg-white !border-[#E8E4DC] !rounded-lg !shadow-lg !z-[100] !max-h-[200px]",
            listItemClassName: "!text-[13px] !text-[#1A1A18] hover:!bg-[#F5F1EB] !px-3 !py-2",
          },
        }}
        className="!flex !items-center !w-full !h-[52px] !bg-white !border !border-[#E8E4DC] !rounded-md focus-within:!border-[#8B7355] focus-within:!ring-2 focus-within:!ring-[#8B7355] !transition"
        style={{ height: "52px" }}
      />
    </div>
  );
}
