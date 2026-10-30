import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  CountrySelector,
  defaultCountries,
  parseCountry,
  usePhoneInput,
} from "react-international-phone";
import { useTranslation } from "react-i18next";
import "react-international-phone/style.css";
import { defaultPhoneCountry, phoneEntry } from "@/lib/phone";

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
  /** País do campo (ISO2 em minúsculas, "pt"), na montagem e sempre que muda:
   *  a bandeira escolhida ou o indicativo do número. É o país de faturação do
   *  Klarna (shared/klarna.ts). */
  onCountryChange?: (iso2: string) => void;
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
 * O país segue o número internacional ("+44 7700 900123" escrito, colado ou
 * preenchido pelo browser muda a bandeira), mas algarismos sem "+" nem "00"
 * são sempre um número nacional do país escolhido (phoneEntry): sem isso,
 * "927161771" escrito num campo apagado virava +92 (Paquistão) e passava a
 * validação (revisão do PR #176). Por isso o campo é montado aqui com o
 * usePhoneInput da biblioteca: o <input> passa primeiro por phoneEntry e só
 * depois pelo handlePhoneValueChange dela. Sem o forceDialCode, que recusava
 * "+44…" escrito por cima de "+351 " e engolia o 1.º algarismo escrito sobre
 * o campo selecionado.
 *
 * No servidor não há browser: a primeira pintura usa só a língua do site e,
 * depois da hidratação, o campo ainda vazio passa para o país do browser
 * (useSyncExternalStore, sem diferenças entre o HTML do servidor e o React).
 */
export default function PhoneInput({ id, value, onChange, onBlur, placeholder = "Phone number *", className, describedBy, invalid, onCountryChange }: PhoneInputProps) {
  const { i18n } = useTranslation();
  const languages = useSyncExternalStore(subscribeLanguages, browserLanguages, () => "");
  const defaultCountry = useMemo(
    () => defaultPhoneCountry({ languages: languages ? languages.split(",") : [], siteLang: i18n.language, supported: isSupported }),
    [languages, i18n.language],
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { phone, inputValue, country, setCountry, handlePhoneValueChange, inputRef } = usePhoneInput({
    defaultCountry,
    value,
    // Nunca cortar algarismos em silêncio: "+44 07700 900123" fica inteiro
    // e a validação explica o 0 a mais (antes o 11.º algarismo desaparecia).
    allowMaskOverflow: true,
    onChange: ({ phone: next }) => onChangeRef.current(next),
  });

  const live = useRef({ phone, dialCode: country.dialCode, setCountry });
  live.current = { phone, dialCode: country.dialCode, setCountry };
  // O país do campo sobe para quem precisa dele (Klarna): na montagem e a cada mudança.
  const onCountryChangeRef = useRef(onCountryChange);
  onCountryChangeRef.current = onCountryChange;
  useEffect(() => {
    onCountryChangeRef.current?.(country.iso2);
  }, [country.iso2]);
  const appliedDefault = useRef(defaultCountry);
  useEffect(() => {
    if (appliedDefault.current === defaultCountry) return;
    appliedDefault.current = defaultCountry;
    const { phone: current, dialCode, setCountry: apply } = live.current;
    // Só um campo ainda vazio (o indicativo sozinho) muda de país
    const national = current.replace(/\D/g, "").slice(String(dialCode ?? "").length);
    if (!national) apply(defaultCountry);
  }, [defaultCountry]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const native = e.nativeEvent as Partial<InputEvent>;
      const entry = phoneEntry({ raw: e.target.value, dialCode: country.dialCode, inputType: native?.inputType, data: native?.data });
      if (entry.value === e.target.value && entry.inputType === native?.inputType) {
        handlePhoneValueChange(e);
        return;
      }
      // A biblioteca só lê nativeEvent.inputType/data, target.value/selectionStart e preventDefault.
      handlePhoneValueChange({
        nativeEvent: { inputType: entry.inputType, data: native?.data ?? null },
        target: { value: entry.value, selectionStart: entry.value.length },
        preventDefault: () => e.preventDefault(),
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    },
    [country.dialCode, handlePhoneValueChange],
  );

  return (
    <div className={className}>
      <div
        className={`react-international-phone-input-container !flex !items-center !w-full !h-[52px] !bg-white !border ${invalid ? "!border-red-400" : "!border-[#E8E4DC]"} !rounded-md focus-within:!border-[#8B7355] focus-within:!ring-2 focus-within:!ring-[#8B7355] !transition`}
        style={{ height: "52px" }}
      >
        <CountrySelector
          selectedCountry={country.iso2}
          onSelect={(c) => setCountry(c.iso2, { focusOnInput: true })}
          buttonClassName="!bg-white !border-0 !rounded-none !rounded-l-md !px-3 !h-full hover:!bg-[#F5F1EB] !transition-colors"
          dropdownStyleProps={{
            className: "!bg-white !border-[#E8E4DC] !rounded-lg !shadow-lg !z-[100] !max-h-[200px]",
            listItemClassName: "!text-[13px] !text-[#1A1A18] hover:!bg-[#F5F1EB] !px-3 !py-2",
          }}
        />
        <input
          ref={inputRef}
          id={id}
          type="tel"
          value={inputValue}
          onChange={handleChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete="tel"
          inputMode="tel"
          aria-label={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="react-international-phone-input !w-full !h-full !bg-white !border-0 !border-r-0 !rounded-none !rounded-r-md !text-[16px] !text-[#1A1A18] !px-3 focus:!outline-none focus:!ring-0 !font-[inherit]"
        />
      </div>
    </div>
  );
}
