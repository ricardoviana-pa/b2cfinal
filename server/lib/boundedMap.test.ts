import { describe, expect, it } from "vitest";
import { BoundedMap, approxJsonBytes } from "./boundedMap";
import { CacheManager } from "./cacheManager";

describe("BoundedMap", () => {
  it("guarda no máximo maxEntries e tira primeiro a entrada mais antiga", () => {
    const m = new BoundedMap<string, number>(3);
    m.set("a", 1).set("b", 2).set("c", 3).set("d", 4);
    expect([...m.keys()]).toEqual(["b", "c", "d"]);
    expect(m.get("a")).toBeUndefined();
  });

  it("um set de uma chave existente passa-a para o fim", () => {
    const m = new BoundedMap<string, number>(3);
    m.set("a", 1).set("b", 2).set("c", 3).set("a", 10).set("d", 4);
    expect([...m.entries()]).toEqual([["c", 3], ["a", 10], ["d", 4]]);
  });

  it("respeita o teto de bytes e não apaga a entrada acabada de guardar", () => {
    const m = new BoundedMap<string, string>(100, 10, (v) => v.length);
    m.set("a", "1234").set("b", "1234");
    expect(m.approxBytes).toBe(8);
    m.set("c", "1234");
    expect([...m.keys()]).toEqual(["b", "c"]);
    expect(m.approxBytes).toBe(8);
    m.set("big", "x".repeat(50));
    expect([...m.keys()]).toEqual(["big"]);
    expect(m.approxBytes).toBe(50);
  });

  it("delete e clear acertam os bytes; a iteração e o delete durante a iteração funcionam como num Map", () => {
    const m = new BoundedMap<string, string>(10, 1000, (v) => v.length);
    m.set("a", "xx").set("b", "yyy").set("c", "z");
    m.delete("b");
    expect(m.approxBytes).toBe(3);
    for (const [k, v] of m) if (v === "z") m.delete(k);
    expect([...m.keys()]).toEqual(["a"]);
    m.clear();
    expect(m.size).toBe(0);
    expect(m.approxBytes).toBe(0);
  });

  it("approxJsonBytes: 2 bytes por carácter e nunca rebenta", () => {
    expect(approxJsonBytes({ a: 1 })).toBe(14);
    const circular: any = {};
    circular.self = circular;
    expect(approxJsonBytes(circular)).toBe(1024);
  });
});

describe("CacheManager com teto", () => {
  it("continua a expirar e a invalidar por prefixo", () => {
    const c = new CacheManager();
    c.set("calendar:x:2027-01-01:2027-01-31", { days: [1, 2, 3] }, 60_000);
    c.set("calendar:y:2027-01-01:2027-01-31", { days: [4] }, 60_000);
    c.set("listing:x", { id: "x" }, -1);
    expect(c.get("listing:x")).toBeNull();
    c.invalidateByPrefix("calendar:x:");
    expect(c.get("calendar:x:2027-01-01:2027-01-31")).toBeNull();
    expect(c.get("calendar:y:2027-01-01:2027-01-31")).toEqual({ days: [4] });
  });

  it("não passa das 1000 entradas, por mais datas diferentes que se peçam", () => {
    const c = new CacheManager();
    for (let i = 0; i < 1500; i++) c.set(`calendar:x:${i}`, { days: [i] }, 60_000);
    expect(c.get("calendar:x:0")).toBeNull();
    expect(c.get("calendar:x:1499")).toEqual({ days: [1499] });
    expect((c as any).store.size).toBe(1000);
  });
});
