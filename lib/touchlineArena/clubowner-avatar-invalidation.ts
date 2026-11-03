import { createPlayerSocialInvalidation } from "./player-social-invalidation.ts";
// Reuse the bounded lifecycle/invalidation-only bus; no account, photo URL or
// authorization is transmitted. Every consumer re-reads its public projection.
export function createClubOwnerAvatarInvalidation(open: Parameters<typeof createPlayerSocialInvalidation>[0]) {
  const bus = createPlayerSocialInvalidation(open);
  let subscriptions = 0;
  return {
    subscribe(refresh: () => void) {
      const unsubscribe = bus.subscribe("1", refresh); subscriptions++;
      let active = true;
      return () => { if (active) { active = false; subscriptions--; unsubscribe(); } };
    },
    publish() {
      bus.publish("1");
      // Upload/settings screens need not render any public photo. They must
      // still invalidate readers in other tabs after a confirmed change.
      if (subscriptions) return;
      let channel: ReturnType<typeof open> = null;
      try { channel = open(); channel?.postMessage({ providerId: "1" }); }
      catch { /* Poll/focus remains available when browser channels are blocked. */ }
      finally { channel?.close(); }
    },
  };
}
export const clubOwnerAvatarInvalidation = createClubOwnerAvatarInvalidation(() =>
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("touchline-owner-photo-changed") : null);
