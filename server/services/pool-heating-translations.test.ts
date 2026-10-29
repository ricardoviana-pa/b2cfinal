import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A 24 set 2026 o aquecimento da piscina passou a extra pago (70 € por noite)
// só no inglês; as traduções continuaram a dizer "sem custos adicionais" (Eben
// Lodge) ou "por dia, mínimo 5 dias" até 29 out. Este teste prende as 8 casas.
const HOMES: Record<string, { name: string; minStay: boolean }> = {
  "696533466d209c001510ecfe": { name: "Eben Lodge", minStay: false },
  "696533284b583900135ceb91": { name: "Sunset Beach Lodge", minStay: false },
  "6965330729bb8c00141e8cd6": { name: "Hábitos Lodge", minStay: false },
  "69e7350685a8b000124854c5": { name: "Alvarinho Villa", minStay: false },
  "69c567ad7f6873000e9a3c37": { name: "Alentejo Rural Farmhouse", minStay: false },
  "6965332327950e001416f0b2": { name: "Cabedelo Beach Lodge", minStay: true },
  "6a3549e5edd13800142415e0": { name: "Canopy House", minStay: true },
  "6965331fec80690013738c68": { name: "Villa Aura", minStay: true },
};
const LANGS = ["pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
// "grátis / sem custos" e "por dia" nas 8 línguas.
const FREE = /sem custos adicionais|sans frais suppl|sin coste adicional|sin costo adicional|senza costi aggiuntivi|ohne zusätzliche Kosten|zonder extra kosten|utan extra kostnad|ilman lisämaksua/i;
const PER_DAY = /70\s?€\s?(\/|por |par |al |pro |per |om |)(dia|jour|día|giorno|Tag|dag|päivä)\b|70 euros?\s?\/\s?(dia|jour)/i;

function texts(entry: any): string[] {
  const out = [entry?.description, entry?.seoDescription, entry?.tagline];
  for (const v of Object.values(entry?.descriptionSections ?? {})) if (typeof v === "string") out.push(v);
  return out.filter((t): t is string => typeof t === "string");
}

describe("aquecimento da piscina nas traduções das 8 casas", () => {
  for (const lang of LANGS) {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "client/src/data/properties.i18n", `${lang}.json`), "utf8"));
    for (const [id, home] of Object.entries(HOMES)) {
      it(`${lang} · ${home.name}: 70 € por noite, nunca grátis nem por dia`, () => {
        const all = texts(file[id]).join("\n");
        expect(all).toMatch(/70/);
        expect(all).not.toMatch(FREE);
        expect(all).not.toMatch(PER_DAY);
      });
    }
  }
});
