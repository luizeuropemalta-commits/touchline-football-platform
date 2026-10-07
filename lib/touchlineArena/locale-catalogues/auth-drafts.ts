import type { getTouchLineAuthCopy } from "../auth-i18n.ts";
import { TOUCHLINE_DRAFT_LOCALES, type TouchlineDraftLocale, type TouchlineDraftTranslations } from "./core-drafts.ts";

type AuthCatalogue = ReturnType<typeof getTouchLineAuthCopy>;
type TranslationRows<T> = T extends string ? TouchlineDraftTranslations
  : T extends readonly string[] ? readonly TouchlineDraftTranslations[]
    : { [Key in keyof T]: TranslationRows<T[Key]> };

/** Draft only. Same ES/IT/FR/AR/TR/DE column order as the core catalogue. */
export const TOUCHLINE_AUTH_DRAFT_STATE = "draft" as const;
const rows = {
  layout: {
    arenaHome: ["Inicio de TouchLine", "Home TouchLine", "Accueil TouchLine", "الرئيسية في TouchLine", "TouchLine ana sayfa", "TouchLine-Startseite"],
    arenaOnline: ["TouchLine en línea", "TouchLine online", "TouchLine en ligne", "TouchLine متصل", "TouchLine çevrimiçi", "TouchLine online"],
    productAreas: ["Tarjetas · Plantillas · Mercado", "Carte · Rose · Mercato", "Cartes · Effectifs · Marché", "البطاقات · القوائم · السوق", "Kartlar · Kadrolar · Pazar", "Karten · Kader · Markt"],
    journeyEyebrow: ["TouchLine / Tu camino empieza aquí", "TouchLine / Il tuo viaggio inizia qui", "TouchLine / Votre parcours commence ici", "TouchLine / رحلتك تبدأ هنا", "TouchLine / Yolculuğunuz burada başlıyor", "TouchLine / Deine Reise beginnt hier"],
    accessEyebrow: ["TouchLine / Acceso", "TouchLine / Accesso", "TouchLine / Accès", "TouchLine / الدخول", "TouchLine / Giriş", "TouchLine / Zugang"],
    cinematicTitleTop: ["Entra en", "Entra in", "Entrez dans", "ادخل إلى", "TouchLine’a", "Betritt"],
    cinematicTitleBottom: ["TouchLine", "TouchLine", "TouchLine", "TouchLine", "giriş yapın", "TouchLine"],
    standardTitleTop: ["TouchLine", "TouchLine", "TouchLine", "TouchLine", "TouchLine", "TouchLine"],
    standardTitleBottom: ["Acceso", "Accesso", "Accès", "الدخول", "Giriş", "Zugang"],
    cinematicDescription: ["Crea tu identidad ClubOwner, construye una plantilla con tu sello y salta al campo para competir por títulos en TouchLine.", "Crea la tua identità ClubOwner, costruisci una rosa con la tua firma e scendi in campo per conquistare i titoli TouchLine.", "Créez votre identité ClubOwner, composez un effectif à votre image et entrez sur le terrain pour disputer les titres TouchLine.", "أنشئ هويتك في ClubOwner وكوّن قائمة تحمل بصمتك وادخل الملعب للمنافسة على ألقاب TouchLine.", "ClubOwner kimliğinizi oluşturun, kendi imzanızı taşıyan bir kadro kurun ve TouchLine şampiyonlukları için sahaya çıkın.", "Erstelle deine ClubOwner-Identität, baue einen Kader mit deiner Handschrift auf und kämpfe auf dem Spielfeld um TouchLine-Titel."],
    standardDescription: ["Entra en TouchLine. Construye tu plantilla, gestiona contratos oficiales de jugadores, sigue las clasificaciones y prepárate para cada jornada.", "Entra in TouchLine. Costruisci la tua rosa, gestisci i contratti ufficiali dei giocatori, segui le classifiche e preparati per ogni giornata.", "Entrez dans TouchLine. Composez votre effectif, gérez les contrats officiels des joueurs, suivez les classements et préparez chaque journée.", "ادخل إلى TouchLine. كوّن قائمتك وأدر عقود اللاعبين الرسمية وتابع الترتيب واستعد لكل جولة.", "TouchLine’a girin. Kadronuzu kurun, resmî oyuncu sözleşmelerini yönetin, sıralamaları takip edin ve her maç haftasına hazırlanın.", "Betritt TouchLine. Baue deinen Kader auf, verwalte offizielle Spielerverträge, verfolge Ranglisten und bereite dich auf jeden Spieltag vor."],
    cardLabel: ["Tarjetas", "Carte", "Cartes", "البطاقات", "Kartlar", "Karten"],
    cardValue: ["Élite", "Élite", "Élite", "النخبة", "Elit", "Elite"],
    squadLabel: ["Plantilla", "Rosa", "Effectif", "القائمة", "Kadro", "Kader"],
    squadValue: ["XI", "XI", "XI", "XI", "XI", "XI"],
    arenaLabel: ["Mercado", "Mercato", "Marché", "السوق", "Pazar", "Markt"],
    arenaValue: ["JUEGO", "GIOCO", "JEU", "اللعبة", "OYUN", "SPIEL"],
    onboardingEyebrow: ["Registro de ClubOwner", "Registrazione ClubOwner", "Inscription ClubOwner", "التسجيل في ClubOwner", "ClubOwner kaydı", "ClubOwner-Registrierung"],
    accessPanelEyebrow: ["Acceso al juego", "Accesso al gioco", "Accès au jeu", "الدخول إلى اللعبة", "Oyuna giriş", "Spielzugang"],
    onboardingTitle: ["Crea tu identidad", "Crea la tua identità", "Créez votre identité", "أنشئ هويتك", "Kimliğinizi oluşturun", "Erstelle deine Identität"],
    accessPanelTitle: ["Entrar en TouchLine", "Entra in TouchLine", "Entrer dans TouchLine", "الدخول إلى TouchLine", "TouchLine’a gir", "TouchLine betreten"],
    rights: ["© 2026 TouchLine. Todos los derechos reservados.", "© 2026 TouchLine. Tutti i diritti riservati.", "© 2026 TouchLine. Tous droits réservés.", "© 2026 TouchLine. جميع الحقوق محفوظة.", "© 2026 TouchLine. Tüm hakları saklıdır.", "© 2026 TouchLine. Alle Rechte vorbehalten."],
    marketOnline: ["Mercado en línea", "Mercato online", "Marché en ligne", "السوق متصل", "Pazar çevrimiçi", "Markt online"],
    asideTitleTop: ["Abre tarjetas.", "Apri le carte.", "Ouvrez des cartes.", "افتح البطاقات.", "Kartları açın.", "Öffne Karten."],
    asideTitleBottom: ["Construye plantillas.", "Costruisci le rose.", "Composez des effectifs.", "كوّن القوائم.", "Kadrolar kurun.", "Baue Kader auf."],
    features: [
      ["Tarjetas premium de jugadores", "Carte premium dei giocatori", "Cartes premium de joueurs", "بطاقات لاعبين مميزة", "Premium oyuncu kartları", "Premium-Spielerkarten"],
      ["Gestión de plantilla y formación", "Gestione di rosa e modulo", "Gestion de l’effectif et du dispositif", "إدارة القائمة والخطة", "Kadro ve diziliş yönetimi", "Kader- und Formationsverwaltung"],
      ["ClubOwner y clasificaciones en directo", "ClubOwner e classifiche in diretta", "ClubOwner et classements en direct", "ClubOwner والترتيبات المباشرة", "ClubOwner ve canlı sıralamalar", "ClubOwner und Live-Ranglisten"],
    ],
  },
  login: {
    eyebrow: ["Acceso a TouchLine", "Accesso a TouchLine", "Accès à TouchLine", "الدخول إلى TouchLine", "TouchLine girişi", "TouchLine-Zugang"],
    title: ["Entra en TouchLine", "Entra in TouchLine", "Entrez dans TouchLine", "ادخل إلى TouchLine", "TouchLine’a girin", "Betritt TouchLine"],
    description: ["Inicia sesión para construir tu plantilla y entrar en TouchLine.", "Accedi per costruire la tua rosa ed entrare in TouchLine.", "Connectez-vous pour composer votre effectif et entrer dans TouchLine.", "سجّل الدخول لتكوين قائمتك والدخول إلى TouchLine.", "Kadronuzu kurmak ve TouchLine’a girmek için oturum açın.", "Melde dich an, um deinen Kader aufzubauen und TouchLine zu betreten."],
  },
  register: {
    back: ["Volver al acceso", "Torna all’accesso", "Retour à la connexion", "العودة إلى تسجيل الدخول", "Girişe dön", "Zurück zur Anmeldung"],
    eyebrow: ["Acceso a TouchLine", "Accesso a TouchLine", "Accès à TouchLine", "الدخول إلى TouchLine", "TouchLine girişi", "TouchLine-Zugang"],
    title: ["Crear acceso a TouchLine", "Crea l’accesso a TouchLine", "Créer un accès à TouchLine", "إنشاء حساب للدخول إلى TouchLine", "TouchLine erişimi oluştur", "TouchLine-Zugang erstellen"],
    description: ["Crea un acceso seguro a TouchLine y entra en el entorno de tu plantilla.", "Crea un accesso sicuro a TouchLine ed entra nell’ambiente della tua rosa.", "Créez un accès sécurisé à TouchLine et entrez dans l’espace de votre effectif.", "أنشئ وصولًا آمنًا إلى TouchLine وادخل إلى مساحة قائمتك.", "TouchLine için güvenli erişim oluşturun ve kadro ortamınıza girin.", "Erstelle einen sicheren TouchLine-Zugang und betritt deinen Kaderbereich."],
    betaTitle: ["TouchLine · Acceso seguro", "TouchLine · Accesso sicuro", "TouchLine · Accès sécurisé", "TouchLine · دخول آمن", "TouchLine · Güvenli erişim", "TouchLine · Sicherer Zugang"],
    betaDescription: ["Crea tu cuenta, verifica tu identidad y entra en TouchLine. Tu cuenta y tu progreso permanecen protegidos.", "Crea il tuo account, verifica la tua identità ed entra in TouchLine. Account e progressi rimangono protetti.", "Créez votre compte, vérifiez votre identité et entrez dans TouchLine. Votre compte et votre progression restent protégés.", "أنشئ حسابك وتحقق من هويتك وادخل إلى TouchLine. يظل حسابك وتقدمك محميين.", "Hesabınızı oluşturun, kimliğinizi doğrulayın ve TouchLine’a girin. Hesabınız ve ilerlemeniz korunur.", "Erstelle dein Konto, bestätige deine Identität und betritt TouchLine. Dein Konto und dein Fortschritt bleiben geschützt."],
  },
  forgot: {
    back: ["Volver al acceso", "Torna all’accesso", "Retour à la connexion", "العودة إلى تسجيل الدخول", "Girişe dön", "Zurück zur Anmeldung"],
    eyebrow: ["Recuperación de cuenta", "Recupero dell’account", "Récupération du compte", "استعادة الحساب", "Hesap kurtarma", "Kontowiederherstellung"],
    title: ["Recupera tu carrera.", "Recupera la tua carriera.", "Retrouvez votre carrière.", "استعد مسيرتك.", "Kariyerinizi geri alın.", "Hole deine Karriere zurück."],
    description: ["Introduce tu correo y te enviaremos un enlace seguro para restablecer la contraseña.", "Inserisci la tua email e ti invieremo un link sicuro per reimpostare la password.", "Saisissez votre adresse e-mail et nous vous enverrons un lien sécurisé de réinitialisation.", "أدخل بريدك الإلكتروني وسنرسل إليك رابطًا آمنًا لإعادة تعيين كلمة المرور.", "E-posta adresinizi girin, size güvenli bir sıfırlama bağlantısı gönderelim.", "Gib deine E-Mail-Adresse ein. Wir senden dir einen sicheren Link zum Zurücksetzen."],
  },
  reset: {
    back: ["Volver al acceso", "Torna all’accesso", "Retour à la connexion", "العودة إلى تسجيل الدخول", "Girişe dön", "Zurück zur Anmeldung"],
    eyebrow: ["Recuperación segura", "Recupero sicuro", "Récupération sécurisée", "استعادة آمنة", "Güvenli kurtarma", "Sichere Wiederherstellung"],
    title: ["Establece una nueva contraseña.", "Imposta una nuova password.", "Définissez un nouveau mot de passe.", "عيّن كلمة مرور جديدة.", "Yeni bir parola belirleyin.", "Lege ein neues Passwort fest."],
    description: ["Elige una nueva contraseña para tu cuenta de TouchLine.", "Scegli una nuova password per il tuo account TouchLine.", "Choisissez un nouveau mot de passe pour votre compte TouchLine.", "اختر كلمة مرور جديدة لحسابك في TouchLine.", "TouchLine hesabınız için yeni bir parola seçin.", "Wähle ein neues Passwort für dein TouchLine-Konto."],
  },
  form: {
    firstName: ["Nombre", "Nome", "Prénom", "الاسم الأول", "Ad", "Vorname"],
    firstNamePlaceholder: ["Alex", "Alex", "Alex", "Alex", "Alex", "Alex"],
    lastName: ["Apellidos", "Cognome", "Nom", "اسم العائلة", "Soyad", "Nachname"],
    lastNamePlaceholder: ["Oliveira", "Oliveira", "Oliveira", "Oliveira", "Oliveira", "Oliveira"],
    fullName: ["Nombre completo", "Nome completo", "Nom complet", "الاسم الكامل", "Ad ve soyad", "Vollständiger Name"],
    fullNamePlaceholder: ["Alex Oliveira", "Alex Oliveira", "Alex Oliveira", "Alex Oliveira", "Alex Oliveira", "Alex Oliveira"],
    email: ["Correo electrónico", "Email", "Adresse e-mail", "البريد الإلكتروني", "E-posta", "E-Mail"],
    emailPlaceholder: ["nombre@example.com", "nome@example.com", "nom@example.com", "ism@example.com", "ad@example.com", "vorname@example.com"],
    password: ["Contraseña", "Password", "Mot de passe", "كلمة المرور", "Parola", "Passwort"],
    forgotPassword: ["¿Has olvidado tu contraseña?", "Password dimenticata?", "Mot de passe oublié ?", "هل نسيت كلمة المرور؟", "Parolanızı mı unuttunuz?", "Passwort vergessen?"],
    passwordPlaceholder: ["Al menos 8 caracteres", "Almeno 8 caratteri", "Au moins 8 caractères", "8 أحرف على الأقل", "En az 8 karakter", "Mindestens 8 Zeichen"],
    newPassword: ["Nueva contraseña", "Nuova password", "Nouveau mot de passe", "كلمة المرور الجديدة", "Yeni parola", "Neues Passwort"],
    confirmPassword: ["Confirmar nueva contraseña", "Conferma la nuova password", "Confirmer le nouveau mot de passe", "تأكيد كلمة المرور الجديدة", "Yeni parolayı doğrula", "Neues Passwort bestätigen"],
    updatePassword: ["Actualizar contraseña", "Aggiorna la password", "Mettre à jour le mot de passe", "تحديث كلمة المرور", "Parolayı güncelle", "Passwort aktualisieren"],
    showPassword: ["Mostrar contraseña", "Mostra la password", "Afficher le mot de passe", "إظهار كلمة المرور", "Parolayı göster", "Passwort anzeigen"],
    hidePassword: ["Ocultar contraseña", "Nascondi la password", "Masquer le mot de passe", "إخفاء كلمة المرور", "Parolayı gizle", "Passwort verbergen"],
    terms: ["Acepto los Términos y la Política de Privacidad. TouchLine mide el tiempo activo, el tipo de dispositivo y las áreas utilizadas para mejorar la experiencia de juego; nunca contraseñas, mensajes ni contenido escrito.", "Accetto i Termini e l’Informativa sulla privacy. TouchLine misura il tempo attivo, la categoria del dispositivo e le aree utilizzate per migliorare il gioco, mai password, messaggi o contenuti digitati.", "J’accepte les Conditions et la Politique de confidentialité. TouchLine mesure le temps actif, la catégorie d’appareil et les fonctionnalités utilisées pour améliorer le jeu, jamais les mots de passe, messages ou contenus saisis.", "أوافق على الشروط وسياسة الخصوصية. تقيس TouchLine وقت النشاط وفئة الجهاز وأقسام الميزات المستخدمة لتحسين اللعب، ولا تقيس أبدًا كلمات المرور أو الرسائل أو المحتوى المكتوب.", "Koşulları ve Gizlilik Politikasını kabul ediyorum. TouchLine, oynanışı iyileştirmek için etkin süreyi, cihaz sınıfını ve kullanılan özellik alanlarını ölçer; parolaları, mesajları veya yazılan içerikleri asla ölçmez.", "Ich stimme den Bedingungen und der Datenschutzerklärung zu. TouchLine misst aktive Zeit, Geräteklasse und genutzte Funktionsbereiche, um das Spielerlebnis zu verbessern – niemals Passwörter, Nachrichten oder eingegebene Inhalte."],
    signIn: ["Iniciar sesión", "Accedi", "Se connecter", "تسجيل الدخول", "Oturum aç", "Anmelden"],
    signingIn: ["Iniciando sesión…", "Accesso in corso…", "Connexion…", "جارٍ تسجيل الدخول…", "Oturum açılıyor…", "Anmeldung läuft…"],
    createAccount: ["Crear cuenta", "Crea un account", "Créer un compte", "إنشاء حساب", "Hesap oluştur", "Konto erstellen"],
    sendReset: ["Enviar enlace de recuperación", "Invia il link di ripristino", "Envoyer le lien de réinitialisation", "إرسال رابط إعادة التعيين", "Sıfırlama bağlantısı gönder", "Link zum Zurücksetzen senden"],
    watchWithoutLogin: ["Explorar un club público", "Esplora un club pubblico", "Explorer un club public", "استكشاف نادٍ متاح للجميع", "Herkese açık bir kulübü keşfet", "Öffentlichen Verein erkunden"],
    newToTouchLine: ["¿Nuevo en TouchLine?", "Nuovo su TouchLine?", "Vous découvrez TouchLine ?", "هل أنت جديد في TouchLine؟", "TouchLine’da yeni misiniz?", "Neu bei TouchLine?"],
    createAccess: ["Crear cuenta", "Crea un account", "Créer un compte", "إنشاء حساب", "Hesap oluştur", "Konto erstellen"],
    alreadyRegistered: ["¿Ya tienes cuenta?", "Hai già un account?", "Déjà inscrit ?", "هل لديك حساب بالفعل؟", "Zaten kayıtlı mısınız?", "Bereits registriert?"],
    accessAccount: ["Iniciar sesión", "Accedi", "Se connecter", "تسجيل الدخول", "Oturum aç", "Anmelden"],
    continueWith: ["o continúa con", "oppure continua con", "ou continuer avec", "أو المتابعة باستخدام", "veya şununla devam et", "oder fortfahren mit"],
    continueWithGoogle: ["Continuar con Google", "Continua con Google", "Continuer avec Google", "المتابعة باستخدام Google", "Google ile devam et", "Mit Google fortfahren"],
    continueWithApple: ["Continuar con Apple", "Continua con Apple", "Continuer avec Apple", "المتابعة باستخدام Apple", "Apple ile devam et", "Mit Apple fortfahren"],
    continueWithFacebook: ["Continuar con Facebook", "Continua con Facebook", "Continuer avec Facebook", "المتابعة باستخدام Facebook", "Facebook ile devam et", "Mit Facebook fortfahren"],
    registrationCompleteEyebrow: ["Verificación segura", "Verifica sicura", "Vérification sécurisée", "تحقق آمن", "Güvenli doğrulama", "Sichere Bestätigung"],
    registrationCompleteTitle: ["Revisa tu correo", "Controlla la tua email", "Consultez vos e-mails", "تحقق من بريدك الإلكتروني", "E-postanızı kontrol edin", "Prüfe deine E-Mails"],
    registrationCompleteDescription: ["Si esta es una cuenta nueva, hemos enviado un enlace seguro de confirmación a:", "Se si tratta di un nuovo account, abbiamo inviato un link di conferma sicuro a:", "S’il s’agit d’un nouveau compte, nous avons envoyé un lien de confirmation sécurisé à :", "إذا كان هذا حسابًا جديدًا، فقد أرسلنا رابط تأكيد آمنًا إلى:", "Bu yeni bir hesapsa şu adrese güvenli bir onay bağlantısı gönderdik:", "Falls dies ein neues Konto ist, haben wir einen sicheren Bestätigungslink gesendet an:"],
    registrationCompleteHint: ["Abre el mensaje y confirma tu correo para entrar en TouchLine. Revisa el correo no deseado si es necesario. Si este correo ya tiene cuenta, inicia sesión o recupera tu contraseña.", "Apri il messaggio e conferma la tua email per entrare in TouchLine. Controlla lo spam se necessario. Se questa email ha già un account, accedi o recupera la password.", "Ouvrez le message et confirmez votre adresse pour entrer dans TouchLine. Vérifiez les indésirables si nécessaire. Si cette adresse possède déjà un compte, connectez-vous ou récupérez votre mot de passe.", "افتح الرسالة وأكد بريدك الإلكتروني للدخول إلى TouchLine. تحقق من مجلد الرسائل غير المرغوب فيها عند الحاجة. إذا كان لهذا البريد حساب بالفعل، فسجّل الدخول أو استعد كلمة المرور.", "TouchLine’a girmek için mesajı açıp e-postanızı onaylayın. Gerekirse spam klasörünü kontrol edin. Bu e-posta zaten bir hesaba bağlıysa oturum açın veya parolanızı kurtarın.", "Öffne die Nachricht und bestätige deine E-Mail-Adresse, um TouchLine zu betreten. Prüfe bei Bedarf den Spamordner. Falls bereits ein Konto besteht, melde dich an oder setze dein Passwort zurück."],
    resendConfirmation: ["Reenviar correo de confirmación", "Invia di nuovo l’email di conferma", "Renvoyer l’e-mail de confirmation", "إعادة إرسال رسالة التأكيد", "Onay e-postasını yeniden gönder", "Bestätigungs-E-Mail erneut senden"],
    confirmationResent: ["Correo de confirmación reenviado. Revisa la bandeja de entrada y el correo no deseado.", "Email di conferma inviata di nuovo. Controlla la posta in arrivo e lo spam.", "E-mail de confirmation renvoyé. Consultez votre boîte de réception et vos indésirables.", "أُعيد إرسال رسالة التأكيد. تحقق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها.", "Onay e-postası yeniden gönderildi. Gelen kutunuzu ve spam klasörünü kontrol edin.", "Bestätigungs-E-Mail erneut gesendet. Prüfe deinen Posteingang und Spamordner."],
    confirmationResendFailed: ["No hemos podido reenviar el correo de confirmación. Espera un momento e inténtalo de nuevo.", "Non è stato possibile inviare di nuovo l’email di conferma. Attendi un momento e riprova.", "Impossible de renvoyer l’e-mail de confirmation. Patientez un instant et réessayez.", "تعذر إعادة إرسال رسالة التأكيد. انتظر قليلًا وحاول مجددًا.", "Onay e-postası yeniden gönderilemedi. Biraz bekleyip tekrar deneyin.", "Die Bestätigungs-E-Mail konnte nicht erneut gesendet werden. Warte einen Moment und versuche es erneut."],
    useAnotherEmail: ["Usar otro correo", "Usa un’altra email", "Utiliser une autre adresse e-mail", "استخدام بريد إلكتروني آخر", "Başka bir e-posta kullan", "Andere E-Mail-Adresse verwenden"],
    confirmationLinkError: ["Este enlace de confirmación no es válido o ha caducado. Solicita un nuevo correo o inicia sesión si tu cuenta ya está confirmada.", "Questo link di conferma non è valido o è scaduto. Richiedi una nuova email o accedi se il tuo account è già confermato.", "Ce lien de confirmation est invalide ou a expiré. Demandez un nouvel e-mail ou connectez-vous si votre compte est déjà confirmé.", "رابط التأكيد غير صالح أو انتهت صلاحيته. اطلب رسالة جديدة أو سجّل الدخول إذا كان حسابك مؤكدًا بالفعل.", "Bu onay bağlantısı geçersiz veya süresi dolmuş. Yeni bir e-posta isteyin ya da hesabınız onaylıysa oturum açın.", "Dieser Bestätigungslink ist ungültig oder abgelaufen. Fordere eine neue E-Mail an oder melde dich an, falls dein Konto bereits bestätigt ist."],
    authenticationUnavailable: ["El servicio de autenticación no está disponible. Inténtalo más tarde.", "Il servizio di autenticazione non è disponibile. Riprova più tardi.", "Le service d’authentification est indisponible. Réessayez plus tard.", "خدمة المصادقة غير متاحة. يرجى المحاولة لاحقًا.", "Kimlik doğrulama hizmeti kullanılamıyor. Lütfen daha sonra tekrar deneyin.", "Der Anmeldedienst ist nicht verfügbar. Versuche es später erneut."],
    invalidCredentials: ["Comprueba tu correo y contraseña e inténtalo de nuevo.", "Controlla email e password e riprova.", "Vérifiez votre adresse e-mail et votre mot de passe, puis réessayez.", "تحقق من بريدك الإلكتروني وكلمة المرور وحاول مجددًا.", "E-posta ve parolanızı kontrol edip tekrar deneyin.", "Prüfe E-Mail-Adresse und Passwort und versuche es erneut."],
    emailNotConfirmed: ["Confirma tu correo antes de entrar en TouchLine.", "Conferma la tua email prima di entrare in TouchLine.", "Confirmez votre adresse e-mail avant d’entrer dans TouchLine.", "أكد بريدك الإلكتروني قبل الدخول إلى TouchLine.", "TouchLine’a girmeden önce e-postanızı onaylayın.", "Bestätige deine E-Mail-Adresse, bevor du TouchLine betrittst."],
    accountDisabled: ["Esta cuenta está desactivada. Contacta con el soporte de TouchLine.", "Questo account è disattivato. Contatta l’assistenza TouchLine.", "Ce compte est désactivé. Contactez l’assistance TouchLine.", "هذا الحساب معطل. تواصل مع دعم TouchLine.", "Bu hesap devre dışı. TouchLine desteğiyle iletişime geçin.", "Dieses Konto ist deaktiviert. Wende dich an den TouchLine-Support."],
    profileSetupFailed: ["Tu cuenta se ha verificado, pero no se ha podido preparar el acceso a TouchLine. Inténtalo de nuevo en breve.", "Il tuo account è stato verificato, ma non è stato possibile preparare l’accesso a TouchLine. Riprova tra poco.", "Votre compte a été vérifié, mais l’accès à TouchLine n’a pas pu être préparé. Réessayez dans un instant.", "تم التحقق من حسابك، لكن تعذر إعداد الدخول إلى TouchLine. حاول مجددًا بعد قليل.", "Hesabınız doğrulandı ancak TouchLine erişimi hazırlanamadı. Kısa süre sonra tekrar deneyin.", "Dein Konto wurde bestätigt, aber der TouchLine-Zugang konnte nicht vorbereitet werden. Versuche es gleich erneut."],
    sessionCookieFailure: ["No se ha podido crear tu sesión segura. Inténtalo de nuevo en este navegador.", "Non è stato possibile creare la sessione sicura. Riprova in questo browser.", "Votre session sécurisée n’a pas pu être créée. Réessayez dans ce navigateur.", "تعذر إنشاء جلستك الآمنة. حاول مجددًا في هذا المتصفح.", "Güvenli oturumunuz oluşturulamadı. Bu tarayıcıda tekrar deneyin.", "Deine sichere Sitzung konnte nicht erstellt werden. Versuche es in diesem Browser erneut."],
    welcomeUnavailable: ["No se ha podido completar el acceso a TouchLine.", "Impossibile completare l’accesso a TouchLine.", "Impossible de terminer l’accès à TouchLine.", "تعذر إكمال الدخول إلى TouchLine.", "TouchLine erişimi tamamlanamadı.", "Der TouchLine-Zugang konnte nicht abgeschlossen werden."],
    accountCreated: ["Cuenta creada. Revisa tu correo para confirmarla.", "Account creato. Controlla la tua email per confermarlo.", "Compte créé. Consultez vos e-mails pour le confirmer.", "تم إنشاء الحساب. تحقق من بريدك الإلكتروني للتأكيد.", "Hesap oluşturuldu. Onaylamak için e-postanızı kontrol edin.", "Konto erstellt. Prüfe deine E-Mails zur Bestätigung."],
    resetSent: ["Instrucciones de recuperación enviadas. Revisa la bandeja de entrada.", "Istruzioni di ripristino inviate. Controlla la posta in arrivo.", "Instructions de réinitialisation envoyées. Consultez votre boîte de réception.", "تم إرسال تعليمات إعادة التعيين. تحقق من صندوق الوارد.", "Sıfırlama talimatları gönderildi. Gelen kutunuzu kontrol edin.", "Anleitung zum Zurücksetzen gesendet. Prüfe deinen Posteingang."],
    recoveryChecking: ["Comprobando tu sesión segura de recuperación…", "Verifica della sessione di recupero sicura…", "Vérification de votre session de récupération sécurisée…", "جارٍ التحقق من جلسة الاستعادة الآمنة…", "Güvenli kurtarma oturumunuz kontrol ediliyor…", "Deine sichere Wiederherstellungssitzung wird geprüft…"],
    recoveryInvalid: ["Este enlace de recuperación no es válido o ha caducado. Solicita uno nuevo para continuar.", "Questo link di recupero non è valido o è scaduto. Richiedi un nuovo link per continuare.", "Ce lien de récupération est invalide ou a expiré. Demandez un nouveau lien pour continuer.", "رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا للمتابعة.", "Bu kurtarma bağlantısı geçersiz veya süresi dolmuş. Devam etmek için yeni bir bağlantı isteyin.", "Dieser Wiederherstellungslink ist ungültig oder abgelaufen. Fordere einen neuen Link an, um fortzufahren."],
    recoveryMismatch: ["Las contraseñas no coinciden.", "Le password non coincidono.", "Les mots de passe ne correspondent pas.", "كلمتا المرور غير متطابقتين.", "Parolalar eşleşmiyor.", "Die Passwörter stimmen nicht überein."],
    recoveryUpdated: ["Contraseña actualizada de forma segura.", "Password aggiornata in sicurezza.", "Mot de passe mis à jour en toute sécurité.", "تم تحديث كلمة المرور بأمان.", "Parola güvenle güncellendi.", "Passwort sicher aktualisiert."],
    requestNewReset: ["Solicitar nuevo enlace de recuperación", "Richiedi un nuovo link di recupero", "Demander un nouveau lien de récupération", "طلب رابط استعادة جديد", "Yeni kurtarma bağlantısı iste", "Neuen Wiederherstellungslink anfordern"],
    enterArena: ["Entrar en TouchLine", "Entra in TouchLine", "Entrer dans TouchLine", "الدخول إلى TouchLine", "TouchLine’a gir", "TouchLine betreten"],
    genericError: ["Algo ha salido mal.", "Si è verificato un errore.", "Une erreur est survenue.", "حدث خطأ ما.", "Bir sorun oluştu.", "Etwas ist schiefgegangen."],
  },
} satisfies TranslationRows<AuthCatalogue>;

function projectRows(value: unknown, index: number): unknown {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[index] : value.map((item) => projectRows(item, index));
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, projectRows(child, index)]));
}

/** All values originate in the explicit translation rows; no English catalogue is loaded. */
export const touchlineAuthDrafts = Object.fromEntries(
  TOUCHLINE_DRAFT_LOCALES.map((locale, index) => [locale, projectRows(rows, index)]),
) as Record<TouchlineDraftLocale, AuthCatalogue>;
