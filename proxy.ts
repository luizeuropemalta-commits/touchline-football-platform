import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, featureForPath, type PlanKey } from "@/lib/billing/plans";

export async function proxy(request: NextRequest) {
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
  const isAuth = ["/login", "/register", "/forgot-password"].some(path => request.nextUrl.pathname.startsWith(path));
  const isApp = [
    "/dashboard", "/players", "/deals", "/scouting", "/inbox",
    "/clubs", "/competition", "/investors", "/academies", "/feed", "/ai",
    "/objectives", "/achievements", "/rankings", "/contracts", "/invoices", "/settings", "/billing", "/subscription", "/upgrade",
  ].some(path => request.nextUrl.pathname.startsWith(path));
  if (!user && isApp) return NextResponse.redirect(new URL("/login", request.url));
  if (user && isAuth) return NextResponse.redirect(new URL("/dashboard", request.url));

  const feature = featureForPath(request.nextUrl.pathname);
  if (user && feature) {
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
