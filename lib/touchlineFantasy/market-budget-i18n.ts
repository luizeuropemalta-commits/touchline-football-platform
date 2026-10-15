import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";

export const TOUCHLINE_FANTASY_MARKET_BUDGET_COPY = {
  "en-GB": {
    insufficient: "Insufficient budget",
    exhausted: "Your XI budget is used up", exceeded: "This player would exceed your XI budget",
    advice: "Choose cheaper players or compare plans with a larger budget. You can remove a player or replace one with a cheaper option to free up budget; coaches remain free.",
    compare: "Explore and compare plans", upgrade: "Change plan", reviewXI: "Review and replace players", previewOnly: "Plan information only. Opening this comparison does not change your plan or make a payment.",
    rule: "Your current plan's XI budget is {budget} TC. Coaches are free.",
  },
  "pt-BR": {
    insufficient: "Saldo insuficiente",
    exhausted: "O orçamento do seu XI acabou", exceeded: "Este jogador ultrapassaria o orçamento do seu XI",
    advice: "Escolha jogadores mais baratos ou conheça planos com mais orçamento. Você pode remover um jogador ou trocá-lo por outro mais barato para liberar saldo; treinadores continuam gratuitos.",
    compare: "Conhecer e comparar planos", upgrade: "Mudar de plano", reviewXI: "Revisar e trocar jogadores", previewOnly: "Apenas informações sobre os planos. Abrir esta comparação não muda seu plano nem faz uma cobrança.",
    rule: "O orçamento do XI no seu plano atual é de {budget} TC. Treinadores são gratuitos.",
  },
  "es-ES": {
    insufficient: "Saldo insuficiente",
    exhausted: "Has agotado el presupuesto de tu XI", exceeded: "Este jugador superaría el presupuesto de tu XI",
    advice: "Elige jugadores más baratos o compara planes con más presupuesto. Puedes quitar un jugador o sustituirlo por uno más barato para liberar saldo; los entrenadores siguen siendo gratis.",
    compare: "Conocer y comparar planes", upgrade: "Cambiar de plan", reviewXI: "Revisar y sustituir jugadores", previewOnly: "Solo información sobre los planes. Abrir esta comparación no cambia tu plan ni realiza ningún cobro.",
    rule: "El presupuesto del XI de tu plan actual es de {budget} TC. Los entrenadores son gratis.",
  },
  "it-IT": {
    insufficient: "Budget insufficiente",
    exhausted: "Il budget del tuo XI è esaurito", exceeded: "Questo giocatore supererebbe il budget del tuo XI",
    advice: "Scegli giocatori meno costosi o confronta piani con più budget. Puoi rimuovere un giocatore o sostituirlo con uno meno costoso per liberare budget; gli allenatori restano gratuiti.",
    compare: "Scopri e confronta i piani", upgrade: "Cambia piano", reviewXI: "Rivedi e sostituisci i giocatori", previewOnly: "Solo informazioni sui piani. Aprire questo confronto non cambia il tuo piano né effettua un pagamento.",
    rule: "Il budget del XI del tuo piano attuale è di {budget} TC. Gli allenatori sono gratuiti.",
  },
  "fr-FR": {
    insufficient: "Budget insuffisant",
    exhausted: "Le budget de votre XI est épuisé", exceeded: "Ce joueur dépasserait le budget de votre XI",
    advice: "Choisissez des joueurs moins chers ou comparez les offres avec un budget supérieur. Vous pouvez retirer un joueur ou le remplacer par un joueur moins cher pour libérer du budget ; les entraîneurs restent gratuits.",
    compare: "Découvrir et comparer les offres", upgrade: "Changer d’offre", reviewXI: "Revoir et remplacer des joueurs", previewOnly: "Informations uniquement. Ouvrir ce comparatif ne modifie pas votre offre et ne déclenche aucun paiement.",
    rule: "Le budget du XI de votre offre actuelle est de {budget} TC. Les entraîneurs sont gratuits.",
  },
  "ar-SA": {
    insufficient: "الرصيد غير كافٍ",
    exhausted: "نفدت ميزانية تشكيلتك الأساسية", exceeded: "سيؤدي اختيار هذا اللاعب إلى تجاوز ميزانية تشكيلتك",
    advice: "اختر لاعبين أقل تكلفة أو قارن الخطط ذات الميزانية الأكبر. يمكنك إزالة لاعب أو استبداله بآخر أقل تكلفة لتوفير رصيد؛ يبقى المدربون مجانيين.",
    compare: "استكشف الخطط وقارن بينها", upgrade: "تغيير الخطة", reviewXI: "راجع اللاعبين واستبدلهم", previewOnly: "معلومات عن الخطط فقط. فتح المقارنة لا يغيّر خطتك ولا ينفّذ أي عملية دفع.",
    rule: "ميزانية التشكيلة في خطتك الحالية هي {budget} TC. المدربون مجانيون.",
  },
  "tr-TR": {
    insufficient: "Yetersiz bütçe",
    exhausted: "İlk 11 bütçeniz tükendi", exceeded: "Bu oyuncu ilk 11 bütçenizi aşar",
    advice: "Daha ucuz oyuncular seçin veya daha yüksek bütçeli planları karşılaştırın. Bütçe açmak için bir oyuncuyu çıkarabilir ya da daha ucuz biriyle değiştirebilirsiniz; antrenörler ücretsiz kalır.",
    compare: "Planları keşfet ve karşılaştır", upgrade: "Planı değiştir", reviewXI: "Oyuncuları gözden geçir ve değiştir", previewOnly: "Yalnızca plan bilgileri. Bu karşılaştırmayı açmak planınızı değiştirmez veya ödeme yapmaz.",
    rule: "Mevcut planınızın ilk 11 bütçesi {budget} TC. Antrenörler ücretsizdir.",
  },
  "de-DE": {
    insufficient: "Unzureichendes Budget",
    exhausted: "Dein Startelf-Budget ist aufgebraucht", exceeded: "Dieser Spieler würde dein Startelf-Budget überschreiten",
    advice: "Wähle günstigere Spieler oder vergleiche Pläne mit höherem Budget. Du kannst einen Spieler entfernen oder durch einen günstigeren ersetzen, um Budget freizugeben; Trainer bleiben kostenlos.",
    compare: "Pläne entdecken und vergleichen", upgrade: "Plan ändern", reviewXI: "Spieler prüfen und ersetzen", previewOnly: "Nur Planinformationen. Das Öffnen dieses Vergleichs ändert deinen Plan nicht und löst keine Zahlung aus.",
    rule: "Das Startelf-Budget deines aktuellen Plans beträgt {budget} TC. Trainer sind kostenlos.",
  },
} as const;

export function getTouchlineFantasyMarketBudgetCopy(locale?: string | null, draftLocalesEnabled = false) {
  return TOUCHLINE_FANTASY_MARKET_BUDGET_COPY[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function formatTouchlineFantasyBudgetAmount(value: number, locale: string, draftLocalesEnabled = false) {
  return Number.isFinite(value) && value >= 0
    ? new Intl.NumberFormat(resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled), { notation: "compact", maximumFractionDigits: 1 }).format(value).replace(/m$/, "M")
    : "—";
}
