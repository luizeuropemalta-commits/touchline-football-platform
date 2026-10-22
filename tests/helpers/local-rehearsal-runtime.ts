/** General-suite rehearsal is in-memory only, never an arbitrary PostgreSQL DSN. */
export function createLocalRehearsalRuntime<T>(nativeOverride: string | undefined, createPGlite: () => T): T {
  if (nativeOverride !== undefined) {
    throw new Error('TOUCHLINE_NATIVE_REHEARSAL_DISABLED: use a separately provisioned disposable-cluster rehearsal; the general suite only supports PGlite');
  }
  return createPGlite();
}
