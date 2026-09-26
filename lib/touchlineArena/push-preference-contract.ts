export type TouchlinePushEnvironment = Readonly<Record<string, string | undefined>>;

const URL_SAFE_KEY = /^[A-Za-z0-9_-]{16,512}$/;

function hasVapidSubject(value: string | undefined) {
  const subject = value?.trim() ?? "";
  return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(subject)
    || /^https:\/\/[^\s/?#]+(?:\/[^\s]*)?$/i.test(subject);
}

/**
 * Remote Push is unavailable unless the server has every VAPID value required
 * to deliver it. The public key alone only lets a browser create a subscription;
 * it must never be treated as delivery capability.
 */
export function hasTouchlineServerPushConfiguration(environment: TouchlinePushEnvironment = process.env) {
  return URL_SAFE_KEY.test(environment.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY?.trim() ?? "")
    && URL_SAFE_KEY.test(environment.TOUCHLINE_WEB_PUSH_PRIVATE_KEY?.trim() ?? "")
    && hasVapidSubject(environment.TOUCHLINE_WEB_PUSH_SUBJECT);
}

/**
 * This is the final server-side guard used by the authenticated preferences
 * route. A direct PUT cannot persist push=true unless delivery is actually
 * possible for this user on at least one registered device.
 */
export function resolveTouchlinePushPreference(input: Readonly<{
  requested: boolean;
  serverConfigured: boolean;
  hasRegisteredDevice: boolean;
  explicitConsent: unknown;
}>) {
  return input.explicitConsent === true && input.requested && input.serverConfigured && input.hasRegisteredDevice;
}
