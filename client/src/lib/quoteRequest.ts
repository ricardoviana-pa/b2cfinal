/** A quote belongs to one selection and one request. A changed selection
 * invalidates it immediately, including the debounce before the next fetch. */
export class QuoteRequestGate {
  private key = "";
  private generation = 0;

  select(key: string): void {
    if (key !== this.key) {
      this.key = key;
      this.generation++;
    }
  }

  begin(key: string): () => boolean {
    this.select(key);
    this.generation++;
    return this.capture();
  }

  /** Follow-up actions belong to the accepted quote without cancelling it. */
  capture(): () => boolean {
    const generation = this.generation;
    const key = this.key;
    return () => generation === this.generation && key === this.key;
  }

  invalidate(): void {
    this.generation++;
  }
}
