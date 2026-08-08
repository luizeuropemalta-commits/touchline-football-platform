/**
 * Versioned, server-owned catalog of the trophy PNGs that are already tracked
 * under public/touchlineArena/clubs. Keep filenames only here: labels, counts,
 * tones and URLs are deterministically derived at read time.
 *
 * Do not replace this with filesystem reads at request time. Vercel/serverless
 * deployments do not guarantee the public asset directory is enumerable.
 */
export type ClubTrophyTone = "gold" | "silver" | "blue" | "green";

export type ClubTrophyAsset = {
  id: string;
  label: string;
  count: number;
  imageUrl: string;
  tone: ClubTrophyTone;
};

export const TOUCHLINE_TROPHY_FOLDER_BY_CLUB_CODE: Record<string, string> = {
  "BOU": "afc-bournemouth",
  "ARS": "arsenal",
  "AVL": "aston-villa",
  "BRE": "brentford",
  "BHA": "brighton-and-hove-albion",
  "CHE": "chelsea",
  "COV": "coventry-city",
  "CRY": "crystal-palace",
  "EVE": "everton",
  "FUL": "fulham",
  "HUL": "hull-city",
  "IPS": "ipswich-town",
  "LEE": "leeds-united",
  "LIV": "liverpool",
  "MCI": "manchester-city",
  "MUN": "manchester-united",
  "NEW": "newcastle-united",
  "NFO": "nottingham-forest",
  "SUN": "sunderland",
  "TOT": "tottenham-hotspur"
};

export const TOUCHLINE_CLUB_TROPHY_MANIFEST = {
  "afc-bournemouth": [
    "English 2nd Tier Champions Trophy - 1.png",
    "English 3rd Tier Champions Trophy - 1.png",
    "Football League Trophy - 1.png"
  ],
  "arsenal": [
    "Community Shield Trophy - 17.png",
    "Cup Winners Cup Trophy - 1.png",
    "English League Champions Trophy - 14.png",
    "English League Cup Trophy - 2.png",
    "FA Cup Trophy - 14.png",
    "Inter-Cities Fairs Cup Trophy - 1.png"
  ],
  "aston-villa": [
    "Champions League Trophy - 1.png",
    "Community Shield Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 2.png",
    "English League Champions Trophy - 7.png",
    "English League Cup Trophy - 5.png",
    "Europa League Trophy - 1.png",
    "FA Cup Trophy - 7.png",
    "UEFA Intertoto Cup Trophy - 1.png",
    "UEFA Super Cup Trophy - 1.png"
  ],
  "brentford": [
    "English 2nd Tier Champions Trophy - 1.png",
    "English 3rd Tier Champions Trophy - 2.png",
    "English 4th Tier Champions Trophy - 3.png"
  ],
  "brighton-and-hove-albion": [
    "Community Shield Trophy - 1.png",
    "English 3rd Tier Champions Trophy - 3.png",
    "English 4th Tier Champions Trophy - 2.png"
  ],
  "chelsea": [
    "Champions League Trophy - 2.png",
    "Community Shield Trophy - 4.png",
    "Conference League Trophy - 1.png",
    "Cup Winners Cup Trophy - 2.png",
    "English 2nd Tier Champions Trophy - 2.png",
    "English League Champions Trophy - 6.png",
    "English League Cup Trophy - 5.png",
    "Europa League Trophy - 2.png",
    "FA Cup Trophy - 8.png",
    "FIFA Club World Cup Trophy - 2.png",
    "UEFA Super Cup Trophy - 2.png"
  ],
  "coventry-city": [
    "English 2nd Tier Champions Trophy - 2.png",
    "English 3rd Tier Champions Trophy - 2.png",
    "FA Cup Trophy - 1.png",
    "Football League Trophy - 1.png"
  ],
  "crystal-palace": [
    "Community Shield Trophy - 1.png",
    "Conference League Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 2.png",
    "English 3rd Tier Champions Trophy - 1.png",
    "FA Cup Trophy - 1.png"
  ],
  "everton": [
    "Community Shield Trophy - 9.png",
    "Cup Winners Cup Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 1.png",
    "English League Champions Trophy - 9.png",
    "FA Cup Trophy - 5.png"
  ],
  "fulham": [
    "English 2nd Tier Champions Trophy - 3.png",
    "English 3rd Tier Champions Trophy - 2.png",
    "UEFA Intertoto Cup Trophy - 1.png"
  ],
  "hull-city": [
    "English 3rd Tier Champions Trophy - 4.png"
  ],
  "ipswich-town": [
    "English 2nd Tier Champions Trophy - 3.png",
    "English 3rd Tier Champions Trophy - 2.png",
    "English League Champions Trophy - 1.png",
    "Europa League Trophy - 1.png",
    "FA Cup Trophy - 1.png"
  ],
  "leeds-united": [
    "Community Shield Trophy - 2.png",
    "English 2nd Tier Champions Trophy - 5.png",
    "English League Champions Trophy - 3.png",
    "English League Cup Trophy - 1.png",
    "FA Cup Trophy - 1.png",
    "Inter-Cities Fairs Cup Trophy - 2.png"
  ],
  "liverpool": [
    "Champions League Trophy - 6.png",
    "Community Shield Trophy - 16.png",
    "English 2nd Tier Champions Trophy - 4.png",
    "English League Champions Trophy - 20.png",
    "English League Cup Trophy - 10.png",
    "Europa League Trophy - 3.png",
    "FA Cup Trophy - 8.png",
    "FIFA Club World Cup Trophy - 1.png",
    "UEFA Super Cup Trophy - 4.png"
  ],
  "manchester-city": [
    "Champions League Trophy - 1.png",
    "Community Shield Trophy - 7.png",
    "Cup Winners Cup Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 7.png",
    "English League Champions Trophy - 10.png",
    "English League Cup Trophy - 9.png",
    "FA Cup Trophy - 8.png",
    "FIFA Club World Cup Trophy - 1.png",
    "UEFA Super Cup Trophy - 1.png"
  ],
  "manchester-united": [
    "Champions League Trophy - 3.png",
    "Community Shield Trophy - 21.png",
    "Cup Winners Cup Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 2.png",
    "English League Champions Trophy - 20.png",
    "English League Cup Trophy - 6.png",
    "Europa League Trophy - 1.png",
    "FA Cup Trophy - 13.png",
    "FIFA Club World Cup Trophy - 1.png",
    "Intercontinental Cup Trophy - 1.png",
    "UEFA Super Cup Trophy - 1.png"
  ],
  "newcastle-united": [
    "Community Shield Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 4.png",
    "English League Champions Trophy - 4.png",
    "English League Cup Trophy - 1.png",
    "FA Cup Trophy - 6.png",
    "Inter-Cities Fairs Cup Trophy - 1.png",
    "UEFA Intertoto Cup Trophy - 1.png"
  ],
  "nottingham-forest": [
    "Champions League Trophy - 2.png",
    "Community Shield Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 3.png",
    "English 3rd Tier Champions Trophy - 1.png",
    "English League Champions Trophy - 1.png",
    "English League Cup Trophy - 4.png",
    "FA Cup Trophy - 2.png",
    "UEFA Super Cup Trophy - 1.png"
  ],
  "sunderland": [
    "Community Shield Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 5.png",
    "English 3rd Tier Champions Trophy - 1.png",
    "English League Champions Trophy - 6.png",
    "FA Cup Trophy - 2.png",
    "Football League Trophy - 1.png"
  ],
  "tottenham-hotspur": [
    "Community Shield Trophy - 7.png",
    "Cup Winners Cup Trophy - 1.png",
    "English 2nd Tier Champions Trophy - 2.png",
    "English League Champions Trophy - 2.png",
    "English League Cup Trophy - 4.png",
    "Europa League Trophy - 3.png",
    "FA Cup Trophy - 8.png"
  ]
} as const satisfies Record<string, readonly string[]>;

function trophyTone(label: string): ClubTrophyTone {
  const normalized = label.toLowerCase();
  if (normalized.includes("champions") || normalized.includes("league champions") || normalized.includes("world")) return "gold";
  if (normalized.includes("fa cup") || normalized.includes("conference")) return "blue";
  if (normalized.includes("league cup") || normalized.includes("football league")) return "green";
  return "silver";
}

function trophyAssetFromFileName(fileName: string, folderSlug: string): ClubTrophyAsset {
  const baseName = fileName.replace(/\.png$/i, "");
  const match = baseName.match(/^(.*)\s-\s(\d+)$/);
  const label = (match?.[1] ?? baseName).replace(/\s*Trophy$/i, "").trim();
  const count = Number.parseInt(match?.[2] ?? "1", 10);

  return {
    id: folderSlug + "-" + baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    count: Number.isFinite(count) && count > 0 ? count : 1,
    imageUrl: "/touchlineArena/clubs/" + folderSlug + "/trophies/" + encodeURIComponent(fileName),
    tone: trophyTone(label),
  };
}

/**
 * Reads only the versioned manifest. An unknown or genuinely asset-less club
 * returns an empty list so the profile can render its existing honest fallback.
 */
export function getTouchlineClubTrophyAssets({
  shortCode,
  clubSlug,
}: {
  shortCode: string;
  clubSlug: string;
}): ClubTrophyAsset[] {
  const folderSlug = TOUCHLINE_TROPHY_FOLDER_BY_CLUB_CODE[shortCode] ?? clubSlug;
  const fileNames = (TOUCHLINE_CLUB_TROPHY_MANIFEST as Record<string, readonly string[]>)[folderSlug];
  if (!fileNames?.length) return [];

  return fileNames
    .map((fileName) => trophyAssetFromFileName(fileName, folderSlug))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));
}
