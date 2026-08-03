export type TouchLineShirtDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export type TouchLineDigitMarkAnchor = {
  x: number;
  y: number;
  scale: number;
};

export type TouchLineDigitImageBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const TOUCHLINE_SHIRT_DIGIT_ASSETS: Record<TouchLineShirtDigit, string> = {
  "0": "/touchlineArena/shared/shirt-number-digits/0.png",
  "1": "/touchlineArena/shared/shirt-number-digits/1.png",
  "2": "/touchlineArena/shared/shirt-number-digits/2.png",
  "3": "/touchlineArena/shared/shirt-number-digits/3.png",
  "4": "/touchlineArena/shared/shirt-number-digits/4.png",
  "5": "/touchlineArena/shared/shirt-number-digits/5.png",
  "6": "/touchlineArena/shared/shirt-number-digits/6.png",
  "7": "/touchlineArena/shared/shirt-number-digits/7.png",
  "8": "/touchlineArena/shared/shirt-number-digits/8.png",
  "9": "/touchlineArena/shared/shirt-number-digits/9.png",
};

/**
 * Normalized 70 x 100 shirt canvas for every approved digit asset.
 *
 * The original zero artwork is wider and shorter than the other source files.
 * Rendering every file with `meet` therefore made 0 visibly lower and smaller
 * inside numbers such as 20. These boxes preserve the natural width of the
 * other digits while giving all ten digits the same official 100-unit height.
 */
export const TOUCHLINE_SHIRT_DIGIT_IMAGE_BOXES: Record<TouchLineShirtDigit, TouchLineDigitImageBox> = {
  "0": { x: 0, y: 0, width: 70, height: 100 },
  "1": { x: 18.1, y: 0, width: 33.8, height: 100 },
  "2": { x: 7.6, y: 0, width: 54.8, height: 100 },
  "3": { x: 7.1, y: 0, width: 55.9, height: 100 },
  "4": { x: 1.9, y: 0, width: 66.2, height: 100 },
  "5": { x: 7.1, y: 0, width: 55.8, height: 100 },
  "6": { x: 7, y: 0, width: 56, height: 100 },
  "7": { x: 7, y: 0, width: 56, height: 100 },
  "8": { x: 6.7, y: 0, width: 56.7, height: 100 },
  "9": { x: 7.7, y: 0, width: 54.6, height: 100 },
};

export const TOUCHLINE_SHIRT_DIGIT_PATHS: Record<TouchLineShirtDigit, string> = {
  "0": "M35 3C12 3 3 20 3 50S12 97 35 97 67 80 67 50 58 3 35 3ZM35 23C45 23 47 32 47 50S45 77 35 77 23 68 23 50 25 23 35 23Z",
  "1": "M28 5H51V97H28V31L15 40 5 22 28 5Z",
  "2": "M8 32C8 13 19 3 37 3 57 3 67 15 67 32 67 47 58 57 47 66L31 78H68V97H4V77L38 50C45 44 48 39 48 32 48 24 44 20 37 20 29 20 26 25 26 34H8V32Z",
  "3": "M7 29C7 12 18 3 37 3 56 3 66 14 66 31 66 41 61 48 53 52 62 56 68 64 68 75 68 91 56 99 37 99 17 99 6 89 6 71H25C25 79 29 83 37 83 45 83 49 80 49 73 49 65 44 62 33 62H26V44H34C43 44 47 41 47 33 47 24 43 20 36 20 29 20 25 24 25 31H7V29Z",
  "4": "M40 4H64V61H70V80H64V97H44V80H2V59L40 4ZM44 34L25 61H44V34Z",
  "5": "M9 4H66V23H27V39C31 36 36 34 42 34 59 34 68 46 68 65V71C68 89 57 99 37 99 18 99 7 89 6 72H25C26 79 30 82 37 82 45 82 49 78 49 69V65C49 56 45 52 37 52 30 52 26 56 25 62H7L9 4Z",
  "6": "M64 25H45C44 20 40 18 34 18 25 18 21 25 21 39V43C26 38 32 35 40 35 58 35 68 47 68 66V70C68 88 56 99 37 99 15 99 3 85 3 58V42C3 16 14 3 36 3 52 3 62 11 64 25ZM37 52C28 52 23 57 23 67V70C23 79 28 83 37 83 45 83 49 79 49 70V67C49 57 45 52 37 52Z",
  "7": "M3 4H68V24L37 97H14L45 23H24V35H3V4Z",
  "8": "M36 3C55 3 66 13 66 30 66 40 61 47 53 52 63 56 68 64 68 76 68 92 57 100 36 100S4 92 4 76C4 64 9 56 19 52 11 47 6 40 6 30 6 13 17 3 36 3ZM36 19C28 19 24 23 24 31 24 39 28 43 36 43 44 43 48 39 48 31 48 23 44 19 36 19ZM36 60C27 60 23 64 23 72 23 80 27 84 36 84 45 84 49 80 49 72 49 64 45 60 36 60Z",
  "9": "M35 3C13 3 3 18 3 41C3 64 14 76 32 76C40 76 46 73 50 68C49 84 44 91 35 91C27 91 23 87 23 79H3C3 93 14 100 35 100C58 100 67 84 67 54V38C67 15 56 3 35 3ZM35 22C44 22 48 28 48 39C48 50 44 56 35 56C27 56 23 50 23 39C23 28 27 22 35 22Z",
};

export const TOUCHLINE_MARK_PATHS = {
  shield: "M90 18L145 43V108L90 157L35 108V43L90 18Z",
  t: "M48 50H103V68H85V124H65V68H48V50Z",
  l: "M102 50H123V107L141 95V116L102 141V50Z",
  accent: "M89 122L102 114V139L89 147V122Z",
} as const;

/* Approved lower-band TL positions from the frozen shirt-number editor. */
export const TOUCHLINE_DIGIT_MARK_ANCHORS: Record<TouchLineShirtDigit, TouchLineDigitMarkAnchor> = {
  "0": { x: 36, y: 89.3, scale: 0.09 },
  "1": { x: 40.8, y: 88, scale: 0.084 },
  "2": { x: 37.1, y: 88.1, scale: 0.084 },
  "3": { x: 40.2, y: 89.3, scale: 0.084 },
  "4": { x: 48.5, y: 88.6, scale: 0.084 },
  "5": { x: 37.9, y: 89.9, scale: 0.084 },
  "6": { x: 38.9, y: 89.8, scale: 0.084 },
  "7": { x: 29, y: 88.3, scale: 0.084 },
  "8": { x: 35.9, y: 90.3, scale: 0.084 },
  "9": { x: 37.1, y: 89.7, scale: 0.084 },
};

export function normalizeTouchLineShirtNumber(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 2);
}
