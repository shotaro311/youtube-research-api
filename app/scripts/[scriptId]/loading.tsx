import styles from "./page.module.css";

export default function Loading(): React.JSX.Element {
  return (
    <main className={styles.loadingPage}>
      <div className={styles.loadingShell}>
        <section className={styles.loadingCard}>
          <div className={styles.loadingHeader}>
            <div className={`${styles.loadingPulse} ${styles.loadingLineLg}`} />
            <div className={`${styles.loadingPulse} ${styles.loadingLineMd}`} />
          </div>
        </section>

        <section className={styles.loadingCard}>
          <div className={styles.loadingTabs}>
            <div className={`${styles.loadingPulse} ${styles.loadingTab}`} />
            <div className={`${styles.loadingPulse} ${styles.loadingTab}`} />
          </div>
          <div className={styles.loadingContent}>
            <div className={`${styles.loadingPulse} ${styles.loadingPanel}`} />
            <div className={`${styles.loadingPulse} ${styles.loadingPanel}`} />
            <div className={`${styles.loadingPulse} ${styles.loadingPanel}`} />
          </div>
        </section>
      </div>
    </main>
  );
}
