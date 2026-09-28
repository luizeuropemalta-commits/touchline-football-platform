export function unstable_cache() { return () => { throw new Error('Unexpected cached read'); }; }
export function revalidateTag() { throw new Error('Unexpected cache mutation'); }
// Request-local cache opt-out has no persistence in this isolated reader test.
export function unstable_noStore() {}
