import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";
import type { TouchLineLocale } from "./i18n.ts";

/** Product proposal only. Never use these values as wallet balances or entitlements. */
export const CLUB_OWNER_PLAN_PREVIEWS = [
  { id: "standard", amount: "500M", budget: 500_000_000 },
  { id: "pro", amount: "1B", budget: 1_000_000_000 },
  { id: "master", amount: "2B", budget: 2_000_000_000 },
  { id: "vip", amount: null, budget: null },
] as const;
export type ClubOwnerPlanPreview = typeof CLUB_OWNER_PLAN_PREVIEWS[number]["id"];

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
const experienceEn = { membership: "Membership", fantasyFootball: "Fantasy football", comparePlans: "Compare plans", annualPrice: "Annual price", details: "Plan details", close: "Close", previewShort: "Plan preview", plan: "Plan", viewPlan: "View plan", selected: "Selected" };
export const CLUB_OWNER_PLAN_EXPERIENCE_COPY: Readonly<Record<TouchLineLocale, Readonly<Record<keyof typeof experienceEn, string>>>> = {
  "en-GB": experienceEn,
  "pt-BR": { membership: "Assinatura", fantasyFootball: "Futebol fantasy", comparePlans: "Comparar planos", annualPrice: "Preço anual", details: "Detalhes do plano", close: "Fechar", previewShort: "Prévia do plano", plan: "Plano", viewPlan: "Ver plano", selected: "Selecionado" },
  "es-ES": { membership: "Suscripción", fantasyFootball: "Fútbol fantasy", comparePlans: "Comparar planes", annualPrice: "Precio anual", details: "Detalles del plan", close: "Cerrar", previewShort: "Vista previa del plan", plan: "Plan", viewPlan: "Ver plan", selected: "Seleccionado" },
  "it-IT": { membership: "Abbonamento", fantasyFootball: "Fantacalcio", comparePlans: "Confronta i piani", annualPrice: "Prezzo annuale", details: "Dettagli del piano", close: "Chiudi", previewShort: "Anteprima del piano", plan: "Piano", viewPlan: "Vedi piano", selected: "Selezionato" },
  "fr-FR": { membership: "Abonnement", fantasyFootball: "Football fantasy", comparePlans: "Comparer les offres", annualPrice: "Prix annuel", details: "Détails de l’offre", close: "Fermer", previewShort: "Aperçu de l’offre", plan: "Offre", viewPlan: "Voir l’offre", selected: "Sélectionnée" },
  "ar-SA": { membership: "العضوية", fantasyFootball: "فانتازي كرة القدم", comparePlans: "قارن الخطط", annualPrice: "السعر السنوي", details: "تفاصيل الخطة", close: "إغلاق", previewShort: "معاينة الخطة", plan: "الخطة", viewPlan: "عرض الخطة", selected: "محددة" },
  "tr-TR": { membership: "Üyelik", fantasyFootball: "Fantezi futbol", comparePlans: "Planları karşılaştır", annualPrice: "Yıllık fiyat", details: "Plan ayrıntıları", close: "Kapat", previewShort: "Plan önizlemesi", plan: "Plan", viewPlan: "Planı gör", selected: "Seçili" },
  "de-DE": { membership: "Mitgliedschaft", fantasyFootball: "Fantasy-Fußball", comparePlans: "Pläne vergleichen", annualPrice: "Jahrespreis", details: "Plandetails", close: "Schließen", previewShort: "Planvorschau", plan: "Plan", viewPlan: "Plan ansehen", selected: "Ausgewählt" },
};
export function getClubOwnerPlanShowcaseCopy(locale: string, draftLocalesEnabled = false) {
  const code = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  return { ...CLUB_OWNER_PLAN_SHOWCASE_COPY[code], ...CLUB_OWNER_PLAN_EXPERIENCE_COPY[code] };
}
