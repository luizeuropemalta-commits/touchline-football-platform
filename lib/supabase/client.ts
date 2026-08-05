import {
  createBrowserClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key, {
    // Keep profile metadata and media out of the authentication cookie. The
    // browser stores the user payload separately while the cookie contains
    // only the tokens required by server routes.
    cookies: {
      encode: "tokens-only",
      getAll: () => parseCookieHeader(document.cookie).map(({ name, value }) => ({
        name,
        value: value ?? "",
      })),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, options);
        });
      },
    },
  });
}
