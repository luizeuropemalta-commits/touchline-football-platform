"use client";

import { useLinkStatus } from "next/link";

/** Feedback belongs to this Link only; no timers, overlays or disabled links. */
export default function TouchlineNavigationLabel({ label, pendingLabel }: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite" aria-atomic="true" aria-busy={pending}>
    {pending ? pendingLabel : label}
  </span>;
}
