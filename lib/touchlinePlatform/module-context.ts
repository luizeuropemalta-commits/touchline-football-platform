export const TOUCHLINE_PLATFORM_MODULES = [
  "game",
  "agent",
  "club",
  "scout",
  "academy",
  "marketplace",
  "analytics",
] as const;

export type TouchlinePlatformModule = (typeof TOUCHLINE_PLATFORM_MODULES)[number];

/** One principal is shared across every current or future TouchLine module. */
export type TouchlinePlatformPrincipal = Readonly<{
  userId: string;
  profileId: string;
  sessionId: string;
}>;

export type TouchlinePlatformModuleContext = Readonly<{
  principal: TouchlinePlatformPrincipal;
  activeModule: TouchlinePlatformModule;
}>;

/**
 * Architecture-only context. It does not create authentication, a profile,
 * a session, a route, a visual selector or any module-specific user record.
 */
export function createTouchlinePlatformModuleContext(input: {
  principal: TouchlinePlatformPrincipal;
  activeModule: TouchlinePlatformModule;
}): TouchlinePlatformModuleContext {
  if (!input.principal.userId.trim() || !input.principal.profileId.trim() || !input.principal.sessionId.trim()) {
    throw new Error("TouchLine Platform requires one existing global principal.");
  }
  return { principal: input.principal, activeModule: input.activeModule };
}
