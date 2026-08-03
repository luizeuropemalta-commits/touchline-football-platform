export type ShirtNumberColorEvidence =
  | "official-2026-27-print"
  | "official-2026-27-kit"
  | "recent-official-print"
  | "provisional";

export type TouchLineShirtNumberPalette = {
  clubName: string;
  slug: string;
  preset: string;
  fill: string;
  outline: string;
  evidence: ShirtNumberColorEvidence;
  sourceUrl: string;
  note: string;
  aliases: string[];
};

const PREMIER_LEAGUE_KIT_INDEX =
  "https://www.premierleague.com/en/news/4658330/premier-league-club-kits-for-202627-season";

/*
 * `fill` follows the best available home-shirt number reference.
 * `outline` is a TouchLine digital contrast treatment, not a claim about the
 * physical outline used on the club's official shirt.
 */
export const TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES: TouchLineShirtNumberPalette[] = [
  {
    clubName: "AFC Bournemouth",
    slug: "bournemouth",
    preset: "TouchLineBournemouth",
    fill: "#ffffff",
    outline: "#050505",
    evidence: "official-2026-27-kit",
    sourceUrl: "https://superstore.afcb.co.uk/products/mens-home-shirt-26-27-red-black",
    note: "Branco sobre o painel vermelho e preto; contorno preto para leitura no card.",
    aliases: ["afc bournemouth", "bournemouth"],
  },
  {
    clubName: "Arsenal FC",
    slug: "arsenal",
    preset: "TouchLineArsenal",
    fill: "#ffffff",
    outline: "#151f35",
    evidence: "recent-official-print",
    sourceUrl: PREMIER_LEAGUE_KIT_INDEX,
    note: "Branco sobre o corpo vermelho; contorno azul-marinho TouchLine.",
    aliases: ["arsenal", "arsenal fc"],
  },
  {
    clubName: "Aston Villa",
    slug: "aston-villa",
    preset: "TouchLineAstonVilla",
    fill: "#ffffff",
    outline: "#670e36",
    evidence: "official-2026-27-print",
    sourceUrl:
      "https://shop.avfc.co.uk/en/aston-villa-adidas-home-shirt-2026-27-with-rogers-27-printing/p-133326891765728488+z-99-2601042470",
    note: "Branco sobre o claret; contorno claret TouchLine.",
    aliases: ["aston villa", "villa"],
  },
  {
    clubName: "Brentford FC",
    slug: "brentford",
    preset: "TouchLineBrentford",
    fill: "#ffffff",
    outline: "#111111",
    evidence: "recent-official-print",
    sourceUrl:
      "https://shop.brentfordfc.com/kit/2526-home-kit/adult/5354_2526-brentford-adult-authentic-home-shirt.html",
    note: "Branco sobre o painel vermelho das costas; contorno preto TouchLine.",
    aliases: ["brentford", "brentford fc"],
  },
  {
    clubName: "Brighton & Hove Albion",
    slug: "brighton",
    preset: "TouchLineBrighton",
    fill: "#ffffff",
    outline: "#003b7a",
    evidence: "official-2026-27-kit",
    sourceUrl:
      "https://shop.brightonandhovealbion.com/new-in/new/new-in/7588_BHAFC-Adult-2627-Home-Shirt.html",
    note: "Branco sobre o azul royal; contorno azul profundo TouchLine.",
    aliases: ["brighton", "brighton and hove albion", "brighton & hove albion"],
  },
  {
    clubName: "Chelsea FC",
    slug: "chelsea",
    preset: "TouchLineChelsea",
    fill: "#ffffff",
    outline: "#061b4f",
    evidence: "recent-official-print",
    sourceUrl: "https://www.chelseamegastore.com/",
    note: "Branco sobre o azul; contorno azul-marinho TouchLine.",
    aliases: ["chelsea", "chelsea fc"],
  },
  {
    clubName: "Coventry City",
    slug: "coventry-city",
    preset: "TouchLineCoventry",
    fill: "#ffffff",
    outline: "#123d67",
    evidence: "recent-official-print",
    sourceUrl: "https://www.ccfcstore.com/shop-by-player/7_sakamoto/",
    note: "Branco sobre o sky blue; contorno navy TouchLine.",
    aliases: ["coventry", "coventry city"],
  },
  {
    clubName: "Crystal Palace",
    slug: "crystal-palace",
    preset: "TouchLineCrystalPalace",
    fill: "#ffffff",
    outline: "#101b45",
    evidence: "recent-official-print",
    sourceUrl: "https://shop.cpfc.co.uk/",
    note: "Branco sobre vermelho e azul; contorno navy TouchLine.",
    aliases: ["crystal palace", "palace"],
  },
  {
    clubName: "Everton FC",
    slug: "everton",
    preset: "TouchLineEverton",
    fill: "#ffffff",
    outline: "#0b2c63",
    evidence: "official-2026-27-kit",
    sourceUrl: PREMIER_LEAGUE_KIT_INDEX,
    note: "Branco sobre azul royal; contorno navy TouchLine.",
    aliases: ["everton", "everton fc"],
  },
  {
    clubName: "Fulham FC",
    slug: "fulham",
    preset: "TouchLineFulham",
    fill: "#111111",
    outline: "#ffffff",
    evidence: "provisional",
    sourceUrl: "https://shop.fulhamfc.com/",
    note: "Preto sobre branco, provisório até a camisa 2026/27 ser publicada.",
    aliases: ["fulham", "fulham fc"],
  },
  {
    clubName: "Hull City",
    slug: "hull-city",
    preset: "TouchLineHullCity",
    fill: "#ffffff",
    outline: "#111111",
    evidence: "official-2026-27-kit",
    sourceUrl: "https://www.tigerleisure.com/replica/home-kit/adult/5029_2627-adult-home-shirt.html",
    note: "Branco sobre âmbar e preto; contorno preto TouchLine.",
    aliases: ["hull", "hull city"],
  },
  {
    clubName: "Ipswich Town",
    slug: "ipswich-town",
    preset: "TouchLineIpswich",
    fill: "#ffffff",
    outline: "#0a2854",
    evidence: "official-2026-27-kit",
    sourceUrl: "https://shop.itfc.co.uk/products/2627-adult-home-shirt-ss-blue",
    note: "Branco sobre azul; contorno navy TouchLine.",
    aliases: ["ipswich", "ipswich town"],
  },
  {
    clubName: "Leeds United",
    slug: "leeds-united",
    preset: "TouchLineLeedsUnited",
    fill: "#153e7e",
    outline: "#ffffff",
    evidence: "official-2026-27-kit",
    sourceUrl: PREMIER_LEAGUE_KIT_INDEX,
    note: "Azul-marinho sobre branco; contorno branco TouchLine.",
    aliases: ["leeds", "leeds united"],
  },
  {
    clubName: "Liverpool FC",
    slug: "liverpool",
    preset: "TouchLineLiverpool",
    fill: "#ffffff",
    outline: "#6e0018",
    evidence: "official-2026-27-kit",
    sourceUrl: "https://store.liverpoolfc.com/",
    note: "Branco sobre vermelho; contorno vermelho profundo TouchLine.",
    aliases: ["liverpool", "liverpool fc"],
  },
  {
    clubName: "Manchester City",
    slug: "manchester-city",
    preset: "TouchLineManchesterCity",
    fill: "#1c2c5b",
    outline: "#ffffff",
    evidence: "official-2026-27-print",
    sourceUrl:
      "https://shop.mancity.com/en/manchester-city-home-jersey-2026-27-with-marmoush-7-printing/701242784BL001806.html",
    note: "Navy sobre sky blue; contorno branco TouchLine.",
    aliases: ["manchester city", "man city", "mancity"],
  },
  {
    clubName: "Manchester United",
    slug: "manchester-united",
    preset: "TouchLineManchesterUnited",
    fill: "#ffffff",
    outline: "#111111",
    evidence: "official-2026-27-print",
    sourceUrl:
      "https://store.manutd.com/en/p/manchester-united-2627-home-jersey-with-amad-16-epl-printing-and-badge-6055",
    note: "Branco sobre vermelho; contorno preto TouchLine.",
    aliases: ["manchester united", "man united", "man utd", "manutd"],
  },
  {
    clubName: "Newcastle United",
    slug: "newcastle-united",
    preset: "TouchLineNewcastle",
    fill: "#111111",
    outline: "#ffffff",
    evidence: "recent-official-print",
    sourceUrl:
      "https://www.global.jdsports.com/product/black-adidas-newcastle-united-fc-2526-woltemade-27-home-shirt/797060/",
    note: "Preto sobre o painel branco; contorno branco TouchLine.",
    aliases: ["newcastle", "newcastle united"],
  },
  {
    clubName: "Nottingham Forest",
    slug: "nottingham-forest",
    preset: "TouchLineNottinghamForest",
    fill: "#ffffff",
    outline: "#76000b",
    evidence: "official-2026-27-kit",
    sourceUrl: "https://shop.nottinghamforest.co.uk/products/nffc-26-27-home-shirt",
    note: "Branco sobre vermelho; contorno vermelho profundo TouchLine.",
    aliases: ["nottingham forest", "forest"],
  },
  {
    clubName: "Sunderland AFC",
    slug: "sunderland",
    preset: "TouchLineSunderland",
    fill: "#111111",
    outline: "#ffffff",
    evidence: "recent-official-print",
    sourceUrl: "https://www.safcstore.com/",
    note: "Preto sobre vermelho e branco; contorno branco TouchLine.",
    aliases: ["sunderland", "sunderland afc"],
  },
  {
    clubName: "Tottenham Hotspur",
    slug: "tottenham-hotspur",
    preset: "TouchLineTottenham",
    fill: "#132257",
    outline: "#ffffff",
    evidence: "official-2026-27-kit",
    sourceUrl:
      "https://shop.tottenhamhotspur.com/products/mens-stadium-tottenham-hotspur-home-shirt-2026-27-157023.html",
    note: "Navy sobre branco; contorno branco TouchLine.",
    aliases: ["tottenham", "tottenham hotspur", "spurs"],
  },
];

const DEFAULT_PALETTE = TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES.find(
  (palette) => palette.slug === "manchester-city",
)!;

function normalizeClubName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PALETTE_BY_CLUB_NAME = new Map<string, TouchLineShirtNumberPalette>();

for (const palette of TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES) {
  for (const name of [palette.clubName, palette.slug, ...palette.aliases]) {
    PALETTE_BY_CLUB_NAME.set(normalizeClubName(name), palette);
  }
}

export function touchlineShirtNumberPaletteForClub(
  clubName: string,
): TouchLineShirtNumberPalette {
  return PALETTE_BY_CLUB_NAME.get(normalizeClubName(clubName)) || DEFAULT_PALETTE;
}
