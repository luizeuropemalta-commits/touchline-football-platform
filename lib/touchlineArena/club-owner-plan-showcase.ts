import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import type { TouchLineLocale } from "./i18n.ts";
import { TOUCHLINE_FANTASY_PLAN_BUDGETS as planBudgets } from "../touchlineFantasy/market-plan-policy.ts";

/** Product proposal only. Never use these values as wallet balances or entitlements. */
export const CLUB_OWNER_PLAN_PREVIEWS = [
  { id: "beta", amount: "50M", budget: planBudgets.beta },
  { id: "standard", amount: "400M", budget: planBudgets.standard },
  { id: "pro", amount: "650M", budget: planBudgets.pro },
  { id: "master", amount: "850M", budget: planBudgets.master },
  { id: "vip", amount: "1B", budget: planBudgets.vip },
] as const;
export type ClubOwnerPlanPreview = typeof CLUB_OWNER_PLAN_PREVIEWS[number]["id"];

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
const MASTER_PRICE_COPY: Readonly<Record<TouchLineLocale, Readonly<{ masterPrice: string; seasonalPrice: string; priceLabel: string }>>> = {
  "en-GB": { masterPrice: "€169.90/season", seasonalPrice: "Price per season", priceLabel: "Price" },
  "pt-BR": { masterPrice: "€169,90/temporada", seasonalPrice: "Preço por temporada", priceLabel: "Preço" },
  "es-ES": { masterPrice: "169,90 €/temporada", seasonalPrice: "Precio por temporada", priceLabel: "Precio" },
  "it-IT": { masterPrice: "169,90 €/stagione", seasonalPrice: "Prezzo per stagione", priceLabel: "Prezzo" },
  "fr-FR": { masterPrice: "169,90 €/saison", seasonalPrice: "Prix par saison", priceLabel: "Prix" },
  "ar-SA": { masterPrice: "169.90 € لكل موسم", seasonalPrice: "السعر لكل موسم", priceLabel: "السعر" },
  "tr-TR": { masterPrice: "169,90 €/sezon", seasonalPrice: "Sezon başına fiyat", priceLabel: "Fiyat" },
  "de-DE": { masterPrice: "169,90 €/Saison", seasonalPrice: "Preis pro Saison", priceLabel: "Preis" },
};
export function getClubOwnerPlanShowcaseCopy(locale: string, draftLocalesEnabled = false) {
  const code = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { ...CLUB_OWNER_PLAN_SHOWCASE_COPY[code], ...CLUB_OWNER_PLAN_EXPERIENCE_COPY[code], betaBenefit: BETA_MARKET_BENEFIT[code], betaPrice: BETA_PRICE[code], ...MASTER_PRICE_COPY[code] };
}
