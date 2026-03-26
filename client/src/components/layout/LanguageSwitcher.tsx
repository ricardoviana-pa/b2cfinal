import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "EN", name: "English" },
  { code: "pt", label: "PT", name: "Português" },
  { code: "fr", label: "FR", name: "Français" },
  { code: "es", label: "ES", name: "Español" },
  { code: "it", label: "IT", name: "Italiano" },
  { code: "fi", label: "FI", name: "Suomi" },
  { code: "de", label: "DE", name: "Deutsch" },
  { code: "nl", label: "NL", name: "Nederlands" },
  { code: "sv", label: "SV", name: "Svenska" },
] as const;

function normalizeCode(lng: string): string {
  const base = (lng || "en").split("-")[0]?.toLowerCase() || "en";
  return LANGUAGES.some((l) => l.code === base) ? base : "en";
}

type Tone = "light" | "dark";

/**
 * Desktop: EN · PT · FR · … — Mobile: native select (9 languages).
 * `tone="dark"` for transparent / hero headers (light text).
 */
export default function LanguageSwitcher({
  className = "",
  tone = "light",
}: {
  className?: string;
  tone?: Tone;
}) {
  const { i18n, t } = useTranslation();
  const active = normalizeCode(i18n.language);
  const activePill = tone === "dark" ? "text-[#C4A87C] font-medium" : "text-[#8B7355] font-medium";
  const inactivePill =
    tone === "dark"
      ? "text-white/70 hover:text-white"
      : "text-[#9E9A90] hover:text-[#1A1A18]";
  const sep = tone === "dark" ? "text-white/25" : "text-[#E8E4DC]";
  const selectCls =
    tone === "dark"
      ? "text-white border-none bg-transparent"
      : "text-[#1A1A18] bg-transparent border-none";

  return (
    <div className={className}>
      <div className="hidden md:flex items-center flex-wrap justify-end gap-0 max-w-[min(100%,420px)]">
        {LANGUAGES.map((lang, i) => (
          <span key={lang.code} className="inline-flex items-center">
            {i > 0 ? <span className={`${sep} select-none px-1`}>·</span> : null}
            <button
              type="button"
              onClick={() => void i18n.changeLanguage(lang.code)}
              className={`${active === lang.code ? activePill : inactivePill} transition-colors cursor-pointer text-[13px] px-0.5`}
            >
              {lang.label}
            </button>
          </span>
        ))}
      </div>
      <select
        aria-label={t("common.language")}
        className={`md:hidden text-[13px] focus:outline-none cursor-pointer font-medium max-w-[72px] ${selectCls}`}
        value={active}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
