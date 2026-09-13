import "server-only";

import { notFound, redirect } from "next/navigation";

import { isOwnerEmail } from "@/lib/admin/owner";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { touchlineClubOwnerSelfHref, touchlineMyClubHref } from "@/lib/touchlineArena/club-owner-routes";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import {
  resolveTouchlineClubOwnerSelfNavigation,
} from "@/lib/touchlineArena/club-owner-self-navigation";
import type { TouchlineClubOwnerSelfArea } from "@/lib/touchlineArena/club-owner-routes";
import { createClient } from "@/lib/supabase/server";

export type ClubOwnerSelfRouteSearchParams = Promise<{
  lang?: string | string[];
  tab?: string | string[];
}>;

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Server-only self-route boundary. It authenticates before deriving a slug and
 * redirects only to that authenticated ClubOwner's explicit route. It never
 * resolves the public demo identity or a slug provided by a browser request.
 */
export async function redirectTouchlineClubOwnerSelfRoute({
  area,
  searchParams,
}: {
  area: TouchlineClubOwnerSelfArea;
  searchParams: ClubOwnerSelfRouteSearchParams;
}): Promise<never> {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(firstValue(params.lang));
  const forwarded = new URLSearchParams();
  const marketTab = firstValue(params.tab) === "market";
  if (marketTab) forwarded.set("tab", "market");
  const forwardedSuffix = forwarded.size ? `&${forwarded.toString()}` : "";
  const marketAnchor = marketTab ? "#my-club-squad" : "";
  const canonicalAreaHref = area === "profile"
    ? touchlineMyClubHref(locale)
    : touchlineClubOwnerSelfHref(locale, area);
  const destination = `${canonicalAreaHref}${forwardedSuffix}${marketAnchor}`;
  const supabase = await createClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const navigation = resolveTouchlineClubOwnerSelfNavigation({
    area,
    locale,
    user,
    isClubOwner: Boolean(user && !isOwnerEmail(user.email)),
  });

  if (navigation.kind === "login") {
    redirect(touchLineAuthEntryHref("/login", locale, destination));
  }
  if (navigation.kind === "denied") notFound();
  redirect(`${area === "profile" ? touchlineMyClubHref(locale) : navigation.href}${forwardedSuffix}${marketAnchor}`);
}
