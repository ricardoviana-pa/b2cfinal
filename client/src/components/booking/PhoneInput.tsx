import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  PhoneInput as RIPPhoneInput,
  defaultCountries,
  parseCountry,
  type PhoneInputRefType,
} from "react-international-phone";
import { useTranslation } from "react-i18next";
import "react-international-phone/style.css";
import { defaultPhoneCountry } from "@/lib/phone";

interface PhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /** Liga o campo à mensagem de erro (aria-describedby / aria-invalid). */
  describedBy?: string;
  invalid?: boolean;
}

const SUPPORTED = new Set(defaultCountries.map((c) => parseCountry(c).iso2));
const isSupported = (iso2: string) => SUPPORTED.has(iso2);

/** Línguas do browser como um só texto (estável para o useSyncExternalStore). */
function browserLanguages(): string {
  if (typeof navigator === "undefined") return "";
  const list = navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
  return list.join(",");
}
function subscribeLanguages(onChange: () => void) {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

/**
 * Indicativo por omissão (auditoria do funil, out/2026, n.º 7; antes L9 de
 * set/2026): a região do browser primeiro (en-GB → +44, en-US → +1), depois a
 * língua do site; nunca +351 só por o site estar em inglês (70% dos
 * checkouts). Regras em lib/phone.ts.
 *
 * O país também segue o número: sem disableCountryGuess nem forceDialCode,
 * escrever, colar ou o browser preencher "+44 7700 900123" muda a bandeira.
 * Com o forceDialCode a biblioteca recusava qualquer tecla que não
 * começasse pelo indicativo atual: "+447700900123" escrito por cima de
 * "+351 " ficava "+351 447700900123", o número errado da auditoria. O
 * indicativo continua preenchido à partida; quem o apagar e escrever um
 * número nacional vê a bandeira mudar e a validação explica (lib/phone.ts).
 *
 * No servidor não há browser: a primeira pintura usa só a língua do site e,
 * depois da hidratação, o campo ainda vazio passa para o país do browser
 * (useSyncExternalStore, sem diferenças entre o HTML do servidor e o React).
 */
export default function PhoneInput({ id, value, onChange, onBlur, placeholder = "Phone number *", className, describedBy, invalid }: PhoneInputProps) {
  const { i18n } = useTranslation();
  const languages = useSyncExternalStore(subscribeLanguages, browserLanguages, () => "");
  const defaultCountry = useMemo(
    () => defaultPhoneCountry({ languages: languages ? languages.split(",") : [], siteLang: i18n.language, supported: isSupported }),
    [languages, i18n.language],
  );
  const ref = useRef<PhoneInputRefType>(null);
  const appliedDefault = useRef(defaultCountry);
  useEffect(() => {
    if (appliedDefault.current === defaultCountry) return;
    appliedDefault.current = defaultCountry;
    const field = ref.current;
    const state = field?.state;
    if (!field || !state) return;
    // Só um campo ainda vazio (o indicativo sozinho) muda de país
    const national = state.phone.replace(/\D/g, "").slice(String(state.country?.dialCode ?? "").length);
    if (!national) field.setCountry(defaultCountry);
  }, [defaultCountry]);

  return (
    <div className={className}>
      <RIPPhoneInput
        ref={ref}
        defaultCountry={defaultCountry}
        value={value}
        onChange={onChange}
        // Nunca cortar algarismos em silêncio: "+44 07700 900123" fica inteiro
        // e a validação explica o 0 a mais (antes o 11.º algarismo desaparecia).
        allowMaskOverflow
        placeholder={placeholder}
        inputProps={{
          id,
          autoComplete: "tel",
          inputMode: "tel",
          "aria-label": placeholder,
          "aria-describedby": describedBy,
          "aria-invalid": invalid || undefined,
          onBlur,
        }}
        inputClassName="!w-full !h-full !bg-white !border-0 !border-r-0 !rounded-none !rounded-r-md !text-[16px] !text-[#1A1A18] !px-3 focus:!outline-none focus:!ring-0 !font-[inherit]"
        countrySelectorStyleProps={{
          buttonClassName: "!bg-white !border-0 !rounded-none !rounded-l-md !px-3 !h-full hover:!bg-[#F5F1EB] !transition-colors",
          dropdownStyleProps: {
            className: "!bg-white !border-[#E8E4DC] !rounded-lg !shadow-lg !z-[100] !max-h-[200px]",
            listItemClassName: "!text-[13px] !text-[#1A1A18] hover:!bg-[#F5F1EB] !px-3 !py-2",
          },
        }}
        className={`!flex !items-center !w-full !h-[52px] !bg-white !border ${invalid ? "!border-red-400" : "!border-[#E8E4DC]"} !rounded-md focus-within:!border-[#8B7355] focus-within:!ring-2 focus-within:!ring-[#8B7355] !transition`}
        style={{ height: "52px" }}
      />
    </div>
  );
}
