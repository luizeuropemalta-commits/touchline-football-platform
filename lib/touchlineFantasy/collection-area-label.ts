import type { ClubRosterArea } from "./club-roster.ts";
import { getAllocationDialogCopy } from "./allocation-dialog-i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "./market-workflow-i18n.ts";

/** Display only. Never use translated labels as command/slot identities. */
export function collectionAreaLabel(area: ClubRosterArea, locale: string, draftLocalesEnabled = false): string {
  if (area === "starters") return getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled).startingXI;
  const copy = getAllocationDialogCopy(locale, draftLocalesEnabled);
  return area === "reserves" ? copy.reserves : copy.outside;
}
