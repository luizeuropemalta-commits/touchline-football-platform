const EVENT_POINTS: Array<[RegExp, number]> = [
  [/own\s*goal/i, -2],
  [/goal/i, 6],
  [/assist/i, 3],
  [/clean\s*sheet/i, 4],
  [/penalty.*save|save.*penalty/i, 5],
  [/save/i, 1],
  [/yellow/i, -1],
  [/red/i, -3],
];

export function estimateFantasyEventPoints(type?: string) {
  if (!type) return 0;

  const match = EVENT_POINTS.find(([pattern]) => pattern.test(type));
  return match?.[1] ?? 0;
}
