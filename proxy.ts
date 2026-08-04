import { NextResponse, type NextRequest } from "next/server";

import {
  isTouchLinePublicWwwHost,
  isTouchLineVercelHost,
  resolveTouchLineRequestHostname,
} from "@/lib/server/touchline-host-routing";
import { TOUCHLINE_PUBLIC_ORIGIN } from "@/lib/touchlineArena/public-origin";
import {
  normalizeTouchLineAuthReturnTo,
  touchLinePostAuthHref,
} from "@/lib/touchlineArena/auth-i18n";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  hasTouchlineAuditToken,
  isTouchlineAuditExpired,
  isTouchlineAuditMode,
} from "@/lib/touchlineAudit/access";

const siteOffline = process.env.TOUCHLINE_SITE_OFFLINE === "true";
const localDevHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const authPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"] as const;
const authEntryPaths = ["/login", "/register", "/forgot-password"] as const;
const protectedArenaPaths = ["/arena", "/market-transfer", "/admin", "/notifications", "/inbox", "/football-search", "/visual-qa"] as const;
const adminOnlyArenaPaths = ["/admin", "/visual-qa"] as const;

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function offlineResponse() {
  return new NextResponse(
    `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>TouchLine — Em breve</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100svh;
        display: grid;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(circle at 50% 28%, rgba(168, 255, 56, .16), transparent 36%),
          linear-gradient(135deg, #020503, #07110b 48%, #010302);
        color: #f8fff1;
        font-family: Inter, Arial, Helvetica, sans-serif;
        padding: 32px;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -2;
        background: url("/touchlineArena/arena/touchline-arena-poster-20260722.jpg") center / cover no-repeat;
        opacity: .44;
        filter: saturate(1.05) contrast(1.08) brightness(.66);
      }
      body::after {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -1;
        background:
          radial-gradient(ellipse at center, rgba(5, 18, 10, .18), rgba(0,0,0,.84) 74%),
          linear-gradient(180deg, rgba(0,0,0,.24), rgba(0,0,0,.82));
      }
      main {
        width: min(620px, calc(100vw - 34px));
        min-height: 500px;
        display: grid;
        justify-items: center;
        align-content: center;
        gap: 18px;
        border: 1px solid rgba(168, 255, 56, .32);
        border-radius: 34px;
        background:
          radial-gradient(circle at 50% 10%, rgba(168, 255, 56, .13), transparent 32%),
          linear-gradient(145deg, rgba(3, 10, 8, .9), rgba(2, 4, 4, .74));
        padding: clamp(34px, 6vw, 68px);
        text-align: center;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 34px 110px rgba(0,0,0,.58),
          0 0 70px rgba(168,255,56,.08);
        backdrop-filter: blur(18px);
      }
      img {
        width: clamp(86px, 15vw, 136px);
        height: auto;
        filter:
          drop-shadow(0 0 16px rgba(168,255,56,.46))
          drop-shadow(0 0 44px rgba(168,255,56,.22));
      }
      small,
      strong {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        border: 1px solid rgba(168,255,56,.28);
        border-radius: 999px;
        padding: 0 15px;
        color: #caff72;
        background: rgba(4, 13, 8, .72);
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .16em;
        text-transform: uppercase;
        box-shadow: 0 0 18px rgba(168,255,56,.09);
      }
      h1 {
        margin: 0;
        font-size: clamp(52px, 8vw, 92px);
        line-height: .9;
        letter-spacing: -.055em;
        text-shadow: 0 0 32px rgba(168,255,56,.12), 0 12px 46px rgba(0,0,0,.8);
      }
      p {
        max-width: 500px;
        margin: 0;
        color: rgba(255,255,255,.72);
        font-size: clamp(15px, 2.2vw, 19px);
        line-height: 1.7;
        font-weight: 750;
      }
      strong {
        min-height: 44px;
        margin-top: 8px;
        padding: 0 24px;
        color: #071006;
        background: linear-gradient(135deg, #d9ff8f, #8cff22);
        box-shadow: 0 0 32px rgba(168,255,56,.24);
      }
      @media (max-width: 640px) {
        body { padding: 18px; }
        main {
          min-height: min(620px, calc(100svh - 36px));
          border-radius: 26px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <img src="/touchlineArena/brand/tl-shield-lime.png" alt="TouchLine" />
      <small>Private build</small>
      <h1>TouchLine Arena</h1>
      <p>Estamos preparando uma nova experiência premium de futebol, cards oficiais, ClubOwners e competições TouchLine.</p>
      <strong>Em breve</strong>
    </main>
  </body>
</html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    },
  );
}

function auditNotFound() {
  return new NextResponse("Not found", {
    status: 404,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
    },
  });
}

function redirectWithSupabaseCookies(url: URL, sourceResponse?: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  sourceResponse?.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

function loginRedirect(request: NextRequest, sourceResponse?: NextResponse) {
  const loginUrl = new URL("/login", request.url);
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang) loginUrl.searchParams.set("lang", lang);
  loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return redirectWithSupabaseCookies(loginUrl, sourceResponse);
}

function arenaRedirect(request: NextRequest, sourceResponse?: NextResponse) {
  const arenaUrl = new URL("/arena", request.url);
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang) arenaUrl.searchParams.set("lang", lang);
  return redirectWithSupabaseCookies(arenaUrl, sourceResponse);
}

/**
 * A malformed or stale Supabase browser cookie must never turn a public page
 * into an edge-function 500.  This can happen after an auth configuration
 * change or after a session is revoked on another device.  Clear only
 * Supabase-owned browser cookies and continue through the normal unauthenticated
 * route, so protected pages safely redirect to login.
 */
function clearInvalidSupabaseSession(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith("sb-") || name.startsWith("supabase-"))
    .forEach(({ name }) => {
      response.cookies.set(name, "", {
        expires: new Date(0),
        maxAge: 0,
        path: "/",
      });
    });
  return response;
}

async function handleTouchLineRequest(request: NextRequest) {
  const hostname = resolveTouchLineRequestHostname(
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    request.nextUrl.hostname,
  );
  const isLocalDev = localDevHosts.has(hostname);
  if (isLocalDev) return NextResponse.next();

  const pathname = request.nextUrl.pathname;

  const isAuditPath = pathname === "/audit-index" || pathname.startsWith("/audit/");

  // The external audit mirror is a separate preview deployment.  It does not
  // share routes, sessions or APIs with the real product: only static audit
  // pages under /audit and /audit-index can be reached, and only with its
  // deployment-scoped token.  This branch must remain before any Supabase work.
  if (isTouchlineAuditMode()) {
    const validToken = hasTouchlineAuditToken(request.nextUrl.searchParams.get("auditToken"));
    if (!isAuditPath || !validToken || isTouchlineAuditExpired()) {
      return auditNotFound();
    }
    const response = NextResponse.next({ request });
    response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive, nosnippet");
    return response;
  }
  // Audit pages are never product routes. If the dedicated preview mode is
  // absent, reject them before public routing or any Supabase access.
  if (isAuditPath) return auditNotFound();
  const isVercelHost = isTouchLineVercelHost(hostname);

  if (isTouchLinePublicWwwHost(hostname)) {
    const canonicalUrl = new URL(`${pathname}${request.nextUrl.search}`, TOUCHLINE_PUBLIC_ORIGIN);
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const isAuth = authPaths.some((path) => matchesRoute(pathname, path));
  const isAuthEntry = authEntryPaths.some((path) => matchesRoute(pathname, path));
  const isProtectedArenaRoute = protectedArenaPaths.some((path) => matchesRoute(pathname, path));
  const isAdminOnlyArenaRoute = adminOnlyArenaPaths.some((path) => matchesRoute(pathname, path));
  const isEmergencyOffline = siteOffline && !isVercelHost;

  if (isEmergencyOffline && !isProtectedArenaRoute && !isAuth) {
    return offlineResponse();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return isProtectedArenaRoute ? loginRedirect(request) : NextResponse.next();

  let response = NextResponse.next({ request });
  let user: { email?: string | null; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null = null;
  let isOwnerEmail: (email: string | null | undefined) => boolean = () => false;

  try {
    const [{ createServerClient }, ownerModule] = await Promise.all([
      import("@supabase/ssr"),
      import("@/lib/admin/owner"),
    ]);
    isOwnerEmail = ownerModule.isOwnerEmail;
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    response = clearInvalidSupabaseSession(request, response);
  }

  const isAdmin = isOwnerEmail(user?.email);
  if (!user && isProtectedArenaRoute) return loginRedirect(request, response);
  const hasArenaAccess = hasTouchLineArenaAccess(user);
  if (user && isProtectedArenaRoute && !hasArenaAccess) return loginRedirect(request, response);
  if (user && isAdminOnlyArenaRoute && !isAdmin) return arenaRedirect(request, response);
  if (isEmergencyOffline && user && !isAdmin && !isAuth) return offlineResponse();
  if (user && hasArenaAccess && isAuthEntry) {
    const lang = request.nextUrl.searchParams.get("lang");
    const returnTo = normalizeTouchLineAuthReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const destination = touchLinePostAuthHref(returnTo, lang);
    return redirectWithSupabaseCookies(new URL(destination, request.url), response);
  }
  return response;
}

/**
 * Edge middleware is the availability boundary for the public site.  If an
 * unexpected runtime failure escapes a dependency (including an auth SDK
 * update), preserve the secure failure mode for protected routes and keep
 * public pages available instead of returning Vercel's opaque 500 screen.
 */
export async function proxy(request: NextRequest) {
  try {
    return await handleTouchLineRequest(request);
  } catch {
    const isProtectedArenaRoute = protectedArenaPaths.some((path) => matchesRoute(request.nextUrl.pathname, path));
    return isProtectedArenaRoute ? loginRedirect(request) : NextResponse.next();
  }
}

export const config = {
  // API traffic is intentionally included: an audit deployment must reject it
  // before any route handler has a chance to read or mutate external state.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?)$).*)"],
};
