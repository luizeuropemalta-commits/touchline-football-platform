import TouchlineCoachCategoryShowcase from "../../components/touchline/TouchlineCoachCategoryShowcase";
import styles from "../../app/touchline-clubs/touchline-clubs.module.css";

// Real gallery/representative selector and real directory sizing. Explicitly
// unavailable ranking uses the product's saved local representatives; this
// does not establish present-day standings, a server route or QA correctness.
export default function CoachGalleryFrameDensityBrowserFixture() {
  return <main className={styles.shell} dir="ltr">
    <div className={styles.content} data-gallery-directory-content>
      <TouchlineCoachCategoryShowcase locale="en-GB" playerCards={[]} coachRanking={{
        phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null,
        fixtureIds: [], generatedAt: null, rows: [],
      }} />
    </div>
  </main>;
}
