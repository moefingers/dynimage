// Request-scoped deduplication. A DedupeCache lives for the lifetime of
// one render call (simple card or compound) and ensures any atomic query
// called twice with identical params returns the same in-flight promise.
//
// This is the DataLoader pattern reduced to its essentials. Without it,
// a compound card that uses three sub-cards all needing the same user
// lookup would make three round-trips to GitHub instead of one.
//
// Process-level caching is left to Next's fetch cache layer (see
// data/client.ts). DedupeCache only addresses redundancy WITHIN one
// render — not across requests.
export class DedupeCache {
  private inFlight = new Map<string, Promise<unknown>>();

  get<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const p = run();
    this.inFlight.set(key, p);
    return p;
  }
}
