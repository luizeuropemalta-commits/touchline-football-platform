import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import { getTouchlineCardMatchFactLabels } from "./card-match-fact-i18n.ts";
import { getTouchlinePlayerPerformanceCopy } from "./player-performance-i18n.ts";

export const TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_STATUS = "draft" as const;

// Presentation descriptors only: PT baseline followed by six unapproved drafts.
// English deliberately retains the caller's readable fallback, not a catalogue
// replacement. Codes, counts, rates and football identities remain untouched.
const columns = { "pt-BR": 0, "es-ES": 1, "it-IT": 2, "fr-FR": 3, "ar-SA": 4, "tr-TR": 5, "de-DE": 6 } as const;
const descriptors = {
  fouls: ["Faltas", "Faltas", "Falli", "Fautes", "الأخطاء", "Fauller", "Fouls"],
  offsides: ["Impedimentos", "Fueras de juego", "Fuorigioco", "Hors-jeu", "حالات التسلل", "Ofsaytlar", "Abseitsstellungen"],
  penalties: ["Pênaltis", "Penaltis", "Rigori", "Penalties", "ركلات الجزاء", "Penaltılar", "Elfmeter"],
  "shots-total": ["Finalizações", "Tiros", "Tiri", "Tirs", "التسديدات", "Şutlar", "Schüsse"],
  "shots-blocked": ["Finalizações bloqueadas", "Remates bloqueados", "Conclusioni bloccate", "Tentatives contrées", "المحاولات المحجوبة", "Engellenen vuruşlar", "Geblockte Abschlüsse"],
  "blocked-shots": ["Chutes bloqueados", "Tiros bloqueados", "Tiri bloccati", "Tirs contrés", "التسديدات المحجوبة", "Engellenen şutlar", "Geblockte Schüsse"],
  "hit-woodwork": ["Bolas na trave", "Tiros al poste o al larguero", "Pali e traverse colpiti", "Tirs sur les montants", "التسديدات في القائم أو العارضة", "Direkten dönen toplar", "Pfosten- und Lattentreffer"],
  passes: ["Passes", "Pases", "Passaggi", "Passes", "التمريرات", "Paslar", "Pässe"],
  touches: ["Toques na bola", "Toques de balón", "Tocchi di palla", "Touches de balle", "لمسات الكرة", "Topla buluşmalar", "Ballkontakte"],
  "duels-lost": ["Duelos perdidos", "Duelos perdidos", "Duelli persi", "Duels perdus", "الالتحامات الخاسرة", "Kaybedilen ikili mücadeleler", "Verlorene Zweikämpfe"],
  "backward-passes": ["Passes para trás", "Pases hacia atrás", "Passaggi all’indietro", "Passes en retrait", "التمريرات إلى الخلف", "Geri paslar", "Rückpässe"],
  "possession-lost": ["Perdas de posse", "Pérdidas de posesión", "Possessi persi", "Pertes de possession", "مرات فقدان الاستحواذ", "Top kayıpları", "Ballbesitzverluste"],
  "passes-in-final-third": ["Passes no terço final", "Pases en el último tercio", "Passaggi nell’ultimo terzo", "Passes dans le dernier tiers", "التمريرات في الثلث الأخير", "Son üçte birlik alandaki paslar", "Pässe im letzten Drittel"],
  "cumulative-minutes-played": ["Minutos acumulados", "Minutos acumulados", "Minuti complessivi", "Minutes cumulées", "الدقائق التراكمية", "Toplam dakika", "Kumulierte Spielminuten"],
  "long-balls-won-percentage": ["Precisão dos lançamentos longos", "Precisión de los pases largos", "Precisione dei lanci lunghi", "Précision des passes longues", "دقة الكرات الطويلة", "Uzun top isabeti", "Genauigkeit langer Bälle"],
  "successful-crosses-percentage": ["Precisão dos cruzamentos", "Precisión de los centros", "Precisione dei cross", "Précision des centres", "دقة العرضيات", "Orta isabeti", "Flankengenauigkeit"],
  "accurate-passes": ["Passes certos", "Pases acertados", "Passaggi riusciti", "Passes réussies", "التمريرات الناجحة", "İsabetli paslar", "Erfolgreiche Pässe"],
  "accurate-passes-percentage": ["Precisão dos passes", "Precisión de los pases", "Precisione dei passaggi", "Précision des passes", "دقة التمرير", "Pas isabeti", "Passgenauigkeit"],
  "key-passes": ["Passes decisivos", "Pases clave", "Passaggi chiave", "Passes clés", "التمريرات المفتاحية", "Kilit paslar", "Schlüsselpässe"],
  "total-crosses": ["Cruzamentos", "Centros", "Cross", "Centres", "العرضيات", "Ortalar", "Flanken"],
  "accurate-crosses": ["Cruzamentos certos", "Centros acertados", "Cross riusciti", "Centres réussis", "العرضيات الناجحة", "İsabetli ortalar", "Erfolgreiche Flanken"],
  "long-balls": ["Lançamentos longos", "Pases largos", "Lanci lunghi", "Passes longues", "الكرات الطويلة", "Uzun toplar", "Lange Bälle"],
  "long-balls-won": ["Lançamentos longos certos", "Pases largos acertados", "Lanci lunghi riusciti", "Passes longues réussies", "الكرات الطويلة الناجحة", "İsabetli uzun toplar", "Erfolgreiche lange Bälle"],
  "through-balls": ["Passes em profundidade", "Pases al hueco", "Passaggi filtranti", "Passes en profondeur", "التمريرات البينية", "Ara paslar", "Steilpässe"],
  "through-balls-won": ["Passes em profundidade certos", "Pases al hueco acertados", "Passaggi filtranti riusciti", "Passes en profondeur réussies", "التمريرات البينية الناجحة", "İsabetli ara paslar", "Erfolgreiche Steilpässe"],
  tackles: ["Desarmes", "Entradas", "Contrasti", "Tacles", "التدخلات", "Top kapmalar", "Tacklings"],
  interceptions: ["Interceptações", "Intercepciones", "Intercetti", "Interceptions", "الاعتراضات", "Pas araları", "Abgefangene Bälle"],
  clearances: ["Cortes", "Despejes", "Spazzate", "Dégagements", "الإبعادات", "Uzaklaştırmalar", "Klärungsaktionen"],
  "total-duels": ["Duelos", "Duelos", "Duelli", "Duels", "الالتحامات", "İkili mücadeleler", "Zweikämpfe"],
  "duels-won": ["Duelos vencidos", "Duelos ganados", "Duelli vinti", "Duels gagnés", "الالتحامات الناجحة", "Kazanılan ikili mücadeleler", "Gewonnene Zweikämpfe"],
  "aerial-won": ["Duelos aéreos vencidos", "Duelos aéreos ganados", "Duelli aerei vinti", "Duels aériens gagnés", "الالتحامات الهوائية الناجحة", "Kazanılan hava topları", "Gewonnene Luftzweikämpfe"],
  "dribble-attempts": ["Tentativas de drible", "Intentos de regate", "Tentativi di dribbling", "Tentatives de dribble", "محاولات المراوغة", "Çalım denemeleri", "Dribblingversuche"],
  "successful-dribbles": ["Dribles certos", "Regates completados", "Dribbling riusciti", "Dribbles réussis", "المراوغات الناجحة", "Başarılı çalımlar", "Erfolgreiche Dribblings"],
  "dribbled-past": ["Dribles sofridos", "Veces superado en regate", "Dribbling subiti", "Dribbles subis", "مرات تجاوزه بالمراوغة", "Çalımla geçilme sayısı", "Überdribbelt"],
  dispossessed: ["Perdas de posse", "Veces desposeído del balón", "Palloni persi per contrasto", "Ballons perdus dans un duel", "مرات انتزاع الكرة منه", "Topu kaptırma sayısı", "Ballverluste im Zweikampf"],
  "fouls-drawn": ["Faltas sofridas", "Faltas recibidas", "Falli subiti", "Fautes subies", "الأخطاء المرتكبة ضده", "Kazanılan fauller", "Erlittene Fouls"],
  "saves-insidebox": ["Defesas dentro da área", "Paradas dentro del área", "Parate in area", "Arrêts dans la surface", "التصديات داخل منطقة الجزاء", "Ceza sahası içinden kurtarışlar", "Paraden im Strafraum"],
  "error-lead-to-goal": ["Erro que resultou em gol", "Error que provocó un gol", "Errore che ha causato un gol", "Erreur ayant entraîné un but", "خطأ أدى إلى هدف", "Gole yol açan hata", "Fehler mit Torfolge"],
  "minutes-played": ["Minutos jogados", "Minutos jugados", "Minuti giocati", "Minutes jouées", "دقائق اللعب", "Oynanan dakika", "Gespielte Minuten"],
  bench: ["No banco", "En el banquillo", "In panchina", "Sur le banc", "على مقاعد البدلاء", "Yedek kulübesinde", "Auf der Bank"],
  captain: ["Capitão", "Capitán", "Capitano", "Capitaine", "القائد", "Kaptan", "Kapitän"],
  "team-wins": ["Vitórias da equipe", "Victorias del equipo", "Vittorie della squadra", "Victoires de l’équipe", "انتصارات الفريق", "Takım galibiyetleri", "Siege des Teams"],
  "team-draws": ["Empates da equipe", "Empates del equipo", "Pareggi della squadra", "Matchs nuls de l’équipe", "تعادلات الفريق", "Takım beraberlikleri", "Unentschieden des Teams"],
  "team-lost": ["Derrotas da equipe", "Derrotas del equipo", "Sconfitte della squadra", "Défaites de l’équipe", "هزائم الفريق", "Takım mağlubiyetleri", "Niederlagen des Teams"],
  "big-chances-created": ["Grandes chances criadas", "Grandes ocasiones creadas", "Grandi occasioni create", "Grosses occasions créées", "الفرص الكبيرة المصنوعة", "Yaratılan büyük fırsatlar", "Herausgespielte Großchancen"],
  "big-chances-missed": ["Grandes chances perdidas", "Grandes ocasiones falladas", "Grandi occasioni fallite", "Grosses occasions manquées", "الفرص الكبيرة المهدرة", "Kaçırılan büyük fırsatlar", "Vergebene Großchancen"],
  "average-points-per-game": ["Média de pontos por jogo", "Media de puntos por partido", "Media punti a partita", "Moyenne de points par match", "متوسط النقاط لكل مباراة", "Maç başına ortalama puan", "Punkteschnitt pro Spiel"],
} as const satisfies Readonly<Record<string, readonly [string, string, string, string, string, string, string]>>;

// Only aliases already sharing a PT label in the legacy table. Distinct
// shots-blocked/blocked-shots and possession-lost/dispossessed stay distinct.
const aliases = {
  "aerials-won": "aerial-won", "aerial-duels-won": "aerial-won", cleansheets: "clean-sheets",
  yellowcards: "yellow-cards", redcards: "red-cards", lineups: "starts",
} as const;
const factKeys = {
  minutes: "minutes", goals: "goals", assists: "assists", "yellow-cards": "yellowCards", "red-cards": "redCards",
  "goals-conceded": "goalsConceded", saves: "saves", rating: "rating",
  "shots-on-target": "shotsOnTarget", "shots-off-target": "shotsOffTarget", "clean-sheets": "cleanSheets",
} as const;
const ptOverrides = {
  "shots-on-target": "Finalizações no gol", "shots-off-target": "Finalizações para fora", "clean-sheets": "Jogos sem sofrer gol",
} as const;

export function localizedStatLabel(code: string, fallback: string, locale: string, draftLocalesEnabled = false) {
  const readableFallback = fallback.replace(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
  const resolved = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  if (resolved === "en-GB") return readableFallback;
  const lookup = (value: string): string | undefined => {
    const normalized = value.toLowerCase().replace(/[_\s]+/g, "-");
    const key = Object.hasOwn(aliases, normalized) ? aliases[normalized as keyof typeof aliases] : normalized;
    if (resolved === "pt-BR" && Object.hasOwn(ptOverrides, key)) return ptOverrides[key as keyof typeof ptOverrides];
    if (key === "appearances" || key === "starts") return getTouchlinePlayerPerformanceCopy(resolved, draftLocalesEnabled)[key];
    if (Object.hasOwn(factKeys, key)) return getTouchlineCardMatchFactLabels(resolved, draftLocalesEnabled)[factKeys[key as keyof typeof factKeys]];
    if (Object.hasOwn(descriptors, key)) return descriptors[key as keyof typeof descriptors][columns[resolved]];
    return undefined;
  };
  return lookup(code) ?? lookup(fallback) ?? readableFallback;
}
