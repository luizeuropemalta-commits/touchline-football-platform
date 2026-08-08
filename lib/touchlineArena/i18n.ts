export const TOUCHLINE_DEFAULT_LOCALE = "en-GB";
export const TOUCHLINE_LOCALE_STORAGE_KEY = "touchline:locale:v1";

export const TOUCHLINE_SUPPORTED_LOCALES = [
  { code: "en-GB", shortLabel: "EN", label: "English", flag: "🇬🇧" },
  { code: "pt-BR", shortLabel: "PT", label: "Português", flag: "🇧🇷" },
  { code: "es-ES", shortLabel: "ES", label: "Español", flag: "🇪🇸" },
  { code: "fr-FR", shortLabel: "FR", label: "Français", flag: "🇫🇷" },
  { code: "de-DE", shortLabel: "DE", label: "Deutsch", flag: "🇩🇪" },
  { code: "it-IT", shortLabel: "IT", label: "Italiano", flag: "🇮🇹" },
  { code: "nl-NL", shortLabel: "NL", label: "Nederlands", flag: "🇳🇱" },
  { code: "sv-SE", shortLabel: "SV", label: "Svenska", flag: "🇸🇪" },
  { code: "no-NO", shortLabel: "NO", label: "Norsk", flag: "🇳🇴" },
  { code: "da-DK", shortLabel: "DA", label: "Dansk", flag: "🇩🇰" },
  { code: "pl-PL", shortLabel: "PL", label: "Polski", flag: "🇵🇱" },
  { code: "tr-TR", shortLabel: "TR", label: "Türkçe", flag: "🇹🇷" },
  { code: "ar-SA", shortLabel: "AR", label: "العربية", flag: "🇸🇦" },
  { code: "hi-IN", shortLabel: "HI", label: "हिन्दी", flag: "🇮🇳" },
  { code: "zh-CN", shortLabel: "ZH", label: "中文", flag: "🇨🇳" },
  { code: "ja-JP", shortLabel: "JA", label: "日本語", flag: "🇯🇵" },
  { code: "ko-KR", shortLabel: "KO", label: "한국어", flag: "🇰🇷" },
  { code: "id-ID", shortLabel: "ID", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "th-TH", shortLabel: "TH", label: "ไทย", flag: "🇹🇭" },
  { code: "vi-VN", shortLabel: "VI", label: "Tiếng Việt", flag: "🇻🇳" },
] as const;

export type TouchLineLocale = (typeof TOUCHLINE_SUPPORTED_LOCALES)[number]["code"];

export type TouchLineTranslationKey =
  | "language"
  | "comingSoon"
  | "arenaMenu"
  | "myClub"
  | "profile"
  | "marketTransfer"
  | "skipIntro"
  | "start"
  | "play"
  | "pause"
  | "lineup"
  | "exit"
  | "full"
  | "live"
  | "bench"
  | "transfer"
  | "rankings"
  | "newRumours"
  | "watch"
  | "closeAll"
  | "backToArena"
  | "backToPitch"
  | "enterArena"
  | "touchlineQuickLinks"
  | "touchlineArenaOnline"
  | "startMenu"
  | "startMenuDescription"
  | "substitutesBench"
  | "trainingCenterDescription"
  | "touchlineMarketTransfer"
  | "playerCardsRanking"
  | "watchGuide"
  | "formation"
  | "points"
  | "rank"
  | "squad"
  | "value"
  | "selected"
  | "matchday"
  | "gameBench"
  | "squadRule"
  | "matchRule"
  | "subLimit"
  | "gkRequired"
  | "gkBenchMinimum"
  | "changes"
  | "baseFormations"
  | "tacticalSystems"
  | "twoStrikers"
  | "howItWorks"
  | "selectBenchCard"
  | "clickPitchCard"
  | "confirmSwap"
  | "selectedBench"
  | "selectPitchCard"
  | "reserveVault"
  | "outsideMatchSheet"
  | "selectedForThisGame"
  | "eligibleBenchInstruction"
  | "reserveVaultInstruction"
  | "in"
  | "out"
  | "chooseCard"
  | "clickCardOnField"
  | "confirmSubstitution"
  | "releaseContractToMarket"
  | "openSelectedPlayerProfile"
  | "replaceAndReleaseContract"
  | "confirmContractTermination"
  | "cancelContractTermination"
  | "contractTerminationWarning"
  | "releaseSelectedReserve"
  | "squadMarketValue"
  | "available"
  | "contracts"
  | "marketListed"
  | "premierClubs"
  | "ranking"
  | "choosePlayerPremiumCard"
  | "clubHub"
  | "quickSubstitution"
  | "playerProfile"
  | "clubProfile"
  | "closePreview"
  | "marketCardPreview"
  | "edition"
  | "openSlots"
  | "openOnPitch"
  | "openSquad"
  | "releaseContractFirst"
  | "buyCardToSquad"
  | "selectPlayerCard"
  | "walletBalance"
  | "marketCart"
  | "cartEmpty"
  | "addToCart"
  | "removeFromCart"
  | "inCart"
  | "cartTotal"
  | "balanceAfter"
  | "checkoutCart"
  | "checkoutCompleted"
  | "cartCapacityError"
  | "cartCapacityReached"
  | "insufficientTc"
  | "soldOut"
  | "touchlineTables"
  | "clubOwnersAndCards"
  | "rankingsDescription"
  | "rankingsShortcutDescription"
  | "openTables"
  | "cardRanking"
  | "cardClubOwnerRank"
  | "top20OwnerValue"
  | "topCardsDescription"
  | "club"
  | "allClubs"
  | "favorites"
  | "search"
  | "searchPlaceholder"
  | "recent"
  | "relevance"
  | "save"
  | "saved"
  | "squadUpdate"
  | "yourCard"
  | "noSignal"
  | "noSignalsNow"
  | "signalsDescription"
  | "broadcasters"
  | "officialWaysToWatch"
  | "watchAvailability"
  | "fixture"
  | "kickoffAndChannel"
  | "fixtureDescription"
  | "formationFinalized"
  | "formationLocked"
  | "formationDraft"
  | "protectedAsSaved"
  | "shapeSaved"
  | "dragAdjustLock"
  | "xPosition"
  | "yPosition"
  | "cardSize"
  | "up"
  | "left"
  | "right"
  | "down"
  | "saveMarketCardFirst"
  | "lockFormation"
  | "unlockCamera"
  | "saveLineup"
  | "autoSaved"
  | "cardDataUpdated"
  | "arenaCleared"
  | "demoElevenCards"
  | "fixtureNeedsElevenStarters"
  | "sourceUnavailable"
  | "sourceUnavailableToCompleteCards"
  | "savedLocally"
  | "savedLocallySyncUnavailable"
  | "demoLineupNotSaved"
  | "accountStateLoading"
  | "formationApplied"
  | "formationLocking"
  | "formationLockedLocally"
  | "formationUnlocked"
  | "formationUnlockedLocally"
  | "formationEditing"
  | "formationSizeEditing"
  | "formationDragging"
  | "chooseReserve"
  | "localData"
  // Kept for archived visual-audit checkpoints, which are included in the
  // repository typecheck. The active Arena no longer blocks portrait users.
  | "landscapeRequired"
  | "rotateDevice"
  | "enterLandscape"
  | "openClubOwnerProfile"
  | "replayIntro"
  | "loadingSource"
  | "loadingClub"
  | "loadingSignals"
  | "playersLoaded"
  | "fixtureLoaded"
  | "nationalityShort"
  | "marketValueShort"
  | "marketValuePending"
  | "buyCardShort"
  | "nextMatchShort"
  | "clubOwner"
  | "clubOwnerInformation"
  | "trophyGallery"
  | "leagueHistory"
  | "inProgress"
  | "clubControl"
  | "matchdayStructure"
  | "clubValue"
  | "clubValueDescription"
  | "squadTcValue"
  | "squadTcValueShort"
  | "squadTcValueDescription"
  | "startingXi"
  | "startingXiDescription"
  | "matchdayBenchLabel"
  | "benchDescription"
  | "notRelatedLabel"
  | "reserveVaultDescription"
  | "coach"
  | "coachSlot"
  | "verifiedCoachPending"
  | "coachMatchEvidencePending"
  | "goalkeepers"
  | "goalkeepersDescription"
  | "touchlinePoints"
  | "touchlinePointsDescription"
  | "ownedPlayerCards"
  | "fullSquad"
  | "playerOrderDescription"
  | "officialShop"
  | "clubHubDescription"
  | "clubHonours"
  | "clubHonoursUnavailable"
  | "previousTrophy"
  | "nextTrophy"
  | "touchlineCards"
  | "squadSource"
  | "clubTable"
  | "fullTables"
  | "tableDemoDescription"
  | "officialTableDescription"
  | "officialTablePending"
  | "officialTablePendingDescription"
  | "nextMatch"
  | "clubStore"
  | "officialShopTraffic"
  | "clubStoreDescription"
  | "partnerSlots"
  | "spaces"
  | "partnerDescription"
  | "clubCards"
  | "cardShelf"
  | "partnershipPreview"
  | "topClubAssets"
  | "partnershipDescription"
  | "cardsPending"
  | "scheduleSyncing"
  | "opponentToBeConfirmed"
  | "kickoffPending"
  | "dataCache"
  | "liveData"
  | "demoData"
  | "squadPending"
  | "cardsFallback"
  | "playedShort"
  | "winsShort"
  | "drawsShort"
  | "lossesShort"
  | "goalDifferenceShort"
  | "goalsForShort"
  | "goalsAgainstShort"
  | "pointsShort"
  | "formShort"
  | "locked"
  | "ready"
  | "hotStatus"
  | "watchStatus"
  | "riskStatus"
  | "slotSelected"
  | "needsPosition"
  | "slotFull"
  | "selectedFromBench"
  | "lockedByFormation"
  | "choosePosition"
  | "invalidForSelectedSlot"
  | "outsideMatchdayBenchStatus"
  | "replacementCompleted"
  | "selectedCardIs"
  | "useFormationForTwoStrikers"
  | "positionGoalkeeper"
  | "positionCentreBack"
  | "positionFullBack"
  | "positionMidfield"
  | "positionWinger"
  | "positionStriker"
  | "positionOutfield"
  | "impactFinisher"
  | "impactWideThreat"
  | "impactCreator"
  | "impactControl"
  | "impactBetweenLines"
  | "impactTempo"
  | "impactChanceCreation"
  | "impactCleanSheet"
  | "impactDuelWin"
  | "impactAerialPower"
  | "impactPassing"
  | "impactBuildUp"
  | "impactSaves"
  | "impactDistribution"
  | "impactDefensiveCover"
  | "impactCounter"
  | "impactDirectRuns"
  | "impactFlair"
  | "impactPace"
  | "impactBalance"
  | "impactPressure"
  | "impactRecovery"
  | "impactLateRun"
  | "impactSquadDepth";

const en: Record<TouchLineTranslationKey, string> = {
  language: "Language",
  comingSoon: "Coming soon",
  arenaMenu: "Arena Menu",
  myClub: "My Club",
  profile: "Profile",
  marketTransfer: "Market Transfer",
  skipIntro: "Skip Intro",
  start: "Start",
  play: "Play",
  pause: "Pause",
  lineup: "Lineup",
  exit: "Exit",
  full: "Full",
  live: "Live",
  bench: "Club Squad",
  transfer: "Market Transfer",
  rankings: "Rankings",
  newRumours: "New Rumours",
  watch: "Watch",
  closeAll: "Close all",
  backToArena: "Back to Arena",
  backToPitch: "Back to pitch",
  enterArena: "Enter Arena",
  touchlineQuickLinks: "TouchLine quick links",
  touchlineArenaOnline: "TouchLine Arena Online",
  startMenu: "Start Menu",
  startMenuDescription: "Choose an area and return to the pitch without leaving the Arena atmosphere.",
  substitutesBench: "Training Center",
  trainingCenterDescription: "Lineup, squad, bench and substitutions",
  touchlineMarketTransfer: "TouchLine Market Transfer",
  playerCardsRanking: "Player Cards Ranking",
  watchGuide: "Watch Guide",
  formation: "Formation",
  points: "Points",
  rank: "Rank",
  squad: "Squad",
  value: "Value",
  selected: "Selected",
  matchday: "Matchday",
  gameBench: "Game bench",
  squadRule: "Squad rule",
  matchRule: "Match rule",
  subLimit: "Sub limit",
  gkRequired: "GK required",
  gkBenchMinimum: "GK bench minimum",
  changes: "changes",
  baseFormations: "Base formations",
  tacticalSystems: "tactical systems",
  twoStrikers: "Two strikers",
  howItWorks: "How it works",
  selectBenchCard: "Select bench card",
  clickPitchCard: "Click pitch card",
  confirmSwap: "Confirm swap",
  selectedBench: "Selected bench",
  selectPitchCard: "Select a card on the pitch",
  reserveVault: "Reserve Vault",
  outsideMatchSheet: "outside match sheet",
  selectedForThisGame: "Selected for this game",
  eligibleBenchInstruction: "Pick one eligible game-bench card. Then click the player card on the pitch that leaves the XI and confirm the swap.",
  reserveVaultInstruction: "Reserve Vault cards are owned by the Club Owner, but they are outside this match sheet. Move them into the game bench before match lock.",
  in: "In",
  out: "Out",
  chooseCard: "Choose card",
  clickCardOnField: "Click a card directly on the field",
  confirmSubstitution: "Confirm substitution",
  releaseContractToMarket: "Release contract to market",
  openSelectedPlayerProfile: "Open player profile",
  replaceAndReleaseContract: "Replace and end contract",
  confirmContractTermination: "Confirm contract termination",
  cancelContractTermination: "Keep contract",
  contractTerminationWarning: "{incoming} takes the pitch and {outgoing}'s contract ends. This reduces the contracted squad by one card.",
  releaseSelectedReserve: "Release selected reserve",
  squadMarketValue: "Official squad market value",
  available: "Available",
  contracts: "Contracted squad",
  marketListed: "Club players",
  premierClubs: "Premier clubs 26/27",
  ranking: "Ranking",
  choosePlayerPremiumCard: "Choose a player to open the premium card on the side.",
  clubHub: "ClubHub",
  quickSubstitution: "Quick substitution",
  playerProfile: "PlayerProfile",
  clubProfile: "Club Profile",
  closePreview: "Close preview",
  marketCardPreview: "Market card preview",
  edition: "Edition",
  openSlots: "Open slots",
  openOnPitch: "Already on pitch",
  openSquad: "Already in squad",
  releaseContractFirst: "Release contract first",
  buyCardToSquad: "Contract player for the squad",
  selectPlayerCard: "Select a player to view the card.",
  walletBalance: "TC balance",
  marketCart: "Selected players",
  cartEmpty: "Select players to negotiate their contracts",
  addToCart: "Select player",
  removeFromCart: "Remove selection",
  inCart: "Selected",
  cartTotal: "Selected TC total",
  balanceAfter: "Balance after contracts",
  checkoutCart: "Contract selected players",
  checkoutCompleted: "{count} cards contracted · {total} Touch Credits used",
  cartCapacityError: "Only {count} contract slots are open",
  cartCapacityReached: "Selection fills every open contract slot",
  insufficientTc: "Insufficient TC balance",
  soldOut: "Sold out",
  touchlineTables: "TouchLine Tables",
  clubOwnersAndCards: "Club Owners and cards",
  rankingsDescription: "Card Club Owner Rank orders owners by current squad card value. Card Player Rank orders the cards they control across Market Transfer, Club Hub and Squad.",
  rankingsShortcutDescription: "Player cards and ClubOwners in one ranking",
  openTables: "Open tables",
  cardRanking: "Card ranking",
  cardClubOwnerRank: "Card Club Owner Rank",
  top20OwnerValue: "Top 20 in production. Demo shows the first rows and orders by current squad card value.",
  topCardsDescription: "Every card starts in the initial category. Published TouchLine Points control the ranking after each round.",
  club: "Club",
  allClubs: "All clubs",
  favorites: "Favorites",
  search: "Search",
  searchPlaceholder: "Club, player or status",
  recent: "Recent",
  relevance: "Relevance",
  save: "Save",
  saved: "Saved",
  squadUpdate: "Squad update",
  yourCard: "Your card",
  noSignal: "No signal",
  noSignalsNow: "No verified TouchLine England news or signals right now.",
  signalsDescription: "When contracted data provides news, lineups, absences, suspensions, live events or reliable availability signals, they will appear here without being presented as facts before the data supports them.",
  broadcasters: "Broadcasters",
  officialWaysToWatch: "Official ways to watch",
  watchAvailability: "TouchLine England can show broadcasters linked to fixtures when that data is available. No pirate streaming here.",
  fixture: "Fixture",
  kickoffAndChannel: "Kick-off and channel",
  fixtureDescription: "The match card shows local kick-off, stadium, league and the official route to follow it.",
  formationFinalized: "Formation finalized",
  formationLocked: "Formation locked",
  formationDraft: "Formation draft",
  protectedAsSaved: "Protected exactly as saved",
  shapeSaved: "This shape is saved and reused",
  dragAdjustLock: "Drag cards on the pitch, adjust size, then lock",
  xPosition: "X position",
  yPosition: "Y position",
  cardSize: "Card size",
  up: "Up",
  left: "Left",
  right: "Right",
  down: "Down",
  saveMarketCardFirst: "Save a market card to formation first.",
  lockFormation: "Lock",
  unlockCamera: "Unlock camera",
  saveLineup: "Save lineup",
  autoSaved: "Auto saved",
  cardDataUpdated: "Card data updated",
  arenaCleared: "Arena cleared",
  demoElevenCards: "Demo 11 cards",
  fixtureNeedsElevenStarters: "Fixture has fewer than 11 starters",
  sourceUnavailable: "Data source unavailable",
  sourceUnavailableToCompleteCards: "Data source unavailable to complete cards",
  savedLocally: "Saved locally",
  savedLocallySyncUnavailable: "Saved locally · account sync unavailable",
  demoLineupNotSaved: "Demo line-up is not saved",
  accountStateLoading: "Account state is still loading",
  formationApplied: "Formation applied",
  formationLocking: "Locking formation",
  formationLockedLocally: "Formation locked locally",
  formationUnlocked: "Formation unlocked",
  formationUnlockedLocally: "Formation unlocked locally",
  formationEditing: "Editing formation",
  formationSizeEditing: "Editing card size",
  formationDragging: "Adjusting formation",
  chooseReserve: "choose a reserve",
  localData: "Local data",
  landscapeRequired: "Landscape mode required",
  rotateDevice: "Rotate your device to continue in the TouchLine Arena.",
  enterLandscape: "Enter landscape",
  openClubOwnerProfile: "Open ClubOwner profile",
  replayIntro: "Watch intro",
  loadingSource: "Loading TouchLine England",
  loadingClub: "Loading club data",
  loadingSignals: "Loading TouchLine signals",
  playersLoaded: "players loaded",
  fixtureLoaded: "loaded",
  nationalityShort: "Nat",
  marketValueShort: "Market Value",
  marketValuePending: "Updating",
  buyCardShort: "Contract",
  nextMatchShort: "Next",
  clubOwner: "Club Owner",
  clubOwnerInformation: "Club Owner information",
  trophyGallery: "Trophy Gallery",
  leagueHistory: "League history",
  inProgress: "In progress",
  clubControl: "Club Control",
  matchdayStructure: "Matchday structure",
  clubValue: "Official Football Value",
  clubValueDescription: "Sum of verified official football market values only",
  squadTcValue: "Current squad card value",
  squadTcValueShort: "Squad card value",
  squadTcValueDescription: "Live total of the approved nominal prices of every contracted card",
  startingXi: "Starting XI",
  startingXiDescription: "Cards currently leading the Club Owner ranking",
  matchdayBenchLabel: "Substitutes",
  benchDescription: "Selected matchday substitutes",
  notRelatedLabel: "Not selected",
  reserveVaultDescription: "Owned cards outside the matchday selection",
  coach: "Coach",
  coachSlot: "Coach slot",
  verifiedCoachPending: "Verified data pending",
  coachMatchEvidencePending: "Waiting for verified match data",
  goalkeepers: "Goalkeepers",
  goalkeepersDescription: "Required squad protection",
  touchlinePoints: "TouchLine Points",
  touchlinePointsDescription: "Primary order once the league starts",
  ownedPlayerCards: "Owned Player Cards",
  fullSquad: "Full squad",
  playerOrderDescription: "Neutral preseason order now. Published TouchLine Points control the order after each round.",
  officialShop: "Official Shop",
  clubHubDescription: "Premium club presence for cards, supporters, shop activation and approved partner visibility.",
  clubHonours: "Club Honours",
  clubHonoursUnavailable: "Club honours are not yet available in the TouchLine verified catalogue.",
  previousTrophy: "Previous trophy",
  nextTrophy: "Next trophy",
  touchlineCards: "TouchLine Cards",
  squadSource: "Squad Source",
  clubTable: "Club table",
  fullTables: "Full tables",
  tableDemoDescription: "The demo table is seeded for presentation. When the season starts, it must come from official match results and TouchLine league rules.",
  officialTableDescription: "Official football results only. Scheduled and live matches never affect the table.",
  officialTablePending: "Official standings will appear after the first verified final result.",
  officialTablePendingDescription: "No completed England fixture is currently available in the canonical TouchLine data source.",
  nextMatch: "Next Match",
  clubStore: "Club Store",
  officialShopTraffic: "Official shop traffic",
  clubStoreDescription: "Approved club store links can turn card interest into shirt and merchandise visits.",
  partnerSlots: "Partner Slots",
  spaces: "spaces",
  partnerDescription: "Official club sponsors can appear here only after club approval and partnership rules.",
  clubCards: "Club Cards",
  cardShelf: "card shelf",
  partnershipPreview: "Partnership Preview",
  topClubAssets: "Top club assets",
  partnershipDescription: "A premium preview of how the club can be represented when licensing is approved.",
  cardsPending: "Cards from this club will appear here when the owner signs them.",
  scheduleSyncing: "Schedule syncing",
  opponentToBeConfirmed: "Opponent to be confirmed",
  kickoffPending: "Kick-off pending",
  dataCache: "TouchLine Verified",
  liveData: "TouchLine live data",
  demoData: "TouchLine demo",
  squadPending: "Squad pending",
  cardsFallback: "Demo cards fallback",
  playedShort: "P",
  winsShort: "W",
  drawsShort: "D",
  lossesShort: "L",
  goalDifferenceShort: "GD",
  goalsForShort: "GF",
  goalsAgainstShort: "GA",
  pointsShort: "PTS",
  formShort: "Form",
  locked: "Locked",
  ready: "Ready",
  hotStatus: "Hot",
  watchStatus: "Watch",
  riskStatus: "Risk",
  slotSelected: "slot selected",
  needsPosition: "needs",
  slotFull: "slot full",
  selectedFromBench: "selected from bench",
  lockedByFormation: "locked by formation",
  choosePosition: "choose",
  invalidForSelectedSlot: "is not valid for the selected slot",
  outsideMatchdayBenchStatus: "is outside the matchday bench",
  replacementCompleted: "replaced",
  selectedCardIs: "selected card is",
  useFormationForTwoStrikers: "Use {formations} for two strikers.",
  positionGoalkeeper: "goalkeeper",
  positionCentreBack: "centre-back",
  positionFullBack: "full-back",
  positionMidfield: "midfielder",
  positionWinger: "winger",
  positionStriker: "striker",
  positionOutfield: "outfield player",
  impactFinisher: "finishing",
  impactWideThreat: "wide threat",
  impactCreator: "creation",
  impactControl: "control",
  impactBetweenLines: "between lines",
  impactTempo: "tempo",
  impactChanceCreation: "chance creation",
  impactCleanSheet: "clean-sheet strength",
  impactDuelWin: "duel strength",
  impactAerialPower: "aerial strength",
  impactPassing: "passing",
  impactBuildUp: "build-up",
  impactSaves: "saves",
  impactDistribution: "distribution",
  impactDefensiveCover: "defensive cover",
  impactCounter: "counterattack",
  impactDirectRuns: "direct runs",
  impactFlair: "flair",
  impactPace: "pace",
  impactBalance: "balance",
  impactPressure: "pressure",
  impactRecovery: "recovery",
  impactLateRun: "late runs",
  impactSquadDepth: "squad depth",
};

const ptBR: Record<TouchLineTranslationKey, string> = {
  language: "Idioma",
  comingSoon: "Em breve",
  arenaMenu: "Menu da Arena",
  myClub: "Meu Clube",
  profile: "Perfil",
  marketTransfer: "Market Transfer",
  skipIntro: "Pular intro",
  start: "Iniciar",
  play: "Play",
  pause: "Pausar",
  lineup: "Escalação",
  exit: "Sair",
  full: "Tela cheia",
  live: "Ao vivo",
  bench: "Elenco",
  transfer: "Market Transfer",
  rankings: "Rankings",
  newRumours: "Novos rumores",
  watch: "Assistir",
  closeAll: "Fechar tudo",
  backToArena: "Voltar à Arena",
  backToPitch: "Voltar ao campo",
  enterArena: "Entrar na Arena",
  touchlineQuickLinks: "Links rápidos TouchLine",
  touchlineArenaOnline: "TouchLine Arena Online",
  startMenu: "Menu inicial",
  startMenuDescription: "Escolha uma área e volte ao campo sem sair da atmosfera da Arena.",
  substitutesBench: "Centro de Treinamento",
  trainingCenterDescription: "Escalação, elenco, banco e substituições",
  touchlineMarketTransfer: "TouchLine Market Transfer",
  playerCardsRanking: "Ranking dos cards de jogadores",
  watchGuide: "Guia para assistir",
  formation: "Formação",
  points: "Pontos",
  rank: "Rank",
  squad: "Elenco",
  value: "Valor",
  selected: "Selecionados",
  matchday: "Relacionados",
  gameBench: "Banco do jogo",
  squadRule: "Regra do elenco",
  matchRule: "Regra do jogo",
  subLimit: "Limite de troca",
  gkRequired: "goleiros obrigatórios",
  gkBenchMinimum: "goleiro mínimo no banco",
  changes: "trocas",
  baseFormations: "Formações base",
  tacticalSystems: "sistemas táticos",
  twoStrikers: "Dois centroavantes",
  howItWorks: "Como funciona",
  selectBenchCard: "Selecionar card do banco",
  clickPitchCard: "Clicar card no campo",
  confirmSwap: "Confirmar troca",
  selectedBench: "Banco selecionado",
  selectPitchCard: "Selecione um card no campo",
  reserveVault: "Reservas",
  outsideMatchSheet: "fora dos relacionados",
  selectedForThisGame: "Selecionado para este jogo",
  eligibleBenchInstruction: "Escolha um card elegível do banco do jogo. Depois clique no card do campo que sai do XI e confirme a troca.",
  reserveVaultInstruction: "Cards do Reserve Vault pertencem ao ClubOwner, mas ficam fora dos relacionados deste jogo. Mova para o banco do jogo antes do fechamento da partida.",
  in: "Entra",
  out: "Sai",
  chooseCard: "Escolher card",
  clickCardOnField: "Clique em um card diretamente no campo",
  confirmSubstitution: "Confirmar substituição",
  releaseContractToMarket: "Liberar contrato ao mercado",
  openSelectedPlayerProfile: "Abrir perfil do jogador",
  replaceAndReleaseContract: "Substituir e encerrar contrato",
  confirmContractTermination: "Confirmar encerramento do contrato",
  cancelContractTermination: "Manter contrato",
  contractTerminationWarning: "{incoming} entra em campo e o contrato de {outgoing} é encerrado. O elenco contratado diminui em um card.",
  releaseSelectedReserve: "Liberar reserva selecionado",
  squadMarketValue: "Valor oficial do elenco",
  available: "Disponível",
  contracts: "Elenco contratado",
  marketListed: "Jogadores no clube",
  premierClubs: "Clubes Premier 26/27",
  ranking: "Ranking",
  choosePlayerPremiumCard: "Escolha um jogador para abrir o card premium ao lado.",
  clubHub: "ClubHub",
  quickSubstitution: "Substituição rápida",
  playerProfile: "PlayerProfile",
  clubProfile: "Club Profile",
  closePreview: "Fechar prévia",
  marketCardPreview: "Prévia do card de mercado",
  edition: "Edição",
  openSlots: "Vagas livres",
  openOnPitch: "Já está no campo",
  openSquad: "Já está no elenco",
  releaseContractFirst: "Libere contrato primeiro",
  buyCardToSquad: "Contratar jogador para o elenco",
  selectPlayerCard: "Selecione um jogador para ver o card.",
  walletBalance: "Saldo TC",
  marketCart: "Selecionados",
  cartEmpty: "Selecione jogadores para negociar os contratos",
  addToCart: "Selecionar jogador",
  removeFromCart: "Remover seleção",
  inCart: "Selecionado",
  cartTotal: "Total selecionado em TC",
  balanceAfter: "Saldo após os contratos",
  checkoutCart: "Contratar selecionados",
  checkoutCompleted: "{count} cards contratados · {total} Touch Credits usados",
  cartCapacityError: "Existem apenas {count} vagas de contrato abertas",
  cartCapacityReached: "A seleção ocupa todas as vagas disponíveis",
  insufficientTc: "Saldo TC insuficiente",
  soldOut: "Esgotado",
  touchlineTables: "TouchLine Tables",
  clubOwnersAndCards: "ClubOwners e cards",
  rankingsDescription: "Card ClubOwner Rank ordena os donos pelo valor atual dos cards do elenco. Card Player Rank ordena os cards controlados em Market Transfer, Central do Clube e Elenco.",
  rankingsShortcutDescription: "Cards de jogadores e ClubOwners no mesmo ranking",
  openTables: "Abrir tabelas",
  cardRanking: "Ranking de cards",
  cardClubOwnerRank: "Card ClubOwner Rank",
  top20OwnerValue: "Top 20 em produção. O demo mostra as primeiras linhas e ordena pelo valor atual dos cards do elenco.",
  topCardsDescription: "Todos os cards começam na categoria inicial. Os Pontos TouchLine publicados comandam o ranking após cada rodada.",
  club: "Clube",
  allClubs: "Todos os clubes",
  favorites: "Favoritos",
  search: "Buscar",
  searchPlaceholder: "Clube, jogador ou status",
  recent: "Mais recente",
  relevance: "Relevância",
  save: "Salvar",
  saved: "Salvo",
  squadUpdate: "Atualização do squad",
  yourCard: "Seu card",
  noSignal: "Sem sinal",
  noSignalsNow: "Nenhuma notícia ou sinal verificado da TouchLine England agora.",
  signalsDescription: "Quando os dados contratados trouxerem notícias, escalações, ausências, suspensões, eventos ao vivo ou sinais confiáveis de disponibilidade, eles aparecerão aqui sem serem tratados como fatos antes da confirmação dos dados.",
  broadcasters: "Transmissores",
  officialWaysToWatch: "Formas oficiais de assistir",
  watchAvailability: "A TouchLine England pode mostrar transmissores ligados aos jogos quando esse dado estiver disponível. Nada de streaming pirata aqui.",
  fixture: "Jogo",
  kickoffAndChannel: "Horário e canal",
  fixtureDescription: "O card da partida mostra horário local, estádio, liga e a rota oficial para acompanhar.",
  formationFinalized: "Formação finalizada",
  formationLocked: "Formação travada",
  formationDraft: "Formação em rascunho",
  protectedAsSaved: "Protegida exatamente como salva",
  shapeSaved: "Este desenho está salvo e será reutilizado",
  dragAdjustLock: "Arraste cards no campo, ajuste tamanho e depois trave",
  xPosition: "Posição X",
  yPosition: "Posição Y",
  cardSize: "Tamanho do card",
  up: "Cima",
  left: "Esquerda",
  right: "Direita",
  down: "Baixo",
  saveMarketCardFirst: "Salve primeiro um card de mercado na formação.",
  lockFormation: "Travar",
  unlockCamera: "Destravar câmera",
  saveLineup: "Salvar escalação",
  autoSaved: "Salvo automaticamente",
  cardDataUpdated: "Dados do card atualizados",
  arenaCleared: "Arena limpa",
  demoElevenCards: "11 cards de demonstração",
  fixtureNeedsElevenStarters: "O jogo tem menos de 11 titulares",
  sourceUnavailable: "Fonte de dados indisponível",
  sourceUnavailableToCompleteCards: "Fonte de dados indisponível para completar os cards",
  savedLocally: "Salvo neste dispositivo",
  savedLocallySyncUnavailable: "Salvo neste dispositivo · sincronização da conta indisponível",
  demoLineupNotSaved: "A escalação de demonstração não é salva",
  accountStateLoading: "O estado da conta ainda está carregando",
  formationApplied: "Formação aplicada",
  formationLocking: "Travando formação",
  formationLockedLocally: "Formação travada neste dispositivo",
  formationUnlocked: "Formação destravada",
  formationUnlockedLocally: "Formação destravada neste dispositivo",
  formationEditing: "Editando formação",
  formationSizeEditing: "Editando tamanho do card",
  formationDragging: "Ajustando formação",
  chooseReserve: "escolha um reserva",
  localData: "Dados locais",
  landscapeRequired: "Modo horizontal obrigatório",
  rotateDevice: "Vire o dispositivo para continuar na TouchLine Arena.",
  enterLandscape: "Entrar em modo horizontal",
  openClubOwnerProfile: "Abrir perfil do ClubOwner",
  replayIntro: "Ver introdução",
  loadingSource: "Carregando TouchLine England",
  loadingClub: "Carregando dados do clube",
  loadingSignals: "Carregando sinais TouchLine",
  playersLoaded: "jogadores carregados",
  fixtureLoaded: "carregado",
  nationalityShort: "País",
  marketValueShort: "Valor",
  marketValuePending: "Em atualização",
  buyCardShort: "Contratar",
  nextMatchShort: "Próximo",
  clubOwner: "ClubOwner",
  clubOwnerInformation: "Informações do ClubOwner",
  trophyGallery: "Galeria de troféus",
  leagueHistory: "Histórico da liga",
  inProgress: "Em andamento",
  clubControl: "Controle do clube",
  matchdayStructure: "Estrutura do dia de jogo",
  clubValue: "Valor oficial do futebol",
  clubValueDescription: "Soma apenas dos valores oficiais de mercado verificados",
  squadTcValue: "Valor atual dos cards do elenco",
  squadTcValueShort: "Valor dos cards",
  squadTcValueDescription: "Soma dos preços nominais aprovados de todos os cards contratados",
  startingXi: "11 titulares",
  startingXiDescription: "Cards atualmente escalados entre os titulares",
  matchdayBenchLabel: "Banco de reservas",
  benchDescription: "Reservas relacionados para a partida",
  notRelatedLabel: "Não relacionados",
  reserveVaultDescription: "Cards contratados fora dos relacionados da partida",
  coach: "Treinador",
  coachSlot: "Vaga do treinador",
  verifiedCoachPending: "Aguardando dados verificados",
  coachMatchEvidencePending: "Aguardando dados verificados da partida",
  goalkeepers: "Goleiros",
  goalkeepersDescription: "Proteção obrigatória do elenco",
  touchlinePoints: "Pontos TouchLine",
  touchlinePointsDescription: "Ordem principal quando a liga começar",
  ownedPlayerCards: "Cards de jogadores contratados",
  fullSquad: "Elenco completo",
  playerOrderDescription: "Ordem neutra de pré-temporada. Os Pontos TouchLine publicados comandam a ordem após cada rodada.",
  officialShop: "Loja oficial",
  clubHubDescription: "Presença premium do clube para cards, torcedores, loja e visibilidade de parceiros autorizados.",
  clubHonours: "Títulos do clube",
  clubHonoursUnavailable: "Os títulos do clube ainda não estão disponíveis no catálogo verificado da TouchLine.",
  previousTrophy: "Troféu anterior",
  nextTrophy: "Próximo troféu",
  touchlineCards: "Cards TouchLine",
  squadSource: "Fonte do elenco",
  clubTable: "Tabela de clubes",
  fullTables: "Tabelas completas",
  tableDemoDescription: "A tabela de demonstração existe apenas para apresentação. Quando a temporada começar, os dados virão dos resultados oficiais e das regras da liga TouchLine.",
  officialTableDescription: "Somente resultados oficiais. Partidas agendadas e ao vivo nunca alteram a tabela.",
  officialTablePending: "A tabela oficial aparecerá após o primeiro resultado final verificado.",
  officialTablePendingDescription: "Ainda não há partida concluída da England disponível na fonte canônica da TouchLine.",
  nextMatch: "Próxima partida",
  clubStore: "Loja do clube",
  officialShopTraffic: "Acesso à loja oficial",
  clubStoreDescription: "Links autorizados da loja podem transformar o interesse nos cards em visitas para camisas e produtos oficiais.",
  partnerSlots: "Espaços de parceiros",
  spaces: "espaços",
  partnerDescription: "Patrocinadores oficiais só aparecem aqui após aprovação do clube e das regras de parceria.",
  clubCards: "Cards do clube",
  cardShelf: "galeria de cards",
  partnershipPreview: "Prévia de parceria",
  topClubAssets: "Destaques do clube",
  partnershipDescription: "Uma prévia premium de como o clube pode ser apresentado após a aprovação do licenciamento.",
  cardsPending: "Os cards deste clube aparecerão aqui quando forem contratados pelo ClubOwner.",
  scheduleSyncing: "Calendário sincronizando",
  opponentToBeConfirmed: "Adversário a confirmar",
  kickoffPending: "Horário pendente",
  dataCache: "TouchLine Verificado",
  liveData: "Dados ao vivo TouchLine",
  demoData: "Demonstração TouchLine",
  squadPending: "Elenco pendente",
  cardsFallback: "Cards de demonstração",
  playedShort: "J",
  winsShort: "V",
  drawsShort: "E",
  lossesShort: "D",
  goalDifferenceShort: "SG",
  goalsForShort: "GP",
  goalsAgainstShort: "GC",
  pointsShort: "PTS",
  formShort: "Forma",
  locked: "Bloqueado",
  ready: "Pronto",
  hotStatus: "Em alta",
  watchStatus: "Acompanhar",
  riskStatus: "Risco",
  slotSelected: "posição selecionada",
  needsPosition: "precisa de",
  slotFull: "posição preenchida",
  selectedFromBench: "selecionado no banco",
  lockedByFormation: "bloqueado pela formação",
  choosePosition: "escolha",
  invalidForSelectedSlot: "não é válido para a posição selecionada",
  outsideMatchdayBenchStatus: "está fora do banco relacionado",
  replacementCompleted: "substituiu",
  selectedCardIs: "o card selecionado é",
  useFormationForTwoStrikers: "Use {formations} para escalar dois centroavantes.",
  positionGoalkeeper: "goleiro",
  positionCentreBack: "zagueiro",
  positionFullBack: "lateral",
  positionMidfield: "meio-campista",
  positionWinger: "ponta",
  positionStriker: "centroavante",
  positionOutfield: "jogador de linha",
  impactFinisher: "finalização",
  impactWideThreat: "ameaça pelos lados",
  impactCreator: "criação",
  impactControl: "controle",
  impactBetweenLines: "entrelinhas",
  impactTempo: "ritmo do jogo",
  impactChanceCreation: "criação de chances",
  impactCleanSheet: "força defensiva",
  impactDuelWin: "força nos duelos",
  impactAerialPower: "jogo aéreo",
  impactPassing: "passes",
  impactBuildUp: "construção",
  impactSaves: "defesas",
  impactDistribution: "distribuição",
  impactDefensiveCover: "cobertura defensiva",
  impactCounter: "contra-ataque",
  impactDirectRuns: "corridas diretas",
  impactFlair: "talento",
  impactPace: "velocidade",
  impactBalance: "equilíbrio",
  impactPressure: "pressão",
  impactRecovery: "recuperação",
  impactLateRun: "infiltração",
  impactSquadDepth: "profundidade do elenco",
};

const completeTranslations: Partial<Record<TouchLineLocale, Record<TouchLineTranslationKey, string>>> = {
  "en-GB": en,
  "pt-BR": ptBR,
};

export function normalizeTouchLineLocale(locale?: string | null): TouchLineLocale {
  // Public rendering is deliberately limited to the two complete catalogues.
  // Keeping this normalizer narrow makes the URL, SSR HTML language, client
  // state and links agree instead of advertising an incomplete language over
  // English fallback copy.
  return locale === "pt-BR" || locale === "en-GB" ? locale : TOUCHLINE_DEFAULT_LOCALE;
}

export function isTouchLineLocaleComplete(locale?: string | null) {
  return locale === "en-GB" || locale === "pt-BR";
}

export function touchLineT(locale: string | null | undefined, key: TouchLineTranslationKey) {
  const normalizedLocale = normalizeTouchLineLocale(locale);
  return completeTranslations[normalizedLocale]?.[key] ?? en[key];
}
