export const TOUCHLINE_ARENA_ACCESS_METADATA_KEY = "touchline_arena_access_v1";

type TouchLineArenaAccessUser = {
  app_metadata?: Record<string, unknown> | null;
};

export function hasTouchLineArenaAccess(user: TouchLineArenaAccessUser | null | undefined) {
  return user?.app_metadata?.[TOUCHLINE_ARENA_ACCESS_METADATA_KEY] === true;
}
