import styles from "./TouchlineAccountLoading.module.css";

const loadingCopy = {
  "en-GB": "Loading your account…",
  "pt-BR": "Carregando sua conta…",
  "es-ES": "Cargando tu cuenta…",
  "it-IT": "Caricamento del tuo account…",
  "fr-FR": "Chargement de votre compte…",
  "ar-SA": "جارٍ تحميل حسابك…",
  "tr-TR": "Hesabınız yükleniyor…",
  "de-DE": "Dein Konto wird geladen…",
} as const;

export default function TouchlineAccountLoading({ contentOnly = false }: { contentOnly?: boolean } = {}) {
  const Container = contentOnly ? "div" : "main";
  return <Container className={contentOnly ? `${styles.loading} ${styles.contentLoading}` : styles.loading} aria-busy="true" aria-label="TouchLine">
    <div className={styles.brand} role="status" aria-live="polite" aria-atomic="true">
      {!contentOnly ? <strong>TouchLine</strong> : null}
      {/* The root document already owns the current locale. CSS selects one
          message immediately, without fetching or delaying this fallback. */}
      {Object.entries(loadingCopy).map(([locale, label]) => <span key={locale}
        className={styles.statusText} lang={locale} dir={locale === "ar-SA" ? "rtl" : "ltr"}>{label}</span>)}
    </div>
  </Container>;
}
