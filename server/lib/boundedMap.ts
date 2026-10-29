/**
 * Map com teto de entradas e, opcionalmente, de bytes.
 *
 * Ao passar do teto sai a entrada mais antiga pela ordem de inserção. Um set
 * de uma chave que já existe passa-a para o fim. Os bytes são estimados por
 * sizeOf no momento do set.
 *
 * Porquê: a produção corre num Render Starter com 512 MB. Várias caches não
 * tinham teto: páginas SSR, cotações, e calendários por cada combinação de
 * datas. Cresciam ao longo do dia e, num crawl, o Node abortou com
 * "JavaScript heap out of memory" (28 out 2026, 23:47 e 23:54 UTC), deixando
 * o site em 502 até reiniciar.
 *
 * Estende Map: quem já usava get/set/delete/iteração não muda.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  private readonly sizes = new Map<K, number>();
  private bytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number = Number.POSITIVE_INFINITY,
    private readonly sizeOf?: (value: V) => number,
  ) {
    super();
  }

  override set(key: K, value: V): this {
    if (super.has(key)) this.delete(key);
    super.set(key, value);
    if (this.sizeOf) {
      const size = Math.max(0, this.sizeOf(value) || 0);
      this.sizes.set(key, size);
      this.bytes += size;
    }
    while (super.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = super.keys().next().value as K | undefined;
      // Uma entrada sozinha maior que o teto fica (é a que se acabou de pedir).
      if (oldest === undefined || oldest === key) break;
      this.delete(oldest);
    }
    return this;
  }

  override delete(key: K): boolean {
    const size = this.sizes.get(key);
    if (size !== undefined) {
      this.bytes -= size;
      this.sizes.delete(key);
    }
    return super.delete(key);
  }

  override clear(): void {
    this.sizes.clear();
    this.bytes = 0;
    super.clear();
  }

  /** Bytes estimados das entradas atuais (0 sem sizeOf). */
  get approxBytes(): number {
    return this.bytes;
  }
}

/** Tamanho aproximado em memória de um valor serializável (UTF-16: 2 bytes por carácter). */
export function approxJsonBytes(value: unknown): number {
  try {
    return (JSON.stringify(value)?.length ?? 0) * 2;
  } catch {
    return 1024;
  }
}
