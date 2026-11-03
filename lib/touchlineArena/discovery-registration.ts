/** Explicit signup intent; never derive public identity from email or legal name. */
export function discoveryRegistrationIntent(name: unknown) {
  if (typeof name !== "string") return null;
  const publicName = name.trim();
  if ([...publicName].length < 2 || [...publicName].length > 60 || /[\x00-\x1f\x7f-\x9f@]/u.test(publicName)) return null;
  return { touchline_discovery_signup_v1: { version: 1, public_name: publicName, published: true } };
}
