import styles from "./loading.module.css";

export default function ClubHubLoading() {
  return (
    <main className={styles.shell} aria-busy="true" aria-label="Carregando ClubHub">
      <div className={styles.nav} aria-hidden="true" />
      <section className={styles.hero} aria-hidden="true">
        <div className={styles.crest} />
        <div className={styles.copy}>
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className={styles.pitch} aria-hidden="true" />
      <section className={styles.panel} aria-hidden="true">
        <span />
        <span />
      </section>
      <span className="sr-only" role="status">Carregando ClubHub</span>
    </main>
  );
}
