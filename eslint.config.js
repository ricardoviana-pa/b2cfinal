// Design-system guardrails (auditoria set/2026, N16/S2/S3).
// The funnel pages are token-clean after scripts/codemod-tokens.mjs and must
// stay so (error); the rest of client/src warns until each page is migrated.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Only the palette colours are errors — a one-off (an amber warning, a green
// tick) may keep its hex; a palette colour must use its token.
const PALETTE_HEX = "#(1A1A18|8B7355|E8E4DC|726D63|6B6860|FAFAF7|F5F1EB|C4A87C|78756F|806A48)";
const HEX = "#[0-9a-fA-F]{6}";
// Sizes the scale covers (scripts/codemod-tokens.mjs): 9–18px. Larger
// arbitrary sizes are usually display type and stay a warning.
const PX = "text-\\[(9|10|11|11\\.5|12|12\\.5|13|13\\.5|14|15|16|17|18)px\\]";
const restricted = (level, hex = level === "error" ? PALETTE_HEX : HEX) => ({
  "no-restricted-syntax": [
    level,
    { selector: `JSXAttribute[name.name='className'] Literal[value=/${hex}/i]`, message: "Hard-coded palette hex in className — use its token (text-pa-dark, bg-pa-cream, border-pa-sand…; see index.css @theme)." },
    { selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${hex}/i]`, message: "Hard-coded palette hex in className — use its token (see index.css @theme)." },
    { selector: `JSXAttribute[name.name='className'] Literal[value=/${PX}/]`, message: "Arbitrary text-[Npx] — use the type scale (headline-*, body-*, caption, overline)." },
    { selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${PX}/]`, message: "Arbitrary text-[Npx] — use the type scale (headline-*, body-*, caption, overline)." },
  ],
});

const FUNNEL = [
  "client/src/pages/Home.tsx",
  "client/src/pages/Homes.tsx",
  "client/src/pages/PropertyDetail.tsx",
  "client/src/components/booking/BookingWidget.tsx",
  "client/src/pages/checkout/**/*.tsx",
];

export default [
  { ignores: ["dist/**", "node_modules/**", "server/**", "scripts/**", "client/src/components/ui/**", "**/*.test.*"] },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...restricted("warn"), "react-hooks/rules-of-hooks": "warn", "react-hooks/exhaustive-deps": "warn" },
  },
  { files: FUNNEL, rules: restricted("error") },
];
