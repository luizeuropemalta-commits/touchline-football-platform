import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const CLUB_OWNER_SUBSTITUTION_METADATA: Metadata = {
  title: "Substituições | TouchLine ClubOwner",
  description: "Substituição rápida do ClubOwner dentro da TouchLine Arena.",
};

export default function ClubOwnerSubstitutionRenderer({
  lang,
}: {
  lang: "en-GB" | "pt-BR";
}) {
  redirect(`/arena?panel=bench&lang=${encodeURIComponent(lang)}`);
  return null;
}
