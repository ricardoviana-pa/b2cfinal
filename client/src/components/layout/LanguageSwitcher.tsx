import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Globe, Check } from "lucide-react";

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

export default function LanguageSwitcher({
  className = "",
  tone = "light",
}: {
  className?: string;
  tone?: Tone;
}) {
  const { i18n, t } = useTranslation();
  const [location] = useLocation();
  const active = normalizeCode(i18n.language);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const iconColor =
    tone === "dark"
      ? `text-white/70 hover:text-white ${open ? "bg-white/15 text-white" : ""}`
      : `text-[#6B6860] hover:text-[#1A1A18] ${open ? "bg-[#F5F1EB] text-[#1A1A18]" : ""}`;

  const activeLabel = LANGUAGES.find((l) => l.code === active)?.label ?? "EN";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 justify-center h-9 px-2 transition-all duration-200 cursor-pointer ${iconColor}`}
        style={{ minHeight: "auto", minWidth: "auto" }}
        aria-label={t("common.language")}
      >
        <Globe className="w-[17px] h-[17px]" />
        <span className="text-[11px] font-medium tracking-wide">
          {activeLabel}
        </span>
      </button>

      <div
        className={`absolute top-full right-0 mt-2 bg-white border border-[#E8E4DC]/60 shadow-lg py-2 w-[200px] transition-all duration-200 origin-top-right z-[60] ${
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => {
              // Build new URL with locale prefix swapped
              const currentPath = window.location.pathname;
              const segments = currentPath.split('/').filter(Boolean);
              const supportedLangs = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];
              if (segments[0] && supportedLangs.includes(segments[0].toLowerCase())) {
                segments.shift();
              }
              const restPath = segments.length > 0 ? '/' + segments.join('/') : '';
              const newUrl = `/${lang.code}${restPath}${window.location.search}${window.location.hash}`;

              // Persist choice in localStorage before navigating
              try { localStorage.setItem('i18nextLng', lang.code); } catch {}

              // Full page navigation — re-mounts Router with new base path,
              // avoids wouter's ~ prefix conflicts from out-of-band pushState
              window.location.assign(newUrl);
              setOpen(false);
            }}
            className={`flex items-center justify-between w-full px-4 py-2.5 text-left transition-colors cursor-pointer ${
              active === lang.code
                ? "bg-[#FAFAF7]"
                : "hover:bg-[#FAFAF7]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`text-[11px] font-medium tracking-wide ${
                  active === lang.code ? "text-[#8B7355]" : "text-[#9E9A90]"
                }`}
              >
                {lang.label}
              </span>
              <span
                className={`text-[13px] ${
                  active === lang.code
                    ? "text-[#1A1A18] font-medium"
                    : "text-[#6B6860]"
                }`}
              >
                {lang.name}
              </span>
            </div>
            {active === lang.code && (
              <Check className="w-3.5 h-3.5 text-[#8B7355]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
