import "server-only";

import { notFound, redirect } from "next/navigation";

import { isOwnerEmail } from "@/lib/admin/owner";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import {
  resolveTouchlineClubOwnerSelfNavigation,
} from "@/lib/touchlineArena/club-owner-self-navigation";
import type { TouchlineClubOwnerSelfArea } from "@/lib/touchlineArena/club-owner-routes";
import { createClient } from "@/lib/supabase/server";

export type ClubOwnerSelfRouteSearchParams = Promise<{ lang?: string | string[] }>;

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

  if (navigation.kind === "login") redirect(navigation.href);
  if (navigation.kind === "denied") notFound();
  redirect(navigation.href);
}
