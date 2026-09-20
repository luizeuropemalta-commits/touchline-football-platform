import { exitTouchlineFullscreen, touchlineFullscreenElement } from "./fullscreen.ts";

/** Keep this query identical to TouchlineLandscapeBoundary.module.css. */
export const TOUCHLINE_PORTRAIT_QUERY =
  "(max-width: 767px) and (orientation: portrait)";

/**
 * The CSS gate protects first paint/no-JS; this controller adds inert/focus
 * management after hydration. It never unmounts children, reloads a route or
 * writes gameplay state. Browser fullscreen/orientation APIs are not required.
 */
export function installTouchlineOrientationGate({
  content,
  gate,
  skipLink,
  media,
  documentTarget,
}: {
  content: HTMLElement;
  gate: HTMLElement;
  skipLink: HTMLElement;
  media: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;
  documentTarget: Document;
}) {
  const originalInert = content.inert;
  const originalSkipInert = skipLink.inert;
  const originalHidden = content.getAttribute("aria-hidden");
  const originalOrientation = documentTarget.documentElement.dataset.touchlineOrientation;
  let blocked = false;
  let disposed = false;
  let returnFocus: HTMLElement | null = null;

  const restoreContent = () => {
    content.inert = originalInert;
    skipLink.inert = originalSkipInert;
    if (originalHidden === null) content.removeAttribute("aria-hidden");
    else content.setAttribute("aria-hidden", originalHidden);
  };
  const sync = () => {
    if (media.matches === blocked) {
      documentTarget.documentElement.dataset.touchlineOrientation = blocked ? "portrait-blocked" : "landscape";
      return;
    }
    blocked = media.matches;
    documentTarget.documentElement.dataset.touchlineOrientation = blocked ? "portrait-blocked" : "landscape";
    if (blocked) {
      returnFocus = documentTarget.activeElement as HTMLElement | null;
      // Move focus before making its previous ancestor aria-hidden.
      gate.focus({ preventScroll: true });
      content.inert = true;
      skipLink.inert = true;
      content.setAttribute("aria-hidden", "true");
      // Native fullscreen is above all CSS layers. Release it so the notice is
      // visible; leave the game and any open zoom mounted and untouched.
      if (touchlineFullscreenElement(documentTarget)) {
        void exitTouchlineFullscreen(documentTarget).then(() => {
          if (!disposed && blocked) gate.focus({ preventScroll: true });
        });
      }
    } else {
      restoreContent();
      if (returnFocus?.isConnected && typeof returnFocus.focus === "function") {
        returnFocus.focus({ preventScroll: true });
      }
      returnFocus = null;
    }
  };
  const containTab = (event: KeyboardEvent) => {
    if (blocked && event.key === "Tab") {
      event.preventDefault();
      gate.focus({ preventScroll: true });
    }
  };

  media.addEventListener("change", sync);
  gate.addEventListener("keydown", containTab);
  sync();
  return () => {
    disposed = true;
    media.removeEventListener("change", sync);
    gate.removeEventListener("keydown", containTab);
    restoreContent();
    if (originalOrientation === undefined) delete documentTarget.documentElement.dataset.touchlineOrientation;
    else documentTarget.documentElement.dataset.touchlineOrientation = originalOrientation;
  };
}
