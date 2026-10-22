"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import type { ClubInitialBudget } from "@/lib/touchlineFantasy/club-initial-budget";
import type { ClubCollectionReadResult } from "@/lib/touchlineFantasy/club-collection-read-server";
import type { ClubCommandAuthority } from "@/lib/touchlineFantasy/club-command-authority";
import { confirmedCollectionBootstrap } from "@/lib/touchlineFantasy/club-collection-bootstrap";
export type ClubCollectionVerificationStatus = "pending" | "confirmed" | "unavailable";

// Page-scoped, not a browser-wide wallet. Only confirmed collection responses
// are published here; previews cannot change the account's remaining budget.
const CollectionContext = createContext<{
  state: ClubAcquisitionState | null;
  publish: (state: ClubAcquisitionState | null) => void;
  initialBudget: ClubInitialBudget | null;
  publishInitialBudget: (budget: ClubInitialBudget | null) => void;
  verificationStatus: ClubCollectionVerificationStatus;
  publishVerificationStatus: (status: ClubCollectionVerificationStatus) => void;
}>({ state: null, publish: () => {}, initialBudget: null, publishInitialBudget: () => {}, verificationStatus: "pending", publishVerificationStatus: () => {} });

export function ClubCollectionProvider({ children, initialRead, authority = null }: { children: ReactNode; initialRead?: ClubCollectionReadResult | null; authority?: ClubCommandAuthority | null }) {
  const bootstrap = confirmedCollectionBootstrap(initialRead, authority);
  const [state, publish] = useState<ClubAcquisitionState | null>(bootstrap?.state ?? null);
  const [initialBudget, publishInitialBudget] = useState<ClubInitialBudget | null>(bootstrap?.initialBudget ?? null);
  const [verificationStatus, publishVerificationStatus] = useState<ClubCollectionVerificationStatus>(bootstrap ? "confirmed" : "pending");
  const value = useMemo(() => ({ state, publish, initialBudget, publishInitialBudget, verificationStatus, publishVerificationStatus }), [state, initialBudget, verificationStatus]);
  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useConfirmedClubCollection() { return useContext(CollectionContext); }
