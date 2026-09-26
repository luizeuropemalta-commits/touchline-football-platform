import { parsePlayerSocialProviderId } from "./player-social-contract.ts";

type Listener = (event: MessageEvent) => void;
type Channel = {
  postMessage: (message: { providerId: string }) => void;
  addEventListener: (type: "message", listener: Listener) => void;
  removeEventListener: (type: "message", listener: Listener) => void;
  close: () => void;
};

/** Invalidation only: every subscriber must fetch its own server-authorised state. */
export function createPlayerSocialInvalidation(open: () => Channel | null) {
  const subscribers = new Set<{ providerId: string; refresh: () => void }>();
  let channel: Channel | null = null;
  const refresh = (providerId: string) => {
    for (const subscriber of subscribers) {
      if (subscriber.providerId === providerId) subscriber.refresh();
    }
  };
  const receive: Listener = ({ data }) => {
    if (!data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).length !== 1 || !parsePlayerSocialProviderId(data.providerId)) return;
    refresh(data.providerId);
  };
  return {
    subscribe(providerId: string, callback: () => void) {
      const subscriber = { providerId, refresh: callback };
      if (!subscribers.size) {
        try { channel = open(); channel?.addEventListener("message", receive); }
        catch { channel?.close(); channel = null; }
      }
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (!subscribers.size && channel) {
          channel.removeEventListener("message", receive);
          channel.close(); channel = null;
        }
      };
    },
    publish(providerId: string) {
      if (!parsePlayerSocialProviderId(providerId)) return;
      refresh(providerId);
      // Restricted browser contexts still retain local refresh and focus recovery.
      try { channel?.postMessage({ providerId }); } catch { /* focus will reconcile */ }
    },
  };
}

export const playerSocialInvalidation = createPlayerSocialInvalidation(() =>
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("touchline-player-social-changed") : null);
