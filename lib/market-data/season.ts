export function getApiFootballSeason(value?: string | null) {
  const season = value?.trim();
  if (season && season.toLowerCase() !== "auto") return season;
  return String(new Date().getFullYear());
}
