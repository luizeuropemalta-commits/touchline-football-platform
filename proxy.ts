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
import { touchlineClubOwnerSlugForUser } from "@/lib/touchlineArena/club-owner-page-identity";
import { resolveTouchlineClubOwnerRouteAccess } from "@/lib/touchlineArena/club-owner-route-access";
import {
  touchlineClubOwnerSelfHref,
  type TouchlineClubOwnerSelfArea,
} from "@/lib/touchlineArena/club-owner-routes";
import {
  resolveTouchLinePresentationLocale,
  touchlineLocaleRequestNeedsCanonicalRedirect,
  TOUCHLINE_PRESENTATION_LOCALE_HEADER,
} from "@/lib/touchlineArena/root-locale";
import {
  hasTouchlineAuditToken,
  isTouchlineAuditExpired,
  isTouchlineAuditMode,
} from "@/lib/touchlineAudit/access";
import {
  resolveTouchlineIsolatedPreviewRoutePolicy,
  TOUCHLINE_ISOLATED_PREVIEW_HEADER,
  type TouchlineIsolatedPreviewRoutePolicy,
} from "@/lib/touchlinePreview/isolation";
import {
  isTouchlineQaAuthenticatedVisualReviewRoute,
  TOUCHLINE_STABLE_QA_HOST,
} from "@/lib/touchlinePreview/qa-visual-review";

const siteOffline = process.env.TOUCHLINE_SITE_OFFLINE === "true";
const localDevHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const authPaths = ["/login", "/admin/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"] as const;
const authEntryPaths = ["/login", "/register", "/forgot-password"] as const;
// The Arena itself is the public product entrance. Account-backed operations
// remain protected and their APIs independently enforce the same capability.
const protectedArenaPaths = ["/market-transfer", "/fantasy", "/admin", "/notifications", "/inbox", "/football-search", "/visual-qa"] as const;
const adminOnlyArenaPaths = ["/admin", "/visual-qa"] as const;

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

async function hasQaSocialRenderBearer(request: NextRequest, hostname: string) {
  const internalSocialPaths = new Set([
    "/visual-qa/social-lineup",
    "/visual-qa/social-match-preview",
    "/visual-qa/social-full-time",
    "/visual-qa/social-final-score",
    "/visual-qa/social-confirmed-event",
    "/visual-qa/social-ranking",
    "/api/admin/social-publications/source",
  ]);
  const isQaRenderHost = hostname === TOUCHLINE_STABLE_QA_HOST || hostname === "localhost";
  if (process.env.VERCEL_ENV === "production"
    || !isQaRenderHost
    || !internalSocialPaths.has(request.nextUrl.pathname)) return false;
  const secret = process.env.TOUCHLINE_LIVE_SYNC_SECRET?.trim() ?? "";
  const provided = request.cookies.get("tl-social-render")?.value?.trim() ?? "";
  if (secret.length < 32) return false;
  if (provided.length !== secret.length) return false;
  const encoder = new TextEncoder();
  const [expectedDigest, providedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const expected = new Uint8Array(expectedDigest);
  const actual = new Uint8Array(providedDigest);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index]! ^ actual[index]!;
  return difference === 0;
}

function offlineResponse(locale: "en-GB" | "pt-BR") {
  const isPortuguese = locale === "pt-BR";
  const title = isPortuguese ? "TouchLine — Temporariamente indisponível" : "TouchLine — Temporarily unavailable";
  const description = isPortuguese
    ? "A Arena está temporariamente indisponível. Tente novamente em instantes."
    : "The Arena is temporarily unavailable. Please try again shortly.";
  const statusLabel = isPortuguese ? "Tente novamente em instantes" : "Please try again shortly";

  return new NextResponse(
    `<!doctype html>
<html lang="${locale}" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>${title}</title>
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
      <p>${description}</p>
      <strong>${statusLabel}</strong>
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
  const adminEntry = matchesRoute(request.nextUrl.pathname, "/admin")
    || matchesRoute(request.nextUrl.pathname, "/visual-qa");
  const loginUrl = new URL(adminEntry ? "/admin/login" : "/login", request.url);
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang) loginUrl.searchParams.set("lang", lang);
  loginUrl.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return redirectWithSupabaseCookies(loginUrl, sourceResponse);
}

function requestLocale(request: NextRequest) {
  return resolveTouchLinePresentationLocale(request.nextUrl.searchParams.get("lang"));
}

function canonicalPresentationLocaleRedirect(request: NextRequest) {
  const requestedLocale = request.nextUrl.searchParams.get("lang");
  if (!touchlineLocaleRequestNeedsCanonicalRedirect(requestedLocale)) return null;

  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.searchParams.set("lang", requestLocale(request));
  return NextResponse.redirect(canonicalUrl, 307);
}

/**
 * App Router layouts do not receive query parameters. Forward the canonical
 * public presentation locale through the request so `<html lang>` and the
 * first server render match `?lang=` before client hydration runs.
 */
function nextResponseWithPresentationLocale(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TOUCHLINE_PRESENTATION_LOCALE_HEADER, requestLocale(request));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function applyIsolatedPreviewHeaders(response: NextResponse) {
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate");
  response.headers.set("x-robots-tag", "noindex, nofollow, noarchive, nosnippet");
  response.headers.set("x-touchline-preview", "isolated");
  response.headers.set(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  return response;
}

function isolatedPreviewBlockedResponse(
  policy: Extract<TouchlineIsolatedPreviewRoutePolicy, { status: "blocked" }>,
) {
  const status = policy.reason === "invalid-preview-contract" ? 503 : 404;
  const message = policy.reason === "invalid-preview-contract"
    ? "The isolated Preview configuration is unavailable."
    : "This route is unavailable in the isolated Preview.";
  return applyIsolatedPreviewHeaders(
    new NextResponse(message, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
  );
}

function isolatedPreviewResponse(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TOUCHLINE_PRESENTATION_LOCALE_HEADER, requestLocale(request));
  requestHeaders.set(TOUCHLINE_ISOLATED_PREVIEW_HEADER, "true");
  return applyIsolatedPreviewHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
}

function clubOwnerLoginRedirect(
  request: NextRequest,
  area: TouchlineClubOwnerSelfArea,
  sourceResponse?: NextResponse,
) {
  const locale = requestLocale(request);
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("lang", locale);
  loginUrl.searchParams.set("returnTo", touchlineClubOwnerSelfHref(locale, area));
  return redirectWithSupabaseCookies(loginUrl, sourceResponse);
}

function clubOwnerSelfRedirect(
  request: NextRequest,
  area: TouchlineClubOwnerSelfArea,
  sourceResponse?: NextResponse,
) {
  const locale = requestLocale(request);
  return redirectWithSupabaseCookies(
    new URL(touchlineClubOwnerSelfHref(locale, area), request.url),
    sourceResponse,
  );
}

/**
 * Avoid streaming the generic global loading screen while `/me/substitution`
 * performs a second server-side auth redirect. The edge already has the
 * authenticated ClubOwner slug, so this narrow redirect is equivalent to the
 * self route while preserving its locale and cookies.
 */
function clubOwnerCanonicalSubstitutionRedirect(
  request: NextRequest,
  ownerSlug: string,
  sourceResponse?: NextResponse,
) {
  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.pathname = `/club-owner/${encodeURIComponent(ownerSlug)}/substitution`;
  return redirectWithSupabaseCookies(canonicalUrl, sourceResponse);
}

/**
 * `notFound()` after an async session lookup starts the App Router stream and
 * can leave the HTTP status at 200. Private ClubOwner paths are authorized in
 * this availability boundary instead, so a foreign owner URL receives an
 * actual 404 without disclosing which ClubOwner identity was requested.
 */
function clubOwnerNotFoundResponse(request: NextRequest, sourceResponse?: NextResponse) {
  const isPortuguese = requestLocale(request) === "pt-BR";
  const arenaHref = `/arena?lang=${isPortuguese ? "pt-BR" : "en-GB"}`;
  const response = new NextResponse(
    `<!doctype html>
<html lang="${isPortuguese ? "pt-BR" : "en-GB"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>TouchLine — ${isPortuguese ? "Navegação segura" : "Safe navigation"}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { min-height: 100svh; margin: 0; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at 50% 16%, rgba(169,255,66,.15), transparent 30%), #030806; color: #f4fff1; font-family: Inter, Arial, sans-serif; }
      main { width: min(560px, 100%); padding: clamp(30px, 7vw, 60px); border: 1px solid rgba(183,255,91,.28); border-radius: 28px; background: rgba(4,14,10,.9); box-shadow: 0 28px 90px rgba(0,0,0,.54); text-align: center; }
      small { color: #bdff75; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
      h1 { margin: 14px 0 10px; font-size: clamp(30px, 7vw, 48px); letter-spacing: -.04em; }
      p { margin: 0; color: rgba(244,255,241,.72); line-height: 1.65; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 24px; padding: 0 20px; border-radius: 999px; background: #b7ff5b; color: #071006; font-weight: 900; text-decoration: none; }
      a:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
    </style>
  </head>
  <body><main>
    <small>TouchLine</small>
    <h1>${isPortuguese ? "Navegação segura" : "Safe navigation"}</h1>
    <p>${isPortuguese ? "Esta área não está disponível." : "This area is not available."}</p>
    <a href="${arenaHref}">${isPortuguese ? "Voltar para a Arena" : "Return to Arena"}</a>
  </main></body>
</html>`,
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      },
    },
  );
  sourceResponse?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

function resolveClubOwnerFailureBoundary(request: NextRequest, sourceResponse?: NextResponse) {
  const clubOwnerAccess = resolveTouchlineClubOwnerRouteAccess({
    pathname: request.nextUrl.pathname,
    isAuthenticated: false,
  });
  if (clubOwnerAccess?.action === "login") {
    return clubOwnerLoginRedirect(request, clubOwnerAccess.area, sourceResponse);
  }
  if (clubOwnerAccess?.action === "redirect-self") {
    return clubOwnerSelfRedirect(request, clubOwnerAccess.area, sourceResponse);
  }
  if (clubOwnerAccess?.action === "not-found") {
    return clubOwnerNotFoundResponse(request, sourceResponse);
  }
  return null;
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
  const pathname = request.nextUrl.pathname;
  // This exact diagnostic evaluates its own fail-closed QA configuration.
  // Let it return only safe PASS/FAIL before locale, session or provider work.
  if (pathname === "/api/qa/environment-precheck") return NextResponse.next();
  // The isolated Preview guard deliberately runs before host normalisation,
  // locale redirects, audit handling, auth and any Supabase import/work.
  const previewPolicy = resolveTouchlineIsolatedPreviewRoutePolicy(pathname);
  if (previewPolicy.status === "blocked") {
    // Runtime evidence for QA contract failures. This logs only reason names,
    // never environment values, URLs, keys, headers, cookies or user data.
    console.error("[touchline-preview] request blocked by Preview contract", {
      route: pathname,
      policy: previewPolicy.reason,
      reasons: previewPolicy.diagnosticReasons,
    });
    return isolatedPreviewBlockedResponse(previewPolicy);
  }
  if (previewPolicy.status === "allow-preview") return isolatedPreviewResponse(request);

  const hostname = resolveTouchLineRequestHostname(
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    request.nextUrl.hostname,
  );
  const localeRedirect = canonicalPresentationLocaleRedirect(request);
  if (localeRedirect) return localeRedirect;
  const isLocalDev = localDevHosts.has(hostname);
  if (isLocalDev) return nextResponseWithPresentationLocale(request);
  if (await hasQaSocialRenderBearer(request, hostname)) {
    const response = nextResponseWithPresentationLocale(request);
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    response.headers.set("x-touchline-social-render", "qa-internal");
    return response;
  }

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
    const response = nextResponseWithPresentationLocale(request);
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
  const isProtectedArenaRoute = !isAuth
    && protectedArenaPaths.some((path) => matchesRoute(pathname, path));
  const isQaAuthenticatedVisualReviewRoute = isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname,
    hostname,
  });
  const isAdminOnlyArenaRoute = !isAuth
    && adminOnlyArenaPaths.some((path) => matchesRoute(pathname, path))
    && !isQaAuthenticatedVisualReviewRoute;
  // Public product pages must never make Auth a dependency of rendering.  In
  // particular, a visitor with an expired browser session must not cause every
  // public navigation to refresh a Supabase token at the edge.  That pattern
  // amplifies into concurrent refreshes for HTML and assets and can exhaust
  // the middleware execution budget.  ClubOwner remains here because its
  // private self and management routes are authorized by this proxy.
  const requiresIdentityLookup = isProtectedArenaRoute || pathname.startsWith("/club-owner/");
  const isEmergencyOffline = siteOffline && !isVercelHost;

  if (isEmergencyOffline && !isProtectedArenaRoute && !isAuth) {
    return offlineResponse(requestLocale(request));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const clubOwnerFailure = resolveClubOwnerFailureBoundary(request);
    if (clubOwnerFailure) return clubOwnerFailure;
    return isProtectedArenaRoute ? loginRedirect(request) : nextResponseWithPresentationLocale(request);
  }

  let response = nextResponseWithPresentationLocale(request);
  if (!requiresIdentityLookup) return response;

  let user: {
    id?: string;
    email?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } | null = null;
  let isOwnerEmail: (email: string | null | undefined) => boolean = () => false;

  try {
    const [{ createServerClient }, ownerModule] = await Promise.all([
      import("@supabase/ssr"),
      import("@/lib/admin/owner"),
    ]);
    isOwnerEmail = ownerModule.isOwnerEmail;
    const supabase = createServerClient(url, key, {
      cookies: {
        encode: "tokens-only",
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = nextResponseWithPresentationLocale(request);
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    response = clearInvalidSupabaseSession(request, response);
  }

  const isAdmin = isOwnerEmail(user?.email);
  const clubOwnerSlug = user?.id && !isAdmin
    ? touchlineClubOwnerSlugForUser({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    })
    : null;
  const clubOwnerAccess = resolveTouchlineClubOwnerRouteAccess({
    pathname,
    isAuthenticated: Boolean(user),
    ownerSlug: clubOwnerSlug,
  });
  if (clubOwnerAccess?.action === "login") {
    return clubOwnerLoginRedirect(request, clubOwnerAccess.area, response);
  }
  if (clubOwnerAccess?.action === "redirect-self") {
    return clubOwnerSelfRedirect(request, clubOwnerAccess.area, response);
  }
  if (
    clubOwnerAccess?.action === "allow"
    && clubOwnerAccess.kind === "self"
    && clubOwnerSlug
    && pathname === "/club-owner/me/substitution"
  ) {
    return clubOwnerCanonicalSubstitutionRedirect(request, clubOwnerSlug, response);
  }
  if (clubOwnerAccess?.action === "not-found") {
    return clubOwnerNotFoundResponse(request, response);
  }
  if (!user && isProtectedArenaRoute) return loginRedirect(request, response);
  const hasArenaAccess = hasTouchLineArenaAccess(user);
  if (user && isProtectedArenaRoute && !hasArenaAccess) return loginRedirect(request, response);
  if (user && isAdminOnlyArenaRoute && !isAdmin) return arenaRedirect(request, response);
  if (isEmergencyOffline && user && !isAdmin && !isAuth) return offlineResponse(requestLocale(request));
  if (user && hasArenaAccess && isAuthEntry) {
    const lang = request.nextUrl.searchParams.get("lang");
    const returnTo = normalizeTouchLineAuthReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const destination = touchLinePostAuthHref(returnTo, lang);
    return redirectWithSupabaseCookies(new URL(destination, request.url), response);
  }
  if (isQaAuthenticatedVisualReviewRoute) {
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive, nosnippet");
    response.headers.set("x-touchline-qa-review", "authenticated");
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
    // If an edge dependency fails, private ClubOwner routes must still fail
    // closed instead of reaching a streamed `notFound()` response with 200.
    const clubOwnerFailure = resolveClubOwnerFailureBoundary(request);
    if (clubOwnerFailure) return clubOwnerFailure;
    const isAuth = authPaths.some((path) => matchesRoute(request.nextUrl.pathname, path));
    const isProtectedArenaRoute = !isAuth
      && protectedArenaPaths.some((path) => matchesRoute(request.nextUrl.pathname, path));
    return isProtectedArenaRoute ? loginRedirect(request) : nextResponseWithPresentationLocale(request);
  }
}

export const config = {
  // API traffic is intentionally included: an audit deployment must reject it
  // before any route handler has a chance to read or mutate external state.
  matcher: ["/((?!_next/static|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|map|woff|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf)$).*)"],
};
