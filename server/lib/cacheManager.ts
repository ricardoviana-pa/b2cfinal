import { BoundedMap, approxJsonBytes } from "./boundedMap";

type CacheEntry<T = unknown> = {
  value: T;
  expiresAt: number;
};

export class CacheManager {
  // Com teto (ver BoundedMap): as chaves de calendário levam as datas do pedido
  // e cresciam sem limite; um calendário de 12 meses pesa dezenas de KB.
  private store = new BoundedMap<string, CacheEntry>(1000, 48 * 1024 * 1024, (e) => approxJsonBytes(e.value));

  get<T = unknown>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T = unknown>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateByPrefix(prefix: string): void {
    const keys = Array.from(this.store.keys());
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

export const cacheManager = new CacheManager();
