type TouchlineWebkitFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type TouchlineWebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function touchlineFullscreenElement(documentTarget: Document): Element | null {
  const compatibleDocument = documentTarget as TouchlineWebkitFullscreenDocument;
  return documentTarget.fullscreenElement ?? compatibleDocument.webkitFullscreenElement ?? null;
}

export async function requestTouchlineFullscreen(element: HTMLElement, documentTarget: Document): Promise<boolean> {
  if (typeof element.requestFullscreen === "function") {
    try {
      await element.requestFullscreen();
      if (touchlineFullscreenElement(documentTarget) === element) return true;
    } catch {
      // Safari variants may expose the standard method but still require the
      // prefixed implementation, so continue to the compatible path.
    }
  }

  const compatibleElement = element as TouchlineWebkitFullscreenElement;
  if (typeof compatibleElement.webkitRequestFullscreen === "function") {
    try {
      await compatibleElement.webkitRequestFullscreen();
      return touchlineFullscreenElement(documentTarget) === element;
    } catch {
      return false;
    }
  }

  return false;
}

export async function exitTouchlineFullscreen(documentTarget: Document): Promise<void> {
  if (typeof documentTarget.exitFullscreen === "function") {
    try {
      await documentTarget.exitFullscreen();
      return;
    } catch {
      // Continue to Safari's compatible exit method.
    }
  }

  const compatibleDocument = documentTarget as TouchlineWebkitFullscreenDocument;
  try {
    await compatibleDocument.webkitExitFullscreen?.();
  } catch {
    // The Arena fallback is still cleared by the caller when native exit fails.
  }
}
