/** An explicit edit is the only authority to write remote Arena state. */
export function createArenaSaveIntent() {
  let principal: string | null = null;
  let revision = 0;
  let pending = false;
  const inFlight = new Map<string, number>();
  const uncertain = new Set<string>();
  return {
    scope(next: string | null) {
      if (principal !== next) { principal = next; revision++; pending = false; }
    },
    edit(next: string) {
      if (principal !== next || uncertain.has(next)) return null;
      pending = true;
      return ++revision;
    },
    ticket(next: string) { return pending && principal === next && !inFlight.has(next) && !uncertain.has(next) ? revision : null; },
    claim(next: string, ticket: number) {
      if (!pending || principal !== next || revision !== ticket || inFlight.has(next) || uncertain.has(next)) return false;
      pending = false; // Unknown/failed writes never retry without another edit.
      inFlight.set(next, ticket);
      return true;
    },
    settle(next: string, ticket: number, acknowledged: boolean) {
      if (inFlight.get(next) !== ticket) return false;
      inFlight.delete(next);
      if (!acknowledged) uncertain.add(next);
      return acknowledged && !uncertain.has(next);
    },
    blocked(next: string) { return uncertain.has(next); },
    owns(next: string) { return principal === next; },
    current(next: string, ticket: number) { return principal === next && revision === ticket; },
  };
}
