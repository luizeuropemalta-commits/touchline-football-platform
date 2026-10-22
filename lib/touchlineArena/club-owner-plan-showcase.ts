import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import type { TouchLineLocale } from "./i18n.ts";
import { CLUB_PLANS, CLUB_SEASON_TOP_UP_LIMIT } from "../touchlineFantasy/club-market-rules.ts";
import { CLUB_ROSTER_CAPACITY } from "../touchlineFantasy/club-roster.ts";

/** Product proposal only. Never use these values as wallet balances or entitlements. */
export const CLUB_OWNER_PLAN_PREVIEWS = [
  { id: "beta", amount: "100M", budget: CLUB_PLANS.beta.budget },
  { id: "standard", amount: "750M", budget: CLUB_PLANS.standard.budget },
  { id: "master", amount: "1.5B", budget: CLUB_PLANS.master.budget },
  { id: "vip", amount: "3B", budget: CLUB_PLANS.vip.budget },
] as const;
// Legacy persisted entitlements remain readable, but Pro is not a new offer.
export type ClubOwnerPlanPreview = typeof CLUB_OWNER_PLAN_PREVIEWS[number]["id"] | "pro";

const VIP_PLAN_NAMES: Readonly<Record<TouchLineLocale, string>> = {
  "en-GB": "VIP", "pt-BR": "VIP", "es-ES": "VIP", "it-IT": "VIP",
  "fr-FR": "VIP", "ar-SA": "VIP", "tr-TR": "VIP", "de-DE": "VIP",
};
export function getClubOwnerVipPlanName(locale: string, draftLocalesEnabled = false): string {
  return VIP_PLAN_NAMES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

const en = {
  browse: "Explore plans", previous: "Previous plan", next: "Next plan", preview: "Plan preview — your subscription is unchanged.",
  planBudget: "Plan market power", currentBudget: "Your remaining XI budget", invitation: "Invitation only",
  vipBenefit: "Reserved for guests invited by TouchLine.", unlimited: "Unlimited", pricePending: "Price to be defined", benefitPending: "Benefits to be defined", member: "{plan} MEMBER",
};
type Copy = Readonly<Record<keyof typeof en, string>>;
export const CLUB_OWNER_PLAN_SHOWCASE_COPY: Readonly<Record<TouchLineLocale, Copy>> = {
  "en-GB": en,
  "pt-BR": { browse: "Conhecer planos", previous: "Plano anterior", next: "Próximo plano", preview: "Prévia do plano — sua assinatura não foi alterada.", planBudget: "Poder de mercado do plano", currentBudget: "Seu orçamento restante do XI", invitation: "Somente por convite", vipBenefit: "Exclusivo para convidados da TouchLine.", unlimited: "Ilimitado", pricePending: "Preço a definir", benefitPending: "Benefícios a definir", member: "MEMBRO {plan}" },
  "es-ES": { browse: "Conocer planes", previous: "Plan anterior", next: "Plan siguiente", preview: "Vista previa del plan — tu suscripción no ha cambiado.", planBudget: "Poder de mercado del plan", currentBudget: "Tu presupuesto restante del once", invitation: "Solo por invitación", vipBenefit: "Exclusivo para invitados de TouchLine.", unlimited: "Ilimitado", pricePending: "Precio por definir", benefitPending: "Ventajas por definir", member: "MIEMBRO {plan}" },
  "it-IT": { browse: "Scopri i piani", previous: "Piano precedente", next: "Piano successivo", preview: "Anteprima del piano — il tuo abbonamento non è cambiato.", planBudget: "Potere di mercato del piano", currentBudget: "Il budget residuo dei tuoi undici", invitation: "Solo su invito", vipBenefit: "Riservato agli ospiti invitati da TouchLine.", unlimited: "Illimitato", pricePending: "Prezzo da definire", benefitPending: "Vantaggi da definire", member: "MEMBRO {plan}" },
  "fr-FR": { browse: "Découvrir les offres", previous: "Offre précédente", next: "Offre suivante", preview: "Aperçu de l’offre — votre abonnement reste inchangé.", planBudget: "Pouvoir de marché de l’offre", currentBudget: "Votre budget restant pour le onze", invitation: "Sur invitation uniquement", vipBenefit: "Réservé aux invités de TouchLine.", unlimited: "Illimité", pricePending: "Prix à définir", benefitPending: "Avantages à définir", member: "MEMBRE {plan}" },
  "ar-SA": { browse: "استكشف الخطط", previous: "الخطة السابقة", next: "الخطة التالية", preview: "معاينة الخطة — لم يتغير اشتراكك.", planBudget: "قوة السوق للخطة", currentBudget: "ميزانيتك المتبقية للتشكيلة", invitation: "بالدعوة فقط", vipBenefit: "حصري للضيوف المدعوين من TouchLine.", unlimited: "غير محدود", pricePending: "السعر سيُحدد لاحقًا", benefitPending: "المزايا ستُحدد لاحقًا", member: "عضو {plan}" },
  "tr-TR": { browse: "Planları keşfet", previous: "Önceki plan", next: "Sonraki plan", preview: "Plan önizlemesi — aboneliğiniz değişmedi.", planBudget: "Planın piyasa gücü", currentBudget: "İlk 11 için kalan bütçeniz", invitation: "Yalnızca davetle", vipBenefit: "TouchLine tarafından davet edilen konuklara özel.", unlimited: "Sınırsız", pricePending: "Fiyat belirlenecek", benefitPending: "Avantajlar belirlenecek", member: "{plan} ÜYE" },
  "de-DE": { browse: "Pläne entdecken", previous: "Vorheriger Plan", next: "Nächster Plan", preview: "Planvorschau — dein Abo bleibt unverändert.", planBudget: "Marktmacht des Plans", currentBudget: "Dein verbleibendes Startelf-Budget", invitation: "Nur auf Einladung", vipBenefit: "Exklusiv für von TouchLine eingeladene Gäste.", unlimited: "Unbegrenzt", pricePending: "Preis noch offen", benefitPending: "Vorteile noch offen", member: "{plan}-MITGLIED" },
};
const experienceEn = { membership: "Membership", fantasyFootball: "Fantasy football", comparePlans: "Compare plans", details: "Plan details", close: "Close", previewShort: "Plan preview", plan: "Plan", viewPlan: "View plan", selected: "Selected", choosePlan: "Choose plan", working: "We're preparing plan changes. Your current plan and balance have not changed." };
export const CLUB_OWNER_PLAN_EXPERIENCE_COPY: Readonly<Record<TouchLineLocale, Readonly<Record<keyof typeof experienceEn, string>>>> = {
  "en-GB": experienceEn,
  "pt-BR": { membership: "Assinatura", fantasyFootball: "Futebol fantasy", comparePlans: "Comparar planos", details: "Detalhes do plano", close: "Fechar", previewShort: "Prévia do plano", plan: "Plano", viewPlan: "Ver plano", selected: "Selecionado", choosePlan: "Escolher plano", working: "Estamos preparando a mudança de plano. Seu plano atual e seu saldo não foram alterados." },
  "es-ES": { membership: "Suscripción", fantasyFootball: "Fútbol fantasy", comparePlans: "Comparar planes", details: "Detalles del plan", close: "Cerrar", previewShort: "Vista previa del plan", plan: "Plan", viewPlan: "Ver plan", selected: "Seleccionado", choosePlan: "Elegir plan", working: "Estamos preparando los cambios de plan. Tu plan y saldo actuales no han cambiado." },
  "it-IT": { membership: "Abbonamento", fantasyFootball: "Fantacalcio", comparePlans: "Confronta i piani", details: "Dettagli del piano", close: "Chiudi", previewShort: "Anteprima del piano", plan: "Piano", viewPlan: "Vedi piano", selected: "Selezionato", choosePlan: "Scegli il piano", working: "Stiamo preparando il cambio di piano. Il tuo piano e il saldo attuali non sono cambiati." },
  "fr-FR": { membership: "Abonnement", fantasyFootball: "Football fantasy", comparePlans: "Comparer les offres", details: "Détails de l’offre", close: "Fermer", previewShort: "Aperçu de l’offre", plan: "Offre", viewPlan: "Voir l’offre", selected: "Sélectionnée", choosePlan: "Choisir l’offre", working: "Nous préparons les changements d’offre. Votre offre et votre solde actuels n’ont pas changé." },
  "ar-SA": { membership: "العضوية", fantasyFootball: "فانتازي كرة القدم", comparePlans: "قارن الخطط", details: "تفاصيل الخطة", close: "إغلاق", previewShort: "معاينة الخطة", plan: "الخطة", viewPlan: "عرض الخطة", selected: "محددة", choosePlan: "اختر الخطة", working: "نعمل على إتاحة تغيير الخطط. خطتك الحالية ورصيدك لم يتغيرا." },
  "tr-TR": { membership: "Üyelik", fantasyFootball: "Fantezi futbol", comparePlans: "Planları karşılaştır", details: "Plan ayrıntıları", close: "Kapat", previewShort: "Plan önizlemesi", plan: "Plan", viewPlan: "Planı gör", selected: "Seçili", choosePlan: "Planı seç", working: "Plan değişikliklerini hazırlıyoruz. Mevcut planınız ve bakiyeniz değişmedi." },
  "de-DE": { membership: "Mitgliedschaft", fantasyFootball: "Fantasy-Fußball", comparePlans: "Pläne vergleichen", details: "Plandetails", close: "Schließen", previewShort: "Planvorschau", plan: "Plan", viewPlan: "Plan ansehen", selected: "Ausgewählt", choosePlan: "Plan wählen", working: "Wir bereiten Planwechsel vor. Dein aktueller Plan und dein Guthaben bleiben unverändert." },
};
const BETA_MARKET_BENEFIT: Readonly<Record<TouchLineLocale, string>> = {
  "en-GB": "50M TC XI budget. Player Market: Hull City, Coventry City, Ipswich Town and Bournemouth. Public browsing and coaches remain open.",
  "pt-BR": "Orçamento de 50M TC para o XI. Mercado de jogadores: Hull City, Coventry City, Ipswich Town e Bournemouth. Navegação pública e treinadores continuam livres.",
  "es-ES": "Presupuesto de 50M TC para el once. Mercado de jugadores: Hull City, Coventry City, Ipswich Town y Bournemouth. La navegación pública y los entrenadores siguen abiertos.",
  "it-IT": "Budget di 50M TC per gli undici. Mercato giocatori: Hull City, Coventry City, Ipswich Town e Bournemouth. La navigazione pubblica e gli allenatori restano accessibili.",
  "fr-FR": "Budget de 50M TC pour le onze. Marché des joueurs : Hull City, Coventry City, Ipswich Town et Bournemouth. La navigation publique et les entraîneurs restent accessibles.",
  "ar-SA": "ميزانية 50 مليون TC للتشكيلة الأساسية. سوق اللاعبين: هال سيتي وكوفنتري سيتي وإيبسويتش تاون وبورنموث. يظل التصفح العام والمدربون متاحين.",
  "tr-TR": "İlk 11 için 50M TC bütçe. Oyuncu Pazarı: Hull City, Coventry City, Ipswich Town ve Bournemouth. Herkese açık gezinme ve teknik direktörler erişilebilir kalır.",
  "de-DE": "50M TC Startelf-Budget. Spielermarkt: Hull City, Coventry City, Ipswich Town und Bournemouth. Öffentliches Browsen und Trainer bleiben zugänglich.",
};
const BETA_PRICE: Readonly<Record<TouchLineLocale, string>> = {
  "en-GB": "Free", "pt-BR": "Gratuito", "es-ES": "Gratis", "it-IT": "Gratuito",
  "fr-FR": "Gratuit", "ar-SA": "مجاني", "tr-TR": "Ücretsiz", "de-DE": "Kostenlos",
};
const SEASON_PRICE_COPY: Readonly<Record<TouchLineLocale, Readonly<{ masterPrice: string; vipPrice: string; seasonalPrice: string; priceLabel: string }>>> = {
  "en-GB": { masterPrice: "€89.90/season", vipPrice: "€169.90/season", seasonalPrice: "Price per season", priceLabel: "Price" },
  "pt-BR": { masterPrice: "€89,90/temporada", vipPrice: "€169,90/temporada", seasonalPrice: "Preço por temporada", priceLabel: "Preço" },
  "es-ES": { masterPrice: "89,90 €/temporada", vipPrice: "169,90 €/temporada", seasonalPrice: "Precio por temporada", priceLabel: "Precio" },
  "it-IT": { masterPrice: "89,90 €/stagione", vipPrice: "169,90 €/stagione", seasonalPrice: "Prezzo per stagione", priceLabel: "Prezzo" },
  "fr-FR": { masterPrice: "89,90 €/saison", vipPrice: "169,90 €/saison", seasonalPrice: "Prix par saison", priceLabel: "Prix" },
  "ar-SA": { masterPrice: "89.90 € لكل موسم", vipPrice: "169.90 € لكل موسم", seasonalPrice: "السعر لكل موسم", priceLabel: "السعر" },
  "tr-TR": { masterPrice: "89,90 €/sezon", vipPrice: "169,90 €/sezon", seasonalPrice: "Sezon başına fiyat", priceLabel: "Fiyat" },
  "de-DE": { masterPrice: "89,90 €/Saison", vipPrice: "169,90 €/Saison", seasonalPrice: "Preis pro Saison", priceLabel: "Preis" },
};
export function getClubOwnerPlanShowcaseCopy(locale: string, draftLocalesEnabled = false) {
  const code = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { ...CLUB_OWNER_PLAN_SHOWCASE_COPY[code], ...CLUB_OWNER_PLAN_EXPERIENCE_COPY[code], betaBenefit: BETA_MARKET_BENEFIT[code], betaPrice: BETA_PRICE[code], ...SEASON_PRICE_COPY[code] };
}

const BENEFIT_LABELS = {
  "en-GB": ["Players in your squad", "Per real club · maximum", "Send an Exchange proposal", "Accept an exchange", "Return to TouchLine", "100M TC top-up", "Fair Play · per season", "No fee + half the sender's fee in TC"],
  "pt-BR": ["Jogadores no elenco", "Por clube real · máximo", "Enviar proposta no Exchange", "Aceitar uma troca", "Devolução à TouchLine", "Recarga de 100M TC", "Fair Play · por temporada", "Sem taxa + metade da taxa do proponente em TC"],
  "es-ES": ["Jugadores en la plantilla", "Por club real · máximo", "Enviar propuesta en Exchange", "Aceptar un intercambio", "Devolución a TouchLine", "Recarga de 100M TC", "Fair Play · por temporada", "Sin comisión + mitad de la comisión del proponente en TC"],
  "it-IT": ["Giocatori in rosa", "Per club reale · massimo", "Invia proposta Exchange", "Accetta uno scambio", "Restituzione a TouchLine", "Ricarica di 100M TC", "Fair Play · per stagione", "Nessuna commissione + metà della commissione del proponente in TC"],
  "fr-FR": ["Joueurs dans l’effectif", "Par club réel · maximum", "Envoyer une offre Exchange", "Accepter un échange", "Retour à TouchLine", "Recharge de 100M TC", "Fair Play · par saison", "Sans frais + moitié des frais du proposant en TC"],
  "ar-SA": ["لاعبو الفريق", "لكل نادٍ حقيقي · الحد الأقصى", "إرسال عرض تبادل", "قبول التبادل", "إعادة إلى TouchLine", "شحن 100M TC", "اللعب النظيف · لكل موسم", "دون رسوم + نصف رسوم مقدم العرض بعملة TC"],
  "tr-TR": ["Kadrodaki oyuncular", "Gerçek kulüp başına · en fazla", "Exchange teklifi gönder", "Takası kabul et", "TouchLine’a iade", "100M TC yükleme", "Fair Play · sezon başına", "Ücretsiz + teklif sahibinin ücretinin yarısı TC olarak"],
  "de-DE": ["Spieler im Kader", "Je realem Verein · maximal", "Exchange-Angebot senden", "Tausch annehmen", "Rückgabe an TouchLine", "100M TC aufladen", "Fair Play · pro Saison", "Gebührenfrei + Hälfte der Gebühr des Anbieters in TC"],
} as const;

const BENEFIT_TERMS: Readonly<Record<TouchLineLocale, string>> = {
  "en-GB": "Top-ups only at zero balance. Credits expire at season end. The bonus is credited only when the exchange completes.",
  "pt-BR": "Recargas só com saldo zerado. Créditos expiram no fim da temporada. O bônus entra apenas na troca concluída.",
  "es-ES": "Recargas solo con saldo cero. Los créditos caducan al final de la temporada. La bonificación se acredita al completar el intercambio.",
  "it-IT": "Ricariche solo con saldo zero. I crediti scadono a fine stagione. Il bonus viene accreditato solo a scambio concluso.",
  "fr-FR": "Recharges uniquement à solde nul. Les crédits expirent en fin de saison. Le bonus est crédité après l’échange.",
  "ar-SA": "الشحن فقط عند نفاد الرصيد. تنتهي صلاحية الرصيد بنهاية الموسم. تُضاف المكافأة عند اكتمال التبادل فقط.",
  "tr-TR": "Yükleme yalnızca bakiye sıfırken yapılır. Krediler sezon sonunda sona erer. Bonus takas tamamlanınca eklenir.",
  "de-DE": "Aufladen nur bei Guthaben null. Credits verfallen am Saisonende. Der Bonus wird erst nach abgeschlossenem Tausch gutgeschrieben.",
};
export function getClubOwnerPlanBenefitTerms(locale: string, draftLocalesEnabled = false) {
  return BENEFIT_TERMS[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

const PLAN_DISCLOSURE = {
  "en-GB": { viewBenefits: "View benefits", squad: "35 players + 1 coach. Players and coach share the same credit balance.", status: "Exchange and release: planned rules, not available yet. Release: 10% of the original purchase price; 90% returned. Exploring a plan does not activate it or credit your balance." },
  "pt-BR": { viewBenefits: "Ver benefícios", squad: "35 jogadores + 1 treinador. Jogadores e treinador usam o mesmo saldo de créditos.", status: "Exchange e rescisão: regras previstas, ainda indisponíveis. Rescisão: multa de 10% do valor original pago; retorno de 90%. Explorar um plano não o ativa nem credita seu saldo." },
  "es-ES": { viewBenefits: "Ver ventajas", squad: "35 jugadores + 1 entrenador. Jugadores y entrenador comparten el saldo de créditos.", status: "Exchange y rescisión: reglas previstas, aún no disponibles. Rescisión: 10% del precio original; devolución del 90%. Explorar un plan no lo activa ni añade saldo." },
  "it-IT": { viewBenefits: "Vedi vantaggi", squad: "35 giocatori + 1 allenatore. Giocatori e allenatore condividono lo stesso saldo.", status: "Exchange e rescissione: regole previste, non ancora disponibili. Rescissione: 10% del prezzo originale; rimborso del 90%. Esplorare un piano non lo attiva né accredita il saldo." },
  "fr-FR": { viewBenefits: "Voir les avantages", squad: "35 joueurs + 1 entraîneur. Joueurs et entraîneur partagent le même solde.", status: "Exchange et résiliation : règles prévues, pas encore disponibles. Résiliation : 10 % du prix initial ; remboursement de 90 %. Consulter une offre ne l’active pas et ne crédite pas le solde." },
  "ar-SA": { viewBenefits: "عرض المزايا", squad: "35 لاعبًا + مدرب واحد. يتشارك اللاعبون والمدرب رصيد الاعتمادات نفسه.", status: "التبادل والفسخ: قواعد مخططة وغير متاحة بعد. الفسخ: خصم 10٪ من سعر الشراء الأصلي وإعادة 90٪. استعراض الخطة لا يفعّلها ولا يضيف رصيدًا." },
  "tr-TR": { viewBenefits: "Avantajları gör", squad: "35 oyuncu + 1 teknik direktör. Oyuncular ve teknik direktör aynı kredi bakiyesini kullanır.", status: "Exchange ve fesih: planlanan kurallar, henüz kullanılamıyor. Fesih: ilk alış fiyatının %10’u kesilir, %90’ı iade edilir. Planı incelemek etkinleştirmez veya bakiye eklemez." },
  "de-DE": { viewBenefits: "Vorteile ansehen", squad: "35 Spieler + 1 Trainer. Spieler und Trainer nutzen dasselbe Guthaben.", status: "Exchange und Vertragsauflösung: geplante Regeln, noch nicht verfügbar. Auflösung: 10 % des ursprünglichen Kaufpreises; 90 % zurück. Ein Plan wird durch Ansehen weder aktiviert noch gutgeschrieben." },
} as const;

export function getClubOwnerPlanDisclosure(locale: string, draftLocalesEnabled = false) {
  const code = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { ...PLAN_DISCLOSURE[code], betaSquad: BETA_SQUAD_DISCLOSURE[code] };
}

const BETA_SQUAD_DISCLOSURE: Readonly<Record<TouchLineLocale, string>> = {
  "en-GB": "Planned Beta squad: 35 players + 1 coach sharing one credit balance. This collection is not available for Beta yet.",
  "pt-BR": "Elenco Beta previsto: 35 jogadores + 1 treinador no mesmo saldo de créditos. Esta coleção ainda não está disponível para Beta.",
  "es-ES": "Plantilla Beta prevista: 35 jugadores + 1 entrenador con un saldo compartido. Esta colección aún no está disponible para Beta.",
  "it-IT": "Rosa Beta prevista: 35 giocatori + 1 allenatore con saldo condiviso. Questa collezione non è ancora disponibile per Beta.",
  "fr-FR": "Effectif Beta prévu : 35 joueurs + 1 entraîneur avec un solde commun. Cette collection n’est pas encore disponible pour Beta.",
  "ar-SA": "تشكيلة Beta المخططة: 35 لاعبًا ومدرب واحد برصيد مشترك. هذه المجموعة غير متاحة لخطة Beta بعد.",
  "tr-TR": "Planlanan Beta kadrosu: ortak bakiyeyle 35 oyuncu + 1 teknik direktör. Bu koleksiyon henüz Beta için kullanılamıyor.",
  "de-DE": "Geplanter Beta-Kader: 35 Spieler + 1 Trainer mit gemeinsamem Guthaben. Diese Sammlung ist für Beta noch nicht verfügbar.",
};

/** Presentation of approved rules only: never activates a plan or a payment. */
export function getClubOwnerPlanBenefits(plan: typeof CLUB_OWNER_PLAN_PREVIEWS[number]["id"], locale: string, draftLocalesEnabled = false) {
  if (plan === "beta") return [];
  const labels = BENEFIT_LABELS[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  const rules = CLUB_PLANS[plan];
  return [
    { label: labels[0], value: String(CLUB_ROSTER_CAPACITY.total) },
    { label: labels[1], value: CLUB_OWNER_PLAN_SHOWCASE_COPY[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)].unlimited },
    { label: labels[2], value: `${rules.exchange}%` },
    { label: labels[3], value: labels[7] },
    { label: labels[4], value: `${rules.market}%` },
    { label: labels[5], value: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(rules.topUpCents / 100) },
    { label: labels[6], value: `${CLUB_SEASON_TOP_UP_LIMIT / 1_000_000}M TC` },
  ];
}
