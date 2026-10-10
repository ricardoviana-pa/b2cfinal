import { describe, expect, it } from "vitest";
import {
  FREE_CANCELLATION_DAYS,
  POLICY_CODES,
  POLICY_LANGS,
  cancellationPolicyCopy,
  cancellationPolicyMetaDescription,
  cancellationPolicyPath,
  cancellationPolicySummary,
  cancellationFeeMatches,
  describeCancellationPolicy,
  freeCancellationDays,
  freeCancellationDeadline,
  isNonRefundablePlan,
  normalizePolicyCode,
  planPolicyCode,
  policyGenerosity,
  policyLang,
  policyRuleSentence,
  rateKind,
} from "../shared/cancellationPolicy";

// Guesty's codes as they arrive (read 10 Oct 2026) → the policy and its days.
const GUESTY = [
  { raw: "super_strict", code: "non_refundable", days: null },
  { raw: "NON_REFUNDABLE", code: "non_refundable", days: null },
  { raw: "MODERATE", code: "moderate", days: 7 },
  { raw: "FIRM", code: "firm", days: 14 },
  { raw: "STRICT", code: "strict", days: 30 },
  { raw: "STRICT_60", code: "strict_60", days: 60 },
] as const;

const TODAY = "2026-10-10";
const fmt = (ymd: string) => `<${ymd}>`;

describe("Guesty code → rule", () => {
  it("maps every code Guesty uses, in any case or shape", () => {
    for (const { raw, code, days } of GUESTY) {
      expect(normalizePolicyCode(raw)).toBe(code);
      expect(normalizePolicyCode(raw.toLowerCase())).toBe(code);
      expect(normalizePolicyCode([raw])).toBe(code);
      expect(freeCancellationDays(raw)).toBe(days);
    }
    expect(normalizePolicyCode("strict-60")).toBe("strict_60");
    expect(normalizePolicyCode(" Moderate ")).toBe("moderate");
  });

  it("matches the Guesty table exactly: 7, 14, 30 and 60 days, then 100 %", () => {
    expect(FREE_CANCELLATION_DAYS).toEqual({ moderate: 7, firm: 14, strict: 30, strict_60: 60 });
    expect(POLICY_CODES).toEqual(["non_refundable", "moderate", "firm", "strict", "strict_60"]);
  });

  it("knows nothing about other codes and never guesses", () => {
    for (const raw of ["flexible", "custom-flex", "", "unknown", null, undefined, 42, {}, [], ["moderate", "strict"], ["moderate", "flexible"]]) {
      expect(normalizePolicyCode(raw)).toBeNull();
      expect(freeCancellationDays(raw)).toBeNull();
      expect(freeCancellationDeadline(raw, "2027-01-20", TODAY)).toBeNull();
    }
    // the same code repeated is still that code
    expect(normalizePolicyCode(["FIRM", "firm"])).toBe("firm");
  });

  it("tells the non-refundable plan by its Guesty code or its Guesty name", () => {
    expect(isNonRefundablePlan({ name: "Não-Reembolsável", cancellationPolicy: [] })).toBe(true);
    expect(isNonRefundablePlan({ name: "Non Refundable" })).toBe(true);
    expect(isNonRefundablePlan({ name: "Tarifa", cancellationPolicy: ["super_strict"] })).toBe(true);
    expect(isNonRefundablePlan({ name: "Tarifa", cancellationPolicy: "NON_REFUNDABLE" })).toBe(true);
    // STRICT is refundable until 30 days — not the non-refundable plan
    expect(isNonRefundablePlan({ name: "Reembolsável Star Low 26/27", cancellationPolicy: ["STRICT"] })).toBe(false);
    expect(isNonRefundablePlan({ name: "Reembolsável Premium High 26", cancellationPolicy: ["STRICT_60"] })).toBe(false);
  });

  it("classifies a plan once, the same way for its card, the summary, the confirmation and the emails", () => {
    // non-refundable by Guesty's name even when the code is missing or odd
    expect(planPolicyCode({ name: "Não-Reembolsável", cancellationPolicy: [] })).toBe("non_refundable");
    expect(planPolicyCode({ name: "Não-Reembolsável", cancellationPolicy: ["something_else"] })).toBe("non_refundable");
    expect(planPolicyCode({ name: "Tarifa", cancellationPolicy: ["super_strict"], cancellationFee: 100 })).toBe("non_refundable");
    expect(planPolicyCode({ name: "Reembolsável Star Low 26/27", cancellationPolicy: ["MODERATE"], cancellationFee: 100 })).toBe("moderate");
    expect(planPolicyCode({ name: "Reembolsável Star Low 26/27", cancellationPolicy: "STRICT_60" })).toBe("strict_60");
    // unknown code → null (the terms-of-your-rate sentence)
    expect(planPolicyCode({ name: "Reembolsável Especial", cancellationPolicy: [] })).toBeNull();
    expect(planPolicyCode(undefined)).toBeNull();
  });

  it("does not state 100 % for a plan Guesty charges differently", () => {
    expect(cancellationFeeMatches(100)).toBe(true);
    expect(cancellationFeeMatches("100")).toBe(true);
    expect(cancellationFeeMatches("100%")).toBe(true);
    expect(cancellationFeeMatches(undefined)).toBe(true);
    expect(cancellationFeeMatches(null)).toBe(true);
    expect(cancellationFeeMatches(50)).toBe(false);
    expect(cancellationFeeMatches("abc")).toBe(false);
    expect(planPolicyCode({ name: "Reembolsável Star", cancellationPolicy: ["MODERATE"], cancellationFee: 50 })).toBeNull();
    expect(planPolicyCode({ name: "Não-Reembolsável", cancellationPolicy: ["super_strict"], cancellationFee: 0 })).toBeNull();
  });

  it("labels a card refundable only when Guesty says so", () => {
    expect(rateKind({ name: "Não-Reembolsável" })).toBe("non_refundable");
    expect(rateKind({ name: "Tarifa", cancellationPolicy: ["FIRM"] })).toBe("refundable");
    expect(rateKind({ name: "Reembolsável Star Low 26/27", cancellationPolicy: [] })).toBe("refundable");
    expect(rateKind({ name: "Rembolsável Premium High 26" })).toBe("refundable");
    expect(rateKind({ name: "Standard rate", cancellationPolicy: [] })).toBe("unknown");
    expect(rateKind({ name: "Flexible", cancellationPolicy: ["flexible"] })).toBe("unknown");
  });

  it("ranks equal prices by how long cancelling stays free", () => {
    const order = ["MODERATE", "FIRM", "STRICT", "STRICT_60", "super_strict"].map(policyGenerosity);
    expect([...order].sort((a, b) => b - a)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
    expect(policyGenerosity("flexible")).toBe(0);
  });

  it("puts the deadline N days before arrival and drops it once passed", () => {
    expect(freeCancellationDeadline("MODERATE", "2026-11-20", TODAY)).toBe("2026-11-13");
    expect(freeCancellationDeadline("FIRM", "2026-11-20", TODAY)).toBe("2026-11-06");
    expect(freeCancellationDeadline("STRICT", "2026-11-20", TODAY)).toBe("2026-10-21");
    expect(freeCancellationDeadline("STRICT_60", "2026-12-31", TODAY)).toBe("2026-11-01");
    // across a month and the clock change
    expect(freeCancellationDeadline("STRICT_60", "2026-11-20", TODAY)).toBeNull();
    // the deadline day itself is still "until"
    expect(freeCancellationDeadline("MODERATE", "2026-10-17", TODAY)).toBe("2026-10-10");
    expect(freeCancellationDeadline("MODERATE", "2026-10-16", TODAY)).toBeNull();
    expect(freeCancellationDeadline("super_strict", "2027-06-01", TODAY)).toBeNull();
    expect(freeCancellationDeadline("MODERATE", "not-a-date", TODAY)).toBeNull();
    expect(freeCancellationDeadline("MODERATE", "2026-02-30", TODAY)).toBeNull();
  });
});

describe("the words, in every language the site supports", () => {
  it("says exactly what Guesty says in Portuguese and English", () => {
    expect(policyRuleSentence("moderate", "pt")).toBe(
      "Cancelamento gratuito até 7 dias antes da chegada; depois, o valor total da estadia é cobrado.",
    );
    expect(policyRuleSentence("moderate", "en")).toBe(
      "Free cancellation until 7 days before arrival; after that, the full price of the stay is charged.",
    );
    expect(policyRuleSentence("firm", "pt")).toContain("até 14 dias antes da chegada");
    expect(policyRuleSentence("strict", "pt")).toContain("até 30 dias antes da chegada");
    expect(policyRuleSentence("strict_60", "pt")).toContain("até 60 dias antes da chegada");
    expect(policyRuleSentence("non_refundable", "pt")).toBe(
      "Tarifa não reembolsável: se cancelar, nada é reembolsado e o valor total da estadia é cobrado.",
    );
    expect(policyRuleSentence("non_refundable", "en")).toBe(
      "Non-refundable rate: if you cancel, nothing is refunded and the full price of the stay is charged.",
    );
  });

  it("has a distinct, complete sentence for every code in every language", () => {
    for (const lang of POLICY_LANGS) {
      const sentences = POLICY_CODES.map((code) => policyRuleSentence(code, lang));
      expect(new Set(sentences).size).toBe(POLICY_CODES.length);
      for (const code of POLICY_CODES) {
        const s = policyRuleSentence(code, lang);
        expect(s.length).toBeGreaterThan(40);
        expect(s).toMatch(/[.!]$/);
        // the old, wrong rules must never come back
        expect(s).not.toMatch(/50\s*%|24\s*h/);
        if (code !== "non_refundable") expect(s).toContain(String(FREE_CANCELLATION_DAYS[code]));
      }
      const copy = cancellationPolicyCopy(lang);
      for (const code of POLICY_CODES) expect(copy.names[code].length).toBeGreaterThan(2);
      expect(new Set(Object.values(copy.names)).size).toBe(POLICY_CODES.length);
    }
  });

  it("gives a concrete date while cancelling is free, and says when it no longer is", () => {
    for (const lang of POLICY_LANGS) {
      const copy = cancellationPolicyCopy(lang);
      for (const { raw, code, days } of GUESTY) {
        const open = describeCancellationPolicy(raw, { lang, checkIn: "2027-03-01", formatDate: fmt, today: TODAY });
        expect(open.code).toBe(code);
        expect(open.known).toBe(true);
        if (days == null) {
          expect(open.text).toBe(copy.nonRefundable);
          expect(open.deadline).toBeNull();
        } else {
          expect(open.deadline).toBe(freeCancellationDeadline(raw, "2027-03-01", TODAY));
          expect(open.text).toBe(copy.freeUntilDate(days, `<${open.deadline}>`));
          // the day count (Guesty's rule) always comes with the date
          expect(open.text).toContain(String(days));
          expect(open.text).toContain(`(<${open.deadline}>)`);
          const passed = describeCancellationPolicy(raw, { lang, checkIn: "2026-10-11", formatDate: fmt, today: TODAY });
          expect(passed.text).toBe(copy.windowPassed);
          const noDate = describeCancellationPolicy(raw, { lang });
          expect(noDate.text).toBe(copy.freeUntilDays(days));
        }
      }
    }
  });

  it("falls back to the terms of the rate when the code is unknown — never Guesty's plan name", () => {
    for (const lang of POLICY_LANGS) {
      const copy = cancellationPolicyCopy(lang);
      for (const raw of ["flexible", undefined, [], ["MODERATE", "STRICT"]]) {
        const d = describeCancellationPolicy(raw, { lang, checkIn: "2027-03-01" });
        expect(d.known).toBe(false);
        expect(d.code).toBeNull();
        expect(d.text).toBe(copy.unknown);
      }
      expect(copy.termsLink.length).toBeGreaterThan(5);
      expect(cancellationPolicyPath(lang)).toBe(`/${lang}/legal/cancellation-policy`);
    }
  });

  it("links a known code to its own section of the policy page", () => {
    expect(cancellationPolicyPath("pt", "MODERATE")).toBe("/pt/legal/cancellation-policy#moderate");
    expect(cancellationPolicyPath("en", "STRICT_60")).toBe("/en/legal/cancellation-policy#strict-60");
    expect(cancellationPolicyPath("fr", "super_strict")).toBe("/fr/legal/cancellation-policy#non-refundable");
    expect(cancellationPolicyPath("xx", "flexible")).toBe("/en/legal/cancellation-policy");
  });

  it("summarises every policy for the FAQ, terms, PDP and meta, with other platforms", () => {
    for (const lang of POLICY_LANGS) {
      const summary = cancellationPolicySummary(lang);
      const meta = cancellationPolicyMetaDescription(lang);
      for (const days of [7, 14, 30, 60]) {
        expect(summary).toContain(String(days));
        expect(meta).toContain(String(days));
      }
      expect(summary).not.toMatch(/50\s*%|24\s*h/);
      expect(summary.length).toBeGreaterThan(meta.length);
      expect(cancellationPolicyCopy(lang).otherPlatformsBody).toMatch(/Airbnb/);
      // fits the 155-character meta description without being cut mid-sentence
      expect(meta.length).toBeLessThanOrEqual(155);
    }
    expect(cancellationPolicySummary("pt")).toContain("até 7, 14, 30 ou 60 dias antes da chegada");
    expect(cancellationPolicySummary("en")).toContain("until 7, 14, 30 or 60 days before arrival");
  });

  it("falls back to English for an unsupported language", () => {
    expect(policyLang("ja")).toBe("en");
    expect(policyLang("pt-PT")).toBe("pt");
    expect(policyRuleSentence("firm", "ja")).toBe(policyRuleSentence("firm", "en"));
  });
});
