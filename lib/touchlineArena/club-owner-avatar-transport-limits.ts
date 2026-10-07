/** Conservative raw-request and image-response ceiling, inclusive, in bytes.
 * Client-safe: no native/server imports. This does not change the decoder or
 * private bucket's separate 5 MiB limit, or prove hosted ingress admission.
 */
export const CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES = 4_000_000;
