import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export const TOUCHLINE_CLUB_OWNER_AVATAR_UI_DRAFT_STATUS = "draft" as const;
export const TOUCHLINE_CLUB_OWNER_AVATAR_UI_DRAFT_LOCALES = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
export const TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES = {
  "en-GB": {
    open: "Review profile photo recovery", title: "Profile photo recovery", noUpload: "Photo uploads remain unavailable. Your current photo will not change here.",
    observe: "Check recovery status", observing: "Checking recovery status…", fencing: "Requesting recovery…",
    unobserved: "Check the current account status before requesting recovery.", observed: "Status checked. Recovery requires a separate confirmation below.",
    unknown: "Outcome unconfirmed. Nothing will be retried automatically.", refreshRequired: "Account refresh requested. No photo was uploaded; new photo selection remains unavailable.",
    blocked: "Session not confirmed. Recovery is unavailable.", prepareFence: "Review recovery request",
    confirmTitle: "Confirm recovery", confirmBody: "This may stop an unfinished photo operation. It does not upload or replace your photo.",
    confirmFence: "Confirm recovery request", retry: "Retry the same recovery request", close: "Back", off: "Photo recovery is unavailable.",
  },
  "pt-BR": {
    open: "Ver recuperação da foto do perfil", title: "Recuperação da foto do perfil", noUpload: "O envio de fotos continua indisponível. Sua foto atual não será alterada aqui.",
    observe: "Consultar estado da recuperação", observing: "Consultando estado da recuperação…", fencing: "Solicitando recuperação…",
    unobserved: "Consulte o estado atual da conta antes de solicitar a recuperação.", observed: "Estado consultado. A recuperação exige uma confirmação separada abaixo.",
    unknown: "Resultado não confirmado. Nenhuma tentativa será repetida automaticamente.", refreshRequired: "Atualização da conta solicitada. Nenhuma foto foi enviada; a seleção de uma nova foto continua indisponível.",
    blocked: "Sessão não confirmada. A recuperação está indisponível.", prepareFence: "Revisar pedido de recuperação",
    confirmTitle: "Confirmar recuperação", confirmBody: "Isso pode interromper uma operação de foto não concluída. Não envia nem substitui sua foto.",
    confirmFence: "Confirmar pedido de recuperação", retry: "Repetir o mesmo pedido de recuperação", close: "Voltar", off: "A recuperação de foto está indisponível.",
  },
  "es-ES": {
    open: "Ver recuperación de la foto de perfil", title: "Recuperación de la foto de perfil", noUpload: "La subida de fotos sigue desactivada. Tu foto actual no cambiará aquí.",
    observe: "Consultar estado de recuperación", observing: "Consultando estado de recuperación…", fencing: "Solicitando recuperación…",
    unobserved: "Consulta el estado actual de la cuenta antes de solicitar la recuperación.", observed: "Estado consultado. La recuperación requiere una confirmación aparte abajo.",
    unknown: "Resultado sin confirmar. No se repetirá ninguna solicitud automáticamente.", refreshRequired: "Se ha solicitado actualizar la cuenta. No se ha subido ninguna foto; elegir una nueva foto sigue desactivado.",
    blocked: "Sesión no confirmada. La recuperación no está disponible.", prepareFence: "Revisar solicitud de recuperación",
    confirmTitle: "Confirmar recuperación", confirmBody: "Esto puede detener una operación de foto pendiente. No sube ni sustituye tu foto.",
    confirmFence: "Confirmar solicitud de recuperación", retry: "Repetir la misma solicitud de recuperación", close: "Volver", off: "La recuperación de fotos no está disponible.",
  },
  "it-IT": {
    open: "Controlla il recupero della foto del profilo", title: "Recupero della foto del profilo", noUpload: "Il caricamento delle foto resta disabilitato. La foto attuale non verrà modificata qui.",
    observe: "Controlla lo stato del recupero", observing: "Controllo dello stato del recupero…", fencing: "Richiesta di recupero…",
    unobserved: "Controlla lo stato attuale dell’account prima di richiedere il recupero.", observed: "Stato verificato. Il recupero richiede una conferma separata qui sotto.",
    unknown: "Esito non confermato. Nessuna richiesta verrà ripetuta automaticamente.", refreshRequired: "Aggiornamento dell’account richiesto. Nessuna foto è stata caricata; la selezione di una nuova foto resta disabilitata.",
    blocked: "Sessione non confermata. Il recupero non è disponibile.", prepareFence: "Esamina la richiesta di recupero",
    confirmTitle: "Conferma il recupero", confirmBody: "Questa azione può interrompere un’operazione sulla foto non completata. Non carica né sostituisce la tua foto.",
    confirmFence: "Conferma la richiesta di recupero", retry: "Ripeti la stessa richiesta di recupero", close: "Indietro", off: "Il recupero delle foto non è disponibile.",
  },
  "fr-FR": {
    open: "Consulter la récupération de la photo de profil", title: "Récupération de la photo de profil", noUpload: "L’envoi de photos reste indisponible. Votre photo actuelle ne sera pas modifiée ici.",
    observe: "Vérifier l’état de la récupération", observing: "Vérification de l’état de la récupération…", fencing: "Demande de récupération…",
    unobserved: "Vérifiez l’état actuel du compte avant de demander la récupération.", observed: "État vérifié. La récupération nécessite une confirmation distincte ci-dessous.",
    unknown: "Résultat non confirmé. Aucune demande ne sera répétée automatiquement.", refreshRequired: "Actualisation du compte demandée. Aucune photo n’a été envoyée ; la sélection d’une nouvelle photo reste indisponible.",
    blocked: "Session non confirmée. La récupération est indisponible.", prepareFence: "Examiner la demande de récupération",
    confirmTitle: "Confirmer la récupération", confirmBody: "Cette action peut arrêter une opération de photo inachevée. Elle n’envoie ni ne remplace votre photo.",
    confirmFence: "Confirmer la demande de récupération", retry: "Répéter la même demande de récupération", close: "Retour", off: "La récupération de photo est indisponible.",
  },
  "ar-SA": {
    open: "مراجعة استعادة صورة الملف الشخصي", title: "استعادة صورة الملف الشخصي", noUpload: "رفع الصور ما زال غير متاح. لن تتغير صورتك الحالية هنا.",
    observe: "التحقق من حالة الاستعادة", observing: "جارٍ التحقق من حالة الاستعادة…", fencing: "جارٍ طلب الاستعادة…",
    unobserved: "تحقق من حالة الحساب الحالية قبل طلب الاستعادة.", observed: "تم التحقق من الحالة. تتطلب الاستعادة تأكيدًا منفصلًا أدناه.",
    unknown: "النتيجة غير مؤكدة. لن يُعاد أي طلب تلقائيًا.", refreshRequired: "طُلب تحديث الحساب. لم تُرفع أي صورة؛ اختيار صورة جديدة ما زال غير متاح.",
    blocked: "لم تُؤكَّد الجلسة. الاستعادة غير متاحة.", prepareFence: "مراجعة طلب الاستعادة",
    confirmTitle: "تأكيد الاستعادة", confirmBody: "قد يوقف هذا عملية صورة غير مكتملة. لا يرفع صورتك ولا يستبدلها.",
    confirmFence: "تأكيد طلب الاستعادة", retry: "إعادة طلب الاستعادة نفسه", close: "رجوع", off: "استعادة الصورة غير متاحة.",
  },
  "tr-TR": {
    open: "Profil fotoğrafı kurtarmayı incele", title: "Profil fotoğrafı kurtarma", noUpload: "Fotoğraf yükleme henüz kullanılamıyor. Mevcut fotoğrafınız burada değişmeyecek.",
    observe: "Kurtarma durumunu kontrol et", observing: "Kurtarma durumu kontrol ediliyor…", fencing: "Kurtarma isteniyor…",
    unobserved: "Kurtarma istemeden önce hesabın güncel durumunu kontrol edin.", observed: "Durum kontrol edildi. Kurtarma için aşağıda ayrı bir onay gerekir.",
    unknown: "Sonuç doğrulanmadı. Hiçbir istek otomatik olarak tekrarlanmayacak.", refreshRequired: "Hesap yenilemesi istendi. Fotoğraf yüklenmedi; yeni fotoğraf seçimi hâlâ kullanılamıyor.",
    blocked: "Oturum doğrulanmadı. Kurtarma kullanılamıyor.", prepareFence: "Kurtarma isteğini incele",
    confirmTitle: "Kurtarmayı onayla", confirmBody: "Bu işlem tamamlanmamış bir fotoğraf işlemini durdurabilir. Fotoğrafınızı yüklemez veya değiştirmez.",
    confirmFence: "Kurtarma isteğini onayla", retry: "Aynı kurtarma isteğini yeniden dene", close: "Geri", off: "Fotoğraf kurtarma kullanılamıyor.",
  },
  "de-DE": {
    open: "Wiederherstellung des Profilfotos prüfen", title: "Wiederherstellung des Profilfotos", noUpload: "Das Hochladen von Fotos bleibt deaktiviert. Ihr aktuelles Foto wird hier nicht geändert.",
    observe: "Wiederherstellungsstatus prüfen", observing: "Wiederherstellungsstatus wird geprüft…", fencing: "Wiederherstellung wird angefordert…",
    unobserved: "Prüfen Sie den aktuellen Kontostatus, bevor Sie die Wiederherstellung anfordern.", observed: "Status geprüft. Die Wiederherstellung erfordert unten eine separate Bestätigung.",
    unknown: "Ergebnis unbestätigt. Keine Anfrage wird automatisch wiederholt.", refreshRequired: "Kontoaktualisierung angefordert. Es wurde kein Foto hochgeladen; die Auswahl eines neuen Fotos bleibt deaktiviert.",
    blocked: "Sitzung nicht bestätigt. Die Wiederherstellung ist nicht verfügbar.", prepareFence: "Wiederherstellungsanfrage prüfen",
    confirmTitle: "Wiederherstellung bestätigen", confirmBody: "Dies kann einen unvollständigen Fotovorgang stoppen. Ihr Foto wird weder hochgeladen noch ersetzt.",
    confirmFence: "Wiederherstellungsanfrage bestätigen", retry: "Dieselbe Wiederherstellungsanfrage wiederholen", close: "Zurück", off: "Die Fotowiederherstellung ist nicht verfügbar.",
  },
} as const;

export function getTouchlineClubOwnerAvatarUiCopy(locale?: string | null, draftLocalesEnabled = false) {
  return TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

const selectionCopy = {
  "en-GB": ["Choose a photo", "Photo preview", "Confirm photo upload", "Cancel selection", "Use a JPEG, PNG or WebP image up to 4 MB. The current photo stays until confirmation from the server.", "HEIC/HEIF is not supported. Export the photo as JPEG, PNG or WebP.", "Upload outcome requires recovery or a fresh account status. Do not choose another photo yet.", "Uploading…", "Selection expired. Refresh the page before choosing a photo."],
  "pt-BR": ["Escolher foto", "Prévia da foto", "Confirmar envio da foto", "Cancelar seleção", "Use JPEG, PNG ou WebP de até 4 MB. A foto atual permanece até a confirmação do servidor.", "HEIC/HEIF não é compatível. Exporte a foto em JPEG, PNG ou WebP.", "O resultado do envio exige recuperação ou atualização do estado da conta. Não escolha outra foto ainda.", "Enviando…", "Seleção expirada. Atualize a página antes de escolher uma foto."],
  "es-ES": ["Elegir foto", "Vista previa de la foto", "Confirmar envío de la foto", "Cancelar selección", "Usa JPEG, PNG o WebP de hasta 4 MB. La foto actual se mantiene hasta la confirmación del servidor.", "HEIC/HEIF no es compatible. Exporta la foto como JPEG, PNG o WebP.", "El resultado del envío requiere recuperación o actualizar el estado de la cuenta. No elijas otra foto todavía.", "Enviando…", "La selección ha caducado. Actualiza la página antes de elegir una foto."],
  "fr-FR": ["Choisir une photo", "Aperçu de la photo", "Confirmer l’envoi de la photo", "Annuler la sélection", "Utilisez une image JPEG, PNG ou WebP de 4 Mo maximum. La photo actuelle reste en place jusqu’à la confirmation du serveur.", "HEIC/HEIF n’est pas pris en charge. Exportez la photo en JPEG, PNG ou WebP.", "Le résultat de l’envoi nécessite une récupération ou une actualisation du compte. Ne choisissez pas encore une autre photo.", "Envoi…", "La sélection a expiré. Actualisez la page avant de choisir une photo."],
  "it-IT": ["Scegli una foto", "Anteprima della foto", "Conferma l’invio della foto", "Annulla selezione", "Usa JPEG, PNG o WebP fino a 4 MB. La foto attuale rimane fino alla conferma del server.", "HEIC/HEIF non è supportato. Esporta la foto in JPEG, PNG o WebP.", "L’esito dell’invio richiede il recupero o l’aggiornamento dello stato dell’account. Non scegliere ancora un’altra foto.", "Invio…", "Selezione scaduta. Aggiorna la pagina prima di scegliere una foto."],
  "de-DE": ["Foto auswählen", "Fotovorschau", "Foto-Upload bestätigen", "Auswahl abbrechen", "Verwenden Sie JPEG, PNG oder WebP bis 4 MB. Das aktuelle Foto bleibt bis zur Serverbestätigung erhalten.", "HEIC/HEIF wird nicht unterstützt. Exportieren Sie das Foto als JPEG, PNG oder WebP.", "Das Upload-Ergebnis erfordert eine Wiederherstellung oder einen aktuellen Kontostatus. Wählen Sie noch kein weiteres Foto.", "Wird hochgeladen…", "Auswahl abgelaufen. Aktualisieren Sie die Seite vor der Fotoauswahl."],
  "tr-TR": ["Fotoğraf seç", "Fotoğraf önizlemesi", "Fotoğraf yüklemeyi onayla", "Seçimi iptal et", "En fazla 4 MB boyutunda JPEG, PNG veya WebP kullanın. Sunucu onayına kadar mevcut fotoğraf korunur.", "HEIC/HEIF desteklenmiyor. Fotoğrafı JPEG, PNG veya WebP olarak dışa aktarın.", "Yükleme sonucu için kurtarma veya güncel hesap durumu gerekiyor. Henüz başka bir fotoğraf seçmeyin.", "Yükleniyor…", "Seçimin süresi doldu. Fotoğraf seçmeden önce sayfayı yenileyin."],
  "ar-SA": ["اختيار صورة", "معاينة الصورة", "تأكيد رفع الصورة", "إلغاء الاختيار", "استخدم صورة JPEG أو PNG أو WebP بحجم لا يتجاوز 4 MB. تبقى الصورة الحالية حتى تأكيد الخادم.", "صيغة HEIC/HEIF غير مدعومة. صدّر الصورة بصيغة JPEG أو PNG أو WebP.", "تتطلب نتيجة الرفع استرداد العملية أو تحديث حالة الحساب. لا تختر صورة أخرى بعد.", "جارٍ الرفع…", "انتهت صلاحية الاختيار. حدّث الصفحة قبل اختيار صورة."],
} as const;
export function getTouchlineClubOwnerAvatarSelectionCopy(locale?: string | null, draftLocalesEnabled = false) {
  const [choose, preview, confirm, cancel, guidance, heic, recovery, sending, expired] = selectionCopy[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  return { choose, preview, confirm, cancel, guidance, heic, recovery, sending, expired };
}
