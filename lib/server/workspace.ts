import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function ensureUserWorkspace(user: User) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is not configured.");

  const { data: existingUser, error: userError } = await admin
    .from("users")
    .select("id, agency_id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (userError) throw new Error(userError.message);
  if (existingUser?.agency_id) return { admin, agencyId: existingUser.agency_id, profile: existingUser };

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Touchline Founder";

  const agencyName = existingUser?.full_name ? `${existingUser.full_name} Agency` : `${displayName} Agency`;
  const baseSlug = slugify(agencyName) || "touchline-agency";
  const slug = `${baseSlug}-${user.id.slice(0, 8)}`;

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({
      name: agencyName,
      slug,
      country_code: "MT",
      default_currency: "EUR",
    })
    .select("id")
    .single();

  if (agencyError) throw new Error(agencyError.message);

  const profilePayload = {
    id: user.id,
    agency_id: agency.id,
    full_name: displayName,
    role: "owner",
    job_title: "Founder",
  };

  const { data: profile, error: profileError } = existingUser
    ? await admin.from("users").update(profilePayload).eq("id", user.id).select("id, agency_id, full_name, role").single()
    : await admin.from("users").insert(profilePayload).select("id, agency_id, full_name, role").single();

  if (profileError) throw new Error(profileError.message);

  return { admin, agencyId: agency.id as string, profile };
}
