import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, featureForPath, type PlanKey } from "@/lib/billing/plans";
import { isOwnerEmail } from "@/lib/admin/owner";

const betaFullAccess = true;
const siteOffline = process.env.TOUCHLINE_SITE_OFFLINE !== "false";

function offlineResponse() {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>Touchline is offline</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #02050a;
        color: #f8fafc;
        font-family: Arial, Helvetica, sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 40px));
        border: 1px solid rgba(34, 211, 238, .22);
        border-radius: 24px;
        background: rgba(3, 8, 15, .92);
        padding: 32px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, .45);
      }
      p { color: #94a3b8; line-height: 1.7; }
      small {
        display: inline-flex;
        margin-bottom: 16px;
        border: 1px solid rgba(163, 255, 18, .25);
        border-radius: 999px;
        padding: 8px 12px;
        color: #caff72;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <main>
      <small>Private build</small>
      <h1>Touchline is offline.</h1>
      <p>This project is temporarily unavailable while the private build is being finished.</p>
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

export async function proxy(request: NextRequest) {
  if (siteOffline) return offlineResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
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
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = isOwnerEmail(user?.email);
  const isAuth = ["/login", "/register", "/forgot-password"].some(path => request.nextUrl.pathname.startsWith(path));
  const isApp = [
    "/dashboard", "/admin", "/players", "/football-search", "/agencies", "/documents", "/calendar", "/reports",
    "/deals", "/opportunities", "/radar", "/verification", "/scouting", "/inbox",
    "/clubs", "/connect", "/competition", "/investors", "/academies", "/feed", "/ai",
    "/objectives", "/achievements", "/rankings", "/contracts", "/invoices", "/settings", "/billing", "/subscription", "/upgrade",
  ].some(path => request.nextUrl.pathname.startsWith(path));
  if (!user && isApp) return NextResponse.redirect(new URL("/login", request.url));
  if (user && isAuth) return NextResponse.redirect(new URL("/dashboard", request.url));

  const feature = featureForPath(request.nextUrl.pathname);
  if (user && feature && !isAdmin && !betaFullAccess) {
    const { data: subscription } = await supabase
      .from("billing_subscriptions")
      .select("plan_key,status")
      .eq("user_id", user.id)
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!subscription) {
      const target = new URL("/pricing", request.url);
      target.searchParams.set("required", feature);
      return NextResponse.redirect(target);
    }
    if (!canAccess(subscription.plan_key as PlanKey, feature)) {
      const target = new URL("/upgrade", request.url);
      target.searchParams.set("feature", feature);
      target.searchParams.set("from", request.nextUrl.pathname);
      return NextResponse.redirect(target);
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
