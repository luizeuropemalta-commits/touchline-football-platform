export type TouchlineDeviceOrientationInput = Readonly<{
  width: number;
  height: number;
  coarsePointer: boolean;
  hoverlessPointer: boolean;
  mobileDevice?: boolean;
}>;

/**
 * TouchLine is a landscape-only game on phones and tablets. Desktop windows
 * remain free to use any shape, including a narrow split-screen workspace.
 */
export function touchlineDeviceNeedsLandscape(
  input: TouchlineDeviceOrientationInput,
) {
  const phoneOrTablet = input.mobileDevice === true
    || input.coarsePointer
    || input.hoverlessPointer;
  return phoneOrTablet && input.width <= input.height;
}
