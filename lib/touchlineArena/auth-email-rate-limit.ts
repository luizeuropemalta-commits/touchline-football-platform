/** Only provider rate-limit errors qualify; never infer a deadline from a generic failure. */
export function authEmailRateLimit(error: unknown): { seconds: number | null } | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; status?: unknown; message?: unknown };
  if (value.code !== "over_email_send_rate_limit" && value.code !== "over_request_rate_limit" && value.status !== 429) return null;
  const match = typeof value.message === "string" ? /only request this after (\d+) seconds?\b/i.exec(value.message) : null;
  const seconds = match ? Number(match[1]) : NaN;
  return { seconds: Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : null };
}

export function authEmailWaitMessage(locale: string, seconds: number | null) {
  const translations: Record<string, { later: string; wait: (seconds: number) => string }> = {
    "es-ES": { later: "Se ha alcanzado el límite temporal de envío. Inténtalo de nuevo más tarde.", wait: n => `Espera ${n} segundos antes de solicitar otro enlace.` },
    "it-IT": { later: "È stato raggiunto il limite temporaneo di invio. Riprova più tardi.", wait: n => `Attendi ${n} secondi prima di richiedere un altro link.` },
    "fr-FR": { later: "La limite temporaire d’envoi a été atteinte. Réessayez plus tard.", wait: n => `Patientez ${n} secondes avant de demander un autre lien.` },
    "ar-SA": { later: "تم بلوغ الحد المؤقت للإرسال. يرجى المحاولة لاحقًا.", wait: n => `يرجى الانتظار ${n} ثانية قبل طلب رابط آخر.` },
    "tr-TR": { later: "Geçici gönderim sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", wait: n => `Başka bir bağlantı istemeden önce ${n} saniye bekleyin.` },
    "de-DE": { later: "Das vorübergehende Versandlimit wurde erreicht. Bitte versuche es später erneut.", wait: n => `Warte ${n} Sekunden, bevor du einen weiteren Link anforderst.` },
  };
  const translated = Object.hasOwn(translations, locale) ? translations[locale] : null;
  if (translated) return seconds === null ? translated.later : translated.wait(seconds);
  if (locale === "pt-BR") return seconds === null
    ? "O limite temporário de envio foi atingido. Tente novamente mais tarde."
    : `Aguarde ${seconds} segundos antes de solicitar outro link.`;
  return seconds === null
    ? "The temporary email sending limit has been reached. Please try again later."
    : `Wait ${seconds} seconds before requesting another link.`;
}
