import type { Metadata } from "next";

import ArenaClient from "@/app/arena/ArenaClient";

export const CLUB_OWNER_SUBSTITUTION_METADATA: Metadata = {
  title: "Substituições | TouchLine ClubOwner",
  description: "Área independente para organizar titulares, banco e substituições TouchLine.",
};

export default function ClubOwnerSubstitutionRenderer() {
  return <ArenaClient initialPanel="bench" initialIntroIntent="skip" standalonePanel="bench" />;
}
