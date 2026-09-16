import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const CLUB_OWNER_SUBSTITUTION_METADATA: Metadata = {
  title: "Meu Clube | TouchLine",
  description: "Gerencie o seu XI TouchLine por posição.",
};

export default function ClubOwnerSubstitutionRenderer({
  lang,
}: {
  lang: "en-GB" | "pt-BR";
}) {
  // Compatibility path only. A ClubOwner does not have a second 9-player
  // bench: each change belongs to the matching position in My Club.
  redirect(`/my-club?lang=${encodeURIComponent(lang)}#my-club-squad`);
  return null;
}
