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
const preparationCopy = {
  "en-GB": { guidance: "JPEG, PNG or WebP up to 20 MB and 50 megapixels. Your photo is reduced automatically, preserving its proportions and orientation. Review before sending.", preparing: "Preparing your photo…", invalid: "This image could not be read. Choose another JPEG, PNG or WebP photo.", tooLarge: "Choose a photo up to 20 MB.", pixels: "This photo’s dimensions are too large. Choose one up to 50 megapixels, with neither side exceeding 16,384 pixels.", animated: "Choose a still photo. Animated images are not supported.", unavailable: "The photo could not be prepared in this browser. Try a smaller JPEG or PNG photo." },
  "pt-BR": { guidance: "JPEG, PNG ou WebP de até 20 MB e 50 megapixels. A foto é reduzida automaticamente, preservando proporção e orientação. Confira antes de enviar.", preparing: "Preparando sua foto…", invalid: "Não foi possível ler esta imagem. Escolha outra foto JPEG, PNG ou WebP.", tooLarge: "Escolha uma foto de até 20 MB.", pixels: "As dimensões desta foto são muito grandes. Escolha uma de até 50 megapixels, sem nenhum lado acima de 16.384 pixels.", animated: "Escolha uma foto estática. Imagens animadas não são aceitas.", unavailable: "Não foi possível preparar a foto neste navegador. Tente uma foto JPEG ou PNG menor." },
  "es-ES": { guidance: "JPEG, PNG o WebP de hasta 20 MB y 50 megapíxeles. La foto se reduce automáticamente, conservando sus proporciones y orientación. Revísala antes de enviarla.", preparing: "Preparando tu foto…", invalid: "No se pudo leer esta imagen. Elige otra foto JPEG, PNG o WebP.", tooLarge: "Elige una foto de hasta 20 MB.", pixels: "Las dimensiones son demasiado grandes. Elige una foto de hasta 50 megapíxeles, sin lados superiores a 16.384 píxeles.", animated: "Elige una foto fija. No se admiten imágenes animadas.", unavailable: "No se pudo preparar la foto en este navegador. Prueba con una foto JPEG o PNG más pequeña." },
  "it-IT": { guidance: "JPEG, PNG o WebP fino a 20 MB e 50 megapixel. La foto viene ridotta automaticamente, preservando proporzioni e orientamento. Controllala prima dell’invio.", preparing: "Preparazione della foto…", invalid: "Impossibile leggere questa immagine. Scegli un’altra foto JPEG, PNG o WebP.", tooLarge: "Scegli una foto fino a 20 MB.", pixels: "Le dimensioni sono troppo grandi. Scegli una foto fino a 50 megapixel, con nessun lato superiore a 16.384 pixel.", animated: "Scegli una foto statica. Le immagini animate non sono supportate.", unavailable: "Impossibile preparare la foto in questo browser. Prova una foto JPEG o PNG più piccola." },
  "fr-FR": { guidance: "JPEG, PNG ou WebP jusqu’à 20 Mo et 50 mégapixels. La photo est réduite automatiquement, en conservant ses proportions et son orientation. Vérifiez-la avant l’envoi.", preparing: "Préparation de votre photo…", invalid: "Impossible de lire cette image. Choisissez une autre photo JPEG, PNG ou WebP.", tooLarge: "Choisissez une photo de 20 Mo maximum.", pixels: "Les dimensions sont trop grandes. Choisissez une photo de 50 mégapixels maximum, dont aucun côté ne dépasse 16 384 pixels.", animated: "Choisissez une photo fixe. Les images animées ne sont pas prises en charge.", unavailable: "Impossible de préparer la photo dans ce navigateur. Essayez une photo JPEG ou PNG plus petite." },
  "de-DE": { guidance: "JPEG, PNG oder WebP bis 20 MB und 50 Megapixel. Das Foto wird automatisch verkleinert; Proportionen und Ausrichtung bleiben erhalten. Prüfen Sie es vor dem Senden.", preparing: "Foto wird vorbereitet…", invalid: "Dieses Bild konnte nicht gelesen werden. Wählen Sie ein anderes JPEG-, PNG- oder WebP-Foto.", tooLarge: "Wählen Sie ein Foto bis 20 MB.", pixels: "Das Foto ist zu groß. Wählen Sie bis zu 50 Megapixel und höchstens 16.384 Pixel pro Seite.", animated: "Wählen Sie ein Standbild. Animierte Bilder werden nicht unterstützt.", unavailable: "Das Foto konnte in diesem Browser nicht vorbereitet werden. Versuchen Sie ein kleineres JPEG- oder PNG-Foto." },
  "tr-TR": { guidance: "En fazla 20 MB ve 50 megapiksel JPEG, PNG veya WebP. Fotoğraf, oranları ve yönü korunarak otomatik küçültülür. Göndermeden önce kontrol edin.", preparing: "Fotoğrafınız hazırlanıyor…", invalid: "Bu görsel okunamadı. Başka bir JPEG, PNG veya WebP fotoğraf seçin.", tooLarge: "En fazla 20 MB bir fotoğraf seçin.", pixels: "Fotoğrafın boyutları çok büyük. En fazla 50 megapiksel ve her kenarı en fazla 16.384 piksel olan bir fotoğraf seçin.", animated: "Sabit bir fotoğraf seçin. Hareketli görseller desteklenmez.", unavailable: "Fotoğraf bu tarayıcıda hazırlanamadı. Daha küçük bir JPEG veya PNG fotoğraf deneyin." },
  "ar-SA": { guidance: "صورة JPEG أو PNG أو WebP بحد أقصى 20 MB و50 ميغابكسل. يُصغَّر حجم الصورة تلقائيًا مع الحفاظ على تناسبها واتجاهها. راجعها قبل الإرسال.", preparing: "جارٍ تجهيز صورتك…", invalid: "تعذرت قراءة هذه الصورة. اختر صورة JPEG أو PNG أو WebP أخرى.", tooLarge: "اختر صورة لا تتجاوز 20 MB.", pixels: "أبعاد الصورة كبيرة جدًا. اختر صورة لا تتجاوز 50 ميغابكسل ولا يتجاوز أي ضلع فيها 16,384 بكسل.", animated: "اختر صورة ثابتة. الصور المتحركة غير مدعومة.", unavailable: "تعذر تجهيز الصورة في هذا المتصفح. جرّب صورة JPEG أو PNG أصغر." },
} as const;

export function getTouchlineClubOwnerAvatarUiCopy(locale?: string | null, draftLocalesEnabled = false) {
  return TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

const selectionCopy = {
  "en-GB": ["Choose a photo", "Photo preview", "Confirm photo upload", "Cancel selection", "HEIC/HEIF is not supported. Export the photo as JPEG, PNG or WebP.", "Upload outcome requires recovery or a fresh account status. Do not choose another photo yet.", "Uploading…", "Selection expired. Refresh the page before choosing a photo."],
  "pt-BR": ["Escolher foto", "Prévia da foto", "Confirmar envio da foto", "Cancelar seleção", "HEIC/HEIF não é compatível. Exporte a foto em JPEG, PNG ou WebP.", "O resultado do envio exige recuperação ou atualização do estado da conta. Não escolha outra foto ainda.", "Enviando…", "Seleção expirada. Atualize a página antes de escolher uma foto."],
  "es-ES": ["Elegir foto", "Vista previa de la foto", "Confirmar envío de la foto", "Cancelar selección", "HEIC/HEIF no es compatible. Exporta la foto como JPEG, PNG o WebP.", "El resultado del envío requiere recuperación o actualizar el estado de la cuenta. No elijas otra foto todavía.", "Enviando…", "La selección ha caducado. Actualiza la página antes de elegir una foto."],
  "fr-FR": ["Choisir une photo", "Aperçu de la photo", "Confirmer l’envoi de la photo", "Annuler la sélection", "HEIC/HEIF n’est pas pris en charge. Exportez la photo en JPEG, PNG ou WebP.", "Le résultat de l’envoi nécessite une récupération ou une actualisation du compte. Ne choisissez pas encore une autre photo.", "Envoi…", "La sélection a expiré. Actualisez la page avant de choisir une photo."],
  "it-IT": ["Scegli una foto", "Anteprima della foto", "Conferma l’invio della foto", "Annulla selezione", "HEIC/HEIF non è supportato. Esporta la foto in JPEG, PNG o WebP.", "L’esito dell’invio richiede il recupero o l’aggiornamento dello stato dell’account. Non scegliere ancora un’altra foto.", "Invio…", "Selezione scaduta. Aggiorna la pagina prima di scegliere una foto."],
  "de-DE": ["Foto auswählen", "Fotovorschau", "Foto-Upload bestätigen", "Auswahl abbrechen", "HEIC/HEIF wird nicht unterstützt. Exportieren Sie das Foto als JPEG, PNG oder WebP.", "Das Upload-Ergebnis erfordert eine Wiederherstellung oder einen aktuellen Kontostatus. Wählen Sie noch kein weiteres Foto.", "Wird hochgeladen…", "Auswahl abgelaufen. Aktualisieren Sie die Seite vor der Fotoauswahl."],
  "tr-TR": ["Fotoğraf seç", "Fotoğraf önizlemesi", "Fotoğraf yüklemeyi onayla", "Seçimi iptal et", "HEIC/HEIF desteklenmiyor. Fotoğrafı JPEG, PNG veya WebP olarak dışa aktarın.", "Yükleme sonucu için kurtarma veya güncel hesap durumu gerekiyor. Henüz başka bir fotoğraf seçmeyin.", "Yükleniyor…", "Seçimin süresi doldu. Fotoğraf seçmeden önce sayfayı yenileyin."],
  "ar-SA": ["اختيار صورة", "معاينة الصورة", "تأكيد رفع الصورة", "إلغاء الاختيار", "صيغة HEIC/HEIF غير مدعومة. صدّر الصورة بصيغة JPEG أو PNG أو WebP.", "تتطلب نتيجة الرفع استرداد العملية أو تحديث حالة الحساب. لا تختر صورة أخرى بعد.", "جارٍ الرفع…", "انتهت صلاحية الاختيار. حدّث الصفحة قبل اختيار صورة."],
} as const;
const photoCopy = {
  "en-GB": ["Profile photo", "Your current photo changes only after the upload is confirmed.", "Photo prepared. Review it and confirm the upload."],
  "pt-BR": ["Foto do perfil", "Sua foto atual só muda após o envio confirmado.", "Foto preparada. Confira e confirme o envio."],
  "es-ES": ["Foto de perfil", "Tu foto actual solo cambia cuando se confirma el envío.", "Foto preparada. Revísala y confirma el envío."],
  "it-IT": ["Foto del profilo", "La foto attuale cambia solo dopo la conferma dell’invio.", "Foto pronta. Controllala e conferma l’invio."],
  "fr-FR": ["Photo de profil", "Votre photo actuelle ne change qu’après confirmation de l’envoi.", "Photo prête. Vérifiez-la et confirmez l’envoi."],
  "de-DE": ["Profilfoto", "Ihr aktuelles Foto ändert sich erst nach dem bestätigten Upload.", "Foto vorbereitet. Prüfen und bestätigen Sie den Upload."],
  "tr-TR": ["Profil fotoğrafı", "Mevcut fotoğrafınız yalnızca yükleme onaylandıktan sonra değişir.", "Fotoğraf hazır. Kontrol edip yüklemeyi onaylayın."],
  "ar-SA": ["صورة الملف الشخصي", "لا تتغير صورتك الحالية إلا بعد تأكيد الرفع.", "الصورة جاهزة. راجعها وأكّد الرفع."],
} as const;
export function getTouchlineClubOwnerAvatarSelectionCopy(locale?: string | null, draftLocalesEnabled = false) {
  const [choose, preview, confirm, cancel, heic, recovery, sending, expired] = selectionCopy[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  const [profileTitle, profileHint, prepared] = photoCopy[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
  return { choose, preview, confirm, cancel, heic, recovery, sending, expired, profileTitle, profileHint, prepared,
    ...preparationCopy[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)] };
}
